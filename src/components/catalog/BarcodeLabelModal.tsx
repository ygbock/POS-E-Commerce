import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Printer,
  QrCode,
  Barcode as BarcodeIcon,
  Copy,
  Check,
  Tag,
  RefreshCw,
  Sparkles,
  Save,
  Sliders,
  Layers,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Boxes,
  Maximize2,
  Minimize2,
  Upload,
  FileSpreadsheet,
  FileText,
  ListChecks,
  Download,
  Search,
  Filter,
  CheckSquare,
  Square,
  ArrowRight,
  HelpCircle,
  Minus,
  Bookmark,
  FolderPlus,
  Info,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import { Product, ProductVariant } from '../../types';
import { useCommerce } from '../../context/CommerceContext';

interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  variant?: ProductVariant | null;
}

export type BarcodeFormat = 'EAN13' | 'UPCA' | 'EAN8' | 'CODE128' | 'CODE39' | 'QR';
export type LabelTemplate = '58x40' | '38x25' | '70x48' | '100x75' | 'a4_sheet';

export interface SavedLabelTemplateConfig {
  labelTemplate: LabelTemplate;
  barcodeFormat: BarcodeFormat;
  barcodeBarHeight: number;
  barcodeBarWidth: number;
  showProdTitle: boolean;
  showBrand: boolean;
  showVariantName: boolean;
  showSku: boolean;
  showPrice: boolean;
  showMsrp: boolean;
  showBarcodeText: boolean;
  customFooterText: string;
}

export interface SavedLabelTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Retail' | 'Shipping' | 'Shelf' | 'Jewelry' | 'Promo' | 'Custom';
  isPredefined?: boolean;
  config: SavedLabelTemplateConfig;
}

export const PREDEFINED_LABEL_TEMPLATES: SavedLabelTemplate[] = [
  {
    id: 'template-standard-retail',
    name: 'Standard Price Tag (58×40mm)',
    description: 'Default retail price tag with Title, SKU, Retail Price, MSRP, and POS barcode.',
    category: 'Retail',
    isPredefined: true,
    config: {
      labelTemplate: '58x40',
      barcodeFormat: 'EAN13',
      barcodeBarHeight: 50,
      barcodeBarWidth: 1.8,
      showProdTitle: true,
      showBrand: true,
      showVariantName: true,
      showSku: true,
      showPrice: true,
      showMsrp: true,
      showBarcodeText: true,
      customFooterText: 'SCAN FOR POS CHECKOUT',
    },
  },
  {
    id: 'template-shipping-pallet',
    name: 'Shipping / Pallet Label (100×75mm)',
    description: 'Large high-density warehouse label with CODE128 for logistics camera scanners.',
    category: 'Shipping',
    isPredefined: true,
    config: {
      labelTemplate: '100x75',
      barcodeFormat: 'CODE128',
      barcodeBarHeight: 75,
      barcodeBarWidth: 2.4,
      showProdTitle: true,
      showBrand: true,
      showVariantName: true,
      showSku: true,
      showPrice: false,
      showMsrp: false,
      showBarcodeText: true,
      customFooterText: 'DISPATCH / PALLET TAG',
    },
  },
  {
    id: 'template-shelf-talker',
    name: 'Shelf Edge / Talker Label (70×48mm)',
    description: 'Medium shelf tag featuring bold price display, comparison MSRP, and aisle location.',
    category: 'Shelf',
    isPredefined: true,
    config: {
      labelTemplate: '70x48',
      barcodeFormat: 'EAN13',
      barcodeBarHeight: 55,
      barcodeBarWidth: 1.8,
      showProdTitle: true,
      showBrand: true,
      showVariantName: true,
      showSku: true,
      showPrice: true,
      showMsrp: true,
      showBarcodeText: true,
      customFooterText: 'SHELF LOCATION: A-12',
    },
  },
  {
    id: 'template-jewelry-tag',
    name: 'Jewelry / Small Item Tag (38×25mm)',
    description: 'Compact tag for apparel accessories, rings, cosmetics, or small retail goods.',
    category: 'Jewelry',
    isPredefined: true,
    config: {
      labelTemplate: '38x25',
      barcodeFormat: 'EAN8',
      barcodeBarHeight: 35,
      barcodeBarWidth: 1.2,
      showProdTitle: true,
      showBrand: false,
      showVariantName: false,
      showSku: true,
      showPrice: true,
      showMsrp: false,
      showBarcodeText: true,
      customFooterText: '',
    },
  },
  {
    id: 'template-clearance-promo',
    name: 'Clearance & Promo Tag (58×40mm)',
    description: 'High-contrast promotional tag with crossed-out MSRP and special offer badge.',
    category: 'Promo',
    isPredefined: true,
    config: {
      labelTemplate: '58x40',
      barcodeFormat: 'UPCA',
      barcodeBarHeight: 45,
      barcodeBarWidth: 1.8,
      showProdTitle: true,
      showBrand: false,
      showVariantName: true,
      showSku: true,
      showPrice: true,
      showMsrp: true,
      showBarcodeText: true,
      customFooterText: 'CLEARANCE - SPECIAL OFFER',
    },
  },
  {
    id: 'template-qr-digital',
    name: '2D QR Digital Spec Tag (58×40mm)',
    description: '2D Matrix QR tag for quick customer mobile scanning or digital inventory spec sheets.',
    category: 'Retail',
    isPredefined: true,
    config: {
      labelTemplate: '58x40',
      barcodeFormat: 'QR',
      barcodeBarHeight: 60,
      barcodeBarWidth: 1.8,
      showProdTitle: true,
      showBrand: true,
      showVariantName: true,
      showSku: true,
      showPrice: true,
      showMsrp: false,
      showBarcodeText: true,
      customFooterText: 'SCAN QR FOR SPEC SHEET',
    },
  },
];

interface BatchItem {
  product: Product;
  variant: ProductVariant;
  copies: number;
}

interface ParsedCsvRow {
  sku: string;
  barcode: string;
  name: string;
  variantName: string;
  price: number;
  copies: number;
  matchedProduct?: Product;
  matchedVariant?: ProductVariant;
  isCatalogMatch: boolean;
}

// Checksum Helpers for EAN/UPC
function calculateEAN13CheckDigit(first12: string): string {
  const clean = first12.replace(/\D/g, '').slice(0, 12);
  if (clean.length < 12) return '0';
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const num = parseInt(clean[i], 10);
    sum += i % 2 === 0 ? num : num * 3;
  }
  const remainder = sum % 10;
  return remainder === 0 ? '0' : (10 - remainder).toString();
}

function generateRandomEAN13(): string {
  // GS1 Prefix 200-299 for internal retail store barcodes
  const prefix = '200';
  let middle = '';
  for (let i = 0; i < 9; i++) {
    middle += Math.floor(Math.random() * 10).toString();
  }
  const base12 = prefix + middle;
  const checkDigit = calculateEAN13CheckDigit(base12);
  return base12 + checkDigit;
}

function calculateUPCACheckDigit(first11: string): string {
  const clean = first11.replace(/\D/g, '').slice(0, 11);
  if (clean.length < 11) return '0';
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const num = parseInt(clean[i], 10);
    sum += i % 2 === 0 ? num * 3 : num;
  }
  const remainder = sum % 10;
  return remainder === 0 ? '0' : (10 - remainder).toString();
}

function generateRandomUPCA(): string {
  let first11 = '0'; // standard UPC-A prefix
  for (let i = 0; i < 10; i++) {
    first11 += Math.floor(Math.random() * 10).toString();
  }
  const checkDigit = calculateUPCACheckDigit(first11);
  return first11 + checkDigit;
}

// Download Sample CSV Helper
function downloadSampleCsv() {
  const content = `sku,barcode,name,variant,price,copies
APP-TSH-BLK-S,2001002003001,Signature Cotton Tee,Black / Small,29.99,5
ELE-WCH-SLV-40,2001002003002,Smart Watch Series X,Silver / 40mm,299.00,3
ACC-LEATH-WLT,2001002003003,Leather Minimalist Wallet,Tan Leather,45.00,10
DESK-MAT-GRY,2001002003004,Minimal Felt Desk Mat,Charcoal Gray,35.00,2`;

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'barcode_labels_sample.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// CSV Parser Helper
function parseCsvText(
  csvText: string,
  catalogProducts: Product[]
): { rows: ParsedCsvRow[]; errors: string[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ['CSV file is empty.'] };
  }

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());

  const skuIdx = headers.findIndex((h) => h.includes('sku') || h.includes('code'));
  const barcodeIdx = headers.findIndex(
    (h) => h.includes('barcode') || h.includes('upc') || h.includes('ean')
  );
  const nameIdx = headers.findIndex(
    (h) => h.includes('name') || h.includes('title') || h.includes('product') || h.includes('item')
  );
  const variantIdx = headers.findIndex(
    (h) => h.includes('variant') || h.includes('option') || h.includes('size') || h.includes('color')
  );
  const priceIdx = headers.findIndex(
    (h) => h.includes('price') || h.includes('msrp') || h.includes('cost')
  );
  const copiesIdx = headers.findIndex(
    (h) => h.includes('copies') || h.includes('qty') || h.includes('quantity') || h.includes('count')
  );

  const rows: ParsedCsvRow[] = [];
  const errors: string[] = [];

  const skuMap = new Map<string, { p: Product; v: ProductVariant }>();
  const barcodeMap = new Map<string, { p: Product; v: ProductVariant }>();

  catalogProducts.forEach((p) => {
    p.variants.forEach((v) => {
      if (v.sku) skuMap.set(v.sku.toLowerCase(), { p, v });
      if (v.barcode) barcodeMap.set(v.barcode.toLowerCase(), { p, v });
    });
  });

  const startIndex = headers.some((h) =>
    ['sku', 'barcode', 'name', 'price', 'copies', 'qty'].includes(h)
  )
    ? 1
    : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const rawCols = parseLine(lines[i]);
    if (rawCols.length === 0 || rawCols.every((c) => c === '')) continue;

    const skuVal = skuIdx >= 0 ? rawCols[skuIdx] || '' : rawCols[0] || '';
    const barcodeVal = barcodeIdx >= 0 ? rawCols[barcodeIdx] || '' : rawCols[1] || '';
    const nameVal = nameIdx >= 0 ? rawCols[nameIdx] || '' : rawCols[2] || `Item ${i}`;
    const variantVal = variantIdx >= 0 ? rawCols[variantIdx] || '' : rawCols[3] || 'Standard';
    const priceVal = priceIdx >= 0 ? parseFloat(rawCols[priceIdx]) || 0 : 0;
    const copiesVal = copiesIdx >= 0 ? parseInt(rawCols[copiesIdx], 10) || 1 : 1;

    let match = skuVal ? skuMap.get(skuVal.toLowerCase()) : undefined;
    if (!match && barcodeVal) {
      match = barcodeMap.get(barcodeVal.toLowerCase());
    }

    if (match) {
      rows.push({
        sku: match.v.sku || skuVal,
        barcode: match.v.barcode || barcodeVal,
        name: match.p.name,
        variantName: match.v.name,
        price: match.v.retailPrice || priceVal,
        copies: Math.max(1, copiesVal),
        matchedProduct: match.p,
        matchedVariant: match.v,
        isCatalogMatch: true,
      });
    } else {
      rows.push({
        sku: skuVal || `SKU-CSV-${i}`,
        barcode: barcodeVal || skuVal || generateRandomEAN13(),
        name: nameVal,
        variantName: variantVal,
        price: priceVal,
        copies: Math.max(1, copiesVal),
        isCatalogMatch: false,
      });
    }
  }

  if (rows.length === 0) {
    errors.push('No valid label rows could be parsed from the CSV file.');
  }

  return { rows, errors };
}

// Inner SVG Barcode Component using JsBarcode and QRCodeSVG
const BarcodeSvgRenderer: React.FC<{
  value: string;
  format: BarcodeFormat;
  height?: number;
  barWidth?: number;
  displayValue?: boolean;
  className?: string;
}> = ({ value, format, height = 50, barWidth = 1.8, displayValue = true, className = 'w-full' }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    setRenderError(false);
    if (!svgRef.current || format === 'QR') return;

    const tryRender = (fmt: string) => {
      try {
        JsBarcode(svgRef.current, value || '123456789', {
          format: fmt,
          width: barWidth,
          height: height,
          displayValue: displayValue,
          font: 'monospace',
          fontSize: 12,
          fontOptions: 'bold',
          textMargin: 3,
          margin: 6,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (err) {
        setRenderError(true);
        try {
          JsBarcode(svgRef.current, value || '123456789', {
            format: 'CODE128',
            width: barWidth,
            height: height,
            displayValue: displayValue,
            font: 'monospace',
            fontSize: 12,
            fontOptions: 'bold',
            textMargin: 3,
            margin: 6,
            background: '#ffffff',
            lineColor: '#000000',
          });
        } catch (e) {
          // Ignore fallback error
        }
      }
    };

    let jsFormat = 'CODE128';
    if (format === 'EAN13') {
      jsFormat = /^\d{13}$/.test(value) ? 'EAN13' : 'CODE128';
    } else if (format === 'UPCA') {
      jsFormat = /^\d{12}$/.test(value) ? 'UPC' : 'CODE128';
    } else if (format === 'EAN8') {
      jsFormat = /^\d{8}$/.test(value) ? 'EAN8' : 'CODE128';
    } else if (format === 'CODE39') {
      jsFormat = 'CODE39';
    } else {
      jsFormat = 'CODE128';
    }

    tryRender(jsFormat);
  }, [value, format, height, barWidth, displayValue]);

  if (format === 'QR') {
    return (
      <div className="flex flex-col items-center justify-center p-2.5 bg-white rounded-lg border border-slate-200 shadow-xs">
        <QRCodeSVG
          value={value || '123456789'}
          size={Math.max(80, Math.min(160, height * 1.8))}
          level="M"
          marginSize={2}
          fgColor="#000000"
          bgColor="#ffffff"
        />
        {displayValue && (
          <span className="text-[10px] font-mono mt-1 text-slate-800 font-bold">{value}</span>
        )}
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="flex flex-col items-center justify-center p-3 border border-dashed border-amber-300 bg-white rounded-lg text-amber-800 text-xs text-center shadow-xs">
        <AlertCircle className="w-4 h-4 mb-1 text-amber-500" />
        <span className="font-semibold text-[11px]">Format warning for "{value}". Showing CODE128 fallback.</span>
        <svg ref={svgRef} className={className}></svg>
      </div>
    );
  }

  return (
    <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col items-center justify-center shadow-xs overflow-hidden w-full">
      <svg ref={svgRef} className={className}></svg>
    </div>
  );
};

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  product,
  variant,
}) => {
  const { formatCurrency, products, updateProduct, getTotalStockForVariant, logAuditAction } = useCommerce();

  // Mode: Single item generator or Batch queue printer
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');

  // Single Product State
  const [selectedProductId, setSelectedProductId] = useState<string>(
    product?.id || products[0]?.id || ''
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    variant?.id || product?.variants[0]?.id || products[0]?.variants[0]?.id || ''
  );

  const currentProd = products.find((p) => p.id === selectedProductId) || product || products[0];
  const currentVar =
    currentProd?.variants.find((v) => v.id === selectedVariantId) || variant || currentProd?.variants[0];

  // Barcode & Label Properties
  const [barcodeValue, setBarcodeValue] = useState<string>('');
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>('EAN13');
  const [labelTemplate, setLabelTemplate] = useState<LabelTemplate>('58x40');
  const [copies, setCopies] = useState<number>(1);

  // Dimension Controls
  const [barcodeBarHeight, setBarcodeBarHeight] = useState<number>(50);
  const [barcodeBarWidth, setBarcodeBarWidth] = useState<number>(1.8);
  const [previewZoom, setPreviewZoom] = useState<number>(100);

  // Field Toggles
  const [showProdTitle, setShowProdTitle] = useState(true);
  const [showBrand, setShowBrand] = useState(true);
  const [showVariantName, setShowVariantName] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showMsrp, setShowMsrp] = useState(true);
  const [showBarcodeText, setShowBarcodeText] = useState(true);
  const [customFooterText, setCustomFooterText] = useState('SCAN FOR POS CHECKOUT');

  // Batch Queue State
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);

  // UI status
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [savedToCatalog, setSavedToCatalog] = useState(false);

  // --- SAVED TEMPLATES STATE & HANDLERS ---
  const [userCustomTemplates, setUserCustomTemplates] = useState<SavedLabelTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('barcode_saved_label_templates_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('template-standard-retail');
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState<
    'Retail' | 'Shipping' | 'Shelf' | 'Jewelry' | 'Promo' | 'Custom'
  >('Custom');
  const [templateToast, setTemplateToast] = useState<string | null>(null);

  const allTemplates = [...PREDEFINED_LABEL_TEMPLATES, ...userCustomTemplates];
  const activeTemplate =
    allTemplates.find((t) => t.id === selectedTemplateId) || PREDEFINED_LABEL_TEMPLATES[0];

  // Handler to apply a selected label template layout
  const handleSelectTemplate = (templateId: string) => {
    const target = allTemplates.find((t) => t.id === templateId);
    if (!target) return;

    setSelectedTemplateId(templateId);
    setLabelTemplate(target.config.labelTemplate);
    setBarcodeFormat(target.config.barcodeFormat);
    setBarcodeBarHeight(target.config.barcodeBarHeight);
    setBarcodeBarWidth(target.config.barcodeBarWidth);
    setShowProdTitle(target.config.showProdTitle);
    setShowBrand(target.config.showBrand);
    setShowVariantName(target.config.showVariantName);
    setShowSku(target.config.showSku);
    setShowPrice(target.config.showPrice);
    setShowMsrp(target.config.showMsrp);
    setShowBarcodeText(target.config.showBarcodeText);
    setCustomFooterText(target.config.customFooterText);

    setTemplateToast(`Applied layout template: "${target.name}"`);
    setTimeout(() => setTemplateToast(null), 2500);
  };

  // Handler to save current layout configuration as a new custom template
  const handleSaveNewTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTemplateName.trim() || `Custom Template ${userCustomTemplates.length + 1}`;
    const newTemplate: SavedLabelTemplate = {
      id: `custom-template-${Date.now()}`,
      name,
      description: newTemplateDesc.trim() || 'Custom user defined label design',
      category: newTemplateCategory,
      isPredefined: false,
      config: {
        labelTemplate,
        barcodeFormat,
        barcodeBarHeight,
        barcodeBarWidth,
        showProdTitle,
        showBrand,
        showVariantName,
        showSku,
        showPrice,
        showMsrp,
        showBarcodeText,
        customFooterText,
      },
    };

    const nextUserTemplates = [newTemplate, ...userCustomTemplates];
    setUserCustomTemplates(nextUserTemplates);
    try {
      localStorage.setItem(
        'barcode_saved_label_templates_v1',
        JSON.stringify(nextUserTemplates)
      );
    } catch (err) {
      console.error('Failed to persist custom label template:', err);
    }

    setSelectedTemplateId(newTemplate.id);
    setIsSaveTemplateModalOpen(false);
    setNewTemplateName('');
    setNewTemplateDesc('');

    setTemplateToast(`Saved current layout as template "${name}"!`);
    setTimeout(() => setTemplateToast(null), 2500);
  };

  // Handler to delete custom template
  const handleDeleteCustomTemplate = (templateId: string) => {
    const nextUserTemplates = userCustomTemplates.filter((t) => t.id !== templateId);
    setUserCustomTemplates(nextUserTemplates);
    try {
      localStorage.setItem(
        'barcode_saved_label_templates_v1',
        JSON.stringify(nextUserTemplates)
      );
    } catch (err) {
      console.error('Failed to update saved templates:', err);
    }

    if (selectedTemplateId === templateId) {
      handleSelectTemplate('template-standard-retail');
    }

    setTemplateToast('Custom template deleted');
    setTimeout(() => setTemplateToast(null), 2500);
  };

  // --- SUB MODALS STATE ---
  // 1. Multi-Item Catalog Selection Sub-Modal State
  const [isMultiSelectOpen, setIsMultiSelectOpen] = useState(false);
  const [multiSearch, setMultiSearch] = useState('');
  const [multiCategory, setMultiCategory] = useState<string>('all');
  const [multiStockFilter, setMultiStockFilter] = useState<'all' | 'instock' | 'out'>('all');
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
  const [copiesMap, setCopiesMap] = useState<Record<string, number>>({});
  const [bulkDefaultCopies, setBulkDefaultCopies] = useState<number>(1);

  // 2. CSV Upload Sub-Modal State
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [parsedCsvRows, setParsedCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isDraggingCsv, setIsDraggingCsv] = useState(false);

  // Get distinct categories
  const categories = Array.from(new Set(products.map((p) => p.category))).filter(Boolean);

  // Auto-sync initial product/variant info
  useEffect(() => {
    if (isOpen) {
      const targetProd = product || products[0];
      const targetVar = variant || targetProd?.variants[0] || products[0]?.variants[0];

      if (targetProd) {
        setSelectedProductId(targetProd.id);
      }
      if (targetVar) {
        setSelectedVariantId(targetVar.id);
        const code = targetVar.barcode || targetVar.sku || generateRandomEAN13();
        setBarcodeValue(code);

        if (/^\d{13}$/.test(code)) {
          setBarcodeFormat('EAN13');
        } else if (/^\d{12}$/.test(code)) {
          setBarcodeFormat('UPCA');
        } else if (/^\d{8}$/.test(code)) {
          setBarcodeFormat('EAN8');
        } else {
          setBarcodeFormat('CODE128');
        }
      }

      if (targetProd && targetVar) {
        setBatchQueue([
          {
            product: targetProd,
            variant: targetVar,
            copies: Math.max(1, getTotalStockForVariant(targetProd.id, targetVar.id) || 1),
          },
        ]);
      }
    }
  }, [isOpen, product?.id, variant?.id]);

  // Sync barcode value when user selects a different variant manually
  useEffect(() => {
    if (currentVar) {
      const val = currentVar.barcode || currentVar.sku || generateRandomEAN13();
      setBarcodeValue(val);
      if (/^\d{13}$/.test(val)) setBarcodeFormat('EAN13');
      else if (/^\d{12}$/.test(val)) setBarcodeFormat('UPCA');
      else if (/^\d{8}$/.test(val)) setBarcodeFormat('EAN8');
      else setBarcodeFormat('CODE128');
    }
  }, [selectedProductId, selectedVariantId]);

  if (!isOpen) return null;

  // Barcode Validation status
  let validationStatus = { valid: true, text: 'Valid Barcode' };
  if (barcodeFormat === 'EAN13') {
    if (/^\d{13}$/.test(barcodeValue)) {
      const calcDigit = calculateEAN13CheckDigit(barcodeValue.slice(0, 12));
      const actualDigit = barcodeValue.slice(-1);
      if (calcDigit !== actualDigit) {
        validationStatus = { valid: false, text: `EAN-13 Checksum mismatch! Expected digit ${calcDigit}` };
      } else {
        validationStatus = { valid: true, text: 'GS1 Valid EAN-13 (Modulo 10 Verified)' };
      }
    } else if (/[a-zA-Z]/.test(barcodeValue)) {
      validationStatus = { valid: true, text: 'Alphanumeric detected: Auto-routing as CODE 128' };
    } else {
      validationStatus = { valid: false, text: 'EAN-13 requires 13 numeric digits' };
    }
  } else if (barcodeFormat === 'UPCA') {
    if (/^\d{12}$/.test(barcodeValue)) {
      const calcDigit = calculateUPCACheckDigit(barcodeValue.slice(0, 11));
      const actualDigit = barcodeValue.slice(-1);
      if (calcDigit !== actualDigit) {
        validationStatus = { valid: false, text: `UPC-A Checksum mismatch! Expected digit ${calcDigit}` };
      } else {
        validationStatus = { valid: true, text: 'Valid UPC-A 12-Digit Standard' };
      }
    } else if (/[a-zA-Z]/.test(barcodeValue)) {
      validationStatus = { valid: true, text: 'Alphanumeric detected: Auto-routing as CODE 128' };
    } else {
      validationStatus = { valid: false, text: 'UPC-A requires 12 numeric digits' };
    }
  } else if (barcodeFormat === 'EAN8') {
    validationStatus = /^\d{8}$/.test(barcodeValue)
      ? { valid: true, text: 'Valid 8-Digit EAN Compact' }
      : { valid: false, text: 'Requires 8 numeric digits' };
  } else if (barcodeFormat === 'QR') {
    validationStatus = { valid: true, text: 'Valid 2D QR Matrix Code' };
  } else {
    validationStatus = { valid: true, text: 'Valid CODE 128 Alphanumeric Standard' };
  }

  // Generate random barcodes
  const handleGenerateEAN13 = () => {
    const newCode = generateRandomEAN13();
    setBarcodeValue(newCode);
    setBarcodeFormat('EAN13');
  };

  const handleGenerateUPCA = () => {
    const newCode = generateRandomUPCA();
    setBarcodeValue(newCode);
    setBarcodeFormat('UPCA');
  };

  const handleUseSkuCode = () => {
    if (currentVar?.sku) {
      setBarcodeValue(currentVar.sku);
      setBarcodeFormat('CODE128');
    }
  };

  // Save updated barcode to catalog
  const handleSaveToCatalog = () => {
    if (!currentProd || !currentVar) return;

    const updatedVariants = currentProd.variants.map((v) =>
      v.id === currentVar.id ? { ...v, barcode: barcodeValue } : v
    );

    const updatedProduct = { ...currentProd, variants: updatedVariants };
    updateProduct(updatedProduct);
    logAuditAction(
      `Barcode updated to ${barcodeValue} (${barcodeFormat})`,
      'products',
      currentVar.id,
      currentVar.barcode,
      barcodeValue
    );

    setSavedToCatalog(true);
    setTimeout(() => setSavedToCatalog(false), 2500);
  };

  const handleCopyBarcode = () => {
    navigator.clipboard?.writeText(barcodeValue);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 1500);
  };

  // Batch queue handlers
  const handleAddToBatch = (p: Product, v: ProductVariant) => {
    setBatchQueue((prev) => {
      const exists = prev.find((item) => item.variant.id === v.id);
      if (exists) {
        return prev.map((item) =>
          item.variant.id === v.id ? { ...item, copies: item.copies + 1 } : item
        );
      }
      return [...prev, { product: p, variant: v, copies: 1 }];
    });
  };

  const handleRemoveFromBatch = (variantId: string) => {
    setBatchQueue((prev) => prev.filter((item) => item.variant.id !== variantId));
  };

  const handleSyncStockToBatch = () => {
    setBatchQueue((prev) =>
      prev.map((item) => ({
        ...item,
        copies: Math.max(1, getTotalStockForVariant(item.product.id, item.variant.id) || 1),
      }))
    );
  };

  // CSV Upload Process Handler
  const handleFileUpload = (file: File) => {
    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setCsvError('Failed to read CSV text content.');
        return;
      }
      const { rows, errors } = parseCsvText(text, products);
      if (errors.length > 0) {
        setCsvError(errors.join(' '));
      }
      setParsedCsvRows(rows);
    };
    reader.onerror = () => {
      setCsvError('Error reading CSV file.');
    };
    reader.readAsText(file);
  };

  const handleConfirmCsvImport = () => {
    if (parsedCsvRows.length === 0) return;

    setBatchQueue((prev) => {
      const updated = [...prev];
      parsedCsvRows.forEach((row) => {
        if (row.matchedProduct && row.matchedVariant) {
          const idx = updated.findIndex((item) => item.variant.id === row.matchedVariant!.id);
          if (idx >= 0) {
            updated[idx].copies += row.copies;
          } else {
            updated.push({
              product: row.matchedProduct,
              variant: row.matchedVariant,
              copies: row.copies,
            });
          }
        } else {
          // Custom external product created for custom CSV items
          const customVar: ProductVariant = {
            id: `csv-var-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: row.variantName || 'Standard',
            sku: row.sku,
            barcode: row.barcode,
            attributes: { Standard: 'Default' },
            costPrice: row.price * 0.6,
            retailPrice: row.price,
            wholesalePrice: row.price * 0.8,
            memberPrice: row.price * 0.9,
            minSellingPrice: row.price * 0.7,
            stockByLocation: { 'loc-main-wh': 100 },
            lowStockThreshold: 10,
          };

          const customProd: Product = {
            id: `csv-prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: row.name,
            slug: row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            description: 'CSV Imported Product',
            shortDescription: 'CSV Import Item',
            category: 'CSV Import',
            subcategory: 'General',
            brand: 'Imported',
            status: 'active',
            unit: 'pcs',
            taxRate: 0,
            rating: 5,
            reviewCount: 0,
            tags: ['csv-import'],
            images: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            variants: [customVar],
          };

          updated.push({
            product: customProd,
            variant: customVar,
            copies: row.copies,
          });
        }
      });
      return updated;
    });

    setIsCsvModalOpen(false);
    setParsedCsvRows([]);
    setActiveTab('batch');
  };

  // Multi-item inventory filter logic
  const allCatalogVariants = products.flatMap((p) =>
    p.variants.map((v) => ({
      product: p,
      variant: v,
      stock: getTotalStockForVariant(p.id, v.id),
    }))
  );

  const filteredCatalogVariants = allCatalogVariants.filter(({ product: p, variant: v, stock }) => {
    const q = multiSearch.toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      v.name.toLowerCase().includes(q) ||
      v.sku.toLowerCase().includes(q) ||
      (v.barcode && v.barcode.toLowerCase().includes(q));

    const matchesCategory = multiCategory === 'all' || p.category === multiCategory;

    let matchesStock = true;
    if (multiStockFilter === 'instock') matchesStock = stock > 0;
    if (multiStockFilter === 'out') matchesStock = stock === 0;

    return matchesSearch && matchesCategory && matchesStock;
  });

  const handleToggleSelectVariant = (varId: string) => {
    setSelectedVariantIds((prev) => {
      const next = new Set(prev);
      if (next.has(varId)) {
        next.delete(varId);
      } else {
        next.add(varId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredCatalogVariants.map((item) => item.variant.id);
    setSelectedVariantIds(new Set(allFilteredIds));
  };

  const handleDeselectAll = () => {
    setSelectedVariantIds(new Set());
  };

  const handleAddSelectedToBatch = () => {
    if (selectedVariantIds.size === 0) return;

    setBatchQueue((prev) => {
      const updated = [...prev];
      allCatalogVariants.forEach(({ product: p, variant: v }) => {
        if (selectedVariantIds.has(v.id)) {
          const customCopies = copiesMap[v.id] ?? bulkDefaultCopies ?? 1;
          const idx = updated.findIndex((i) => i.variant.id === v.id);
          if (idx >= 0) {
            updated[idx].copies += customCopies;
          } else {
            updated.push({
              product: p,
              variant: v,
              copies: customCopies,
            });
          }
        }
      });
      return updated;
    });

    setIsMultiSelectOpen(false);
    setSelectedVariantIds(new Set());
    setActiveTab('batch');
  };

  const handlePrint = () => {
    window.print();
  };

  const totalBatchLabels = batchQueue.reduce((acc, item) => acc + item.copies, 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-1.5 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col my-2 sm:my-4 max-h-[96vh] sm:max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="p-3.5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850/50 shrink-0 gap-2">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
              <BarcodeIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                  Barcode Label Studio
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
                  <Sparkles className="w-2.5 h-2.5 text-sky-500" />
                  GS1 EAN / UPC / QR / CSV Batch
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                Design, validate, size and print high-contrast barcodes recognized by all POS camera scanners
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WORKSPACE NAVIGATION TABS */}
        <div className="px-3 sm:px-6 pt-2 sm:pt-3 bg-slate-100/50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center space-x-1 sm:space-x-2 min-w-max">
            {[
              { id: 'single', label: 'Barcode Generator & Layout Studio', mobileLabel: 'Studio & Generator', icon: BarcodeIcon },
              { id: 'batch', label: `Batch Print Queue (${batchQueue.length})`, mobileLabel: `Batch Queue (${batchQueue.length})`, icon: Layers },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-t border-x ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 border-slate-200 dark:border-slate-800 shadow-xs'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Scanner Camera Ready
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            {/* Quick Saved Template Switcher */}
            <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-indigo-200 dark:border-indigo-800 shadow-2xs">
              <Bookmark className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="text-[11px] font-bold text-slate-500">Template:</span>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="bg-transparent text-xs font-extrabold text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer"
              >
                <optgroup label="⭐ Predefined Built-in Templates">
                  {PREDEFINED_LABEL_TEMPLATES.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.name}
                    </option>
                  ))}
                </optgroup>
                {userCustomTemplates.length > 0 && (
                  <optgroup label="📁 My Custom Saved Templates">
                    {userCustomTemplates.map((tmpl) => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* MAIN BODY CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 custom-scrollbar">
          {/* Toast Notification Banner */}
          {templateToast && (
            <div className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-indigo-200" />
                <span>{templateToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setTemplateToast(null)}
                className="p-1 hover:bg-indigo-700 rounded-lg text-indigo-200 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: SINGLE BARCODE GENERATOR */}
          {activeTab === 'single' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
              {/* Left Control Panel */}
              <div className="lg:col-span-6 space-y-4 sm:space-y-5">
                {/* 0. SAVED LAYOUT TEMPLATES DROPDOWN PANEL */}
                <div className="bg-gradient-to-br from-indigo-900/10 via-slate-50 to-sky-900/10 dark:from-indigo-950/40 dark:via-slate-950 dark:to-sky-950/40 p-3.5 sm:p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 shadow-xs space-y-2.5 sm:space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 min-w-0">
                      <Bookmark className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="truncate">Saved Layout Templates</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                      {activeTemplate.category}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    {/* Dropdown Selector */}
                    <div className="relative flex-1">
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => handleSelectTemplate(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700/80 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
                      >
                        <optgroup label="⭐ Predefined Built-in Layouts">
                          {PREDEFINED_LABEL_TEMPLATES.map((tmpl) => (
                            <option key={tmpl.id} value={tmpl.id}>
                              {tmpl.name}
                            </option>
                          ))}
                        </optgroup>

                        {userCustomTemplates.length > 0 && (
                          <optgroup label="📁 My Custom Saved Templates">
                            {userCustomTemplates.map((tmpl) => (
                              <option key={tmpl.id} value={tmpl.id}>
                                {tmpl.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setNewTemplateName('');
                          setNewTemplateDesc('');
                          setIsSaveTemplateModalOpen(true);
                        }}
                        className="flex-1 sm:flex-none px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        title="Save current label settings as a new template layout"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Save Layout</span>
                      </button>

                      {!activeTemplate.isPredefined && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomTemplate(activeTemplate.id)}
                          className="p-2 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl transition-all cursor-pointer"
                          title="Delete this custom template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active Template Description */}
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-slate-900/70 p-2 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{activeTemplate.description}</span>
                  </div>
                </div>

                {/* 1. Item Selection */}
                <div className="bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 sm:space-y-3">
                  <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-500 shrink-0" />
                    Target Product & Variant
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                    <div>
                      <label className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Product Title
                      </label>
                      <select
                        value={selectedProductId}
                        onChange={(e) => {
                          setSelectedProductId(e.target.value);
                          const p = products.find((prod) => prod.id === e.target.value);
                          if (p && p.variants.length > 0) {
                            setSelectedVariantId(p.variants[0].id);
                          }
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Variant / SKU
                      </label>
                      <select
                        value={selectedVariantId}
                        onChange={(e) => setSelectedVariantId(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      >
                        {currentProd?.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.sku})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {currentVar && (
                    <div className="p-2.5 bg-sky-50/60 dark:bg-sky-950/40 rounded-xl border border-sky-100 dark:border-sky-900/50 flex items-center justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 dark:text-white block sm:inline truncate">{currentVar.name}</span>
                        <span className="text-slate-500 sm:ml-2 font-mono text-[11px] block sm:inline">SKU: {currentVar.sku}</span>
                      </div>
                      <span className="font-black text-sky-600 dark:text-sky-400 shrink-0">
                        {formatCurrency(currentVar.retailPrice)}
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Barcode Value & Symbology Controls */}
                <div className="bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 min-w-0">
                      <BarcodeIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500 shrink-0" />
                      <span className="truncate">Symbology Standard</span>
                    </h3>
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${
                        validationStatus.valid
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {validationStatus.valid ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                      )}
                      <span className="max-w-[130px] sm:max-w-none truncate">{validationStatus.text}</span>
                    </span>
                  </div>

                  {/* Format Selector Grid */}
                  <div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
                      {[
                        { id: 'CODE128', label: 'CODE 128', sub: 'Logistics' },
                        { id: 'EAN13', label: 'EAN-13', sub: 'Global' },
                        { id: 'UPCA', label: 'UPC-A', sub: 'North Am.' },
                        { id: 'EAN8', label: 'EAN-8', sub: 'Compact' },
                        { id: 'CODE39', label: 'CODE 39', sub: 'Industry' },
                        { id: 'QR', label: 'QR Code', sub: '2D Matrix' },
                      ].map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setBarcodeFormat(fmt.id as BarcodeFormat)}
                          className={`p-1.5 sm:p-2 rounded-xl border text-center transition-all cursor-pointer ${
                            barcodeFormat === fmt.id
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-bold'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                          }`}
                        >
                          <div className="text-[11px] sm:text-xs font-bold leading-tight truncate">{fmt.label}</div>
                          <div className="text-[8px] sm:text-[9px] opacity-80 leading-tight truncate">{fmt.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Barcode input & Generator tools */}
                  <div>
                    <label className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Barcode String / Numerals
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={barcodeValue}
                          onChange={(e) => setBarcodeValue(e.target.value)}
                          placeholder="e.g. 2001234567890 or SKU-CODE"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 font-mono text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyBarcode}
                        className="px-2.5 sm:px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                        title="Copy Barcode String"
                      >
                        {copiedSuccess ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Quick Barcode Generator Actions */}
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleGenerateEAN13}
                      className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span className="truncate">Random EAN-13</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerateUPCA}
                      className="px-2.5 py-1.5 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-sky-500 shrink-0" />
                      <span className="truncate">Random UPC-A</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleUseSkuCode}
                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    >
                      <Tag className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">Use Item SKU</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveToCatalog}
                      className="col-span-2 sm:col-span-1 sm:ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] sm:text-xs font-extrabold shadow-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
                    >
                      {savedToCatalog ? (
                        <Check className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Save className="w-3.5 h-3.5 text-white" />
                      )}
                      <span>{savedToCatalog ? 'Saved!' : 'Save to Item'}</span>
                    </button>
                  </div>
                </div>

                {/* 3 & 4. Label Template Dimension Presets & Visible Content Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* 3. Label Template Dimension Presets */}
                  <div className="bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 sm:space-y-3 flex flex-col">
                    <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <span className="truncate">Dimension Presets</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-1 gap-1.5 flex-1">
                      {[
                        { id: '58x40', title: '58×40mm', desc: 'Retail Tag' },
                        { id: '38x25', title: '38×25mm', desc: 'Jewelry Tag' },
                        { id: '70x48', title: '70×48mm', desc: 'Box Sticker' },
                        { id: '100x75', title: '100×75mm', desc: 'Shipping Pallet' },
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setLabelTemplate(preset.id as LabelTemplate)}
                          className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                            labelTemplate === preset.id
                              ? 'bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400 font-bold'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-sky-300'
                          }`}
                        >
                          <div className="font-extrabold text-[11px] sm:text-xs text-slate-900 dark:text-white truncate">{preset.title}</div>
                          <div className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 truncate">{preset.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Visible Content Fields & Custom Footer */}
                  <div className="bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 sm:space-y-3 flex flex-col justify-between">
                    <div>
                      <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2 sm:mb-2.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate">Visible Fields</span>
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-1 gap-1.5 sm:gap-2">
                        {[
                          { state: showProdTitle, setter: setShowProdTitle, label: 'Product Title' },
                          { state: showBrand, setter: setShowBrand, label: 'Brand Header' },
                          { state: showVariantName, setter: setShowVariantName, label: 'Variant Name' },
                          { state: showSku, setter: setShowSku, label: 'SKU Code' },
                          { state: showPrice, setter: setShowPrice, label: 'Retail Price' },
                          { state: showMsrp, setter: setShowMsrp, label: 'MSRP Price' },
                          { state: showBarcodeText, setter: setShowBarcodeText, label: 'Barcode Text' },
                        ].map((field, idx) => (
                          <label key={idx} className="flex items-center space-x-1.5 text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={field.state}
                              onChange={(e) => field.setter(e.target.checked)}
                              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                            />
                            <span className="truncate">{field.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Custom Footer Tag</label>
                      <input
                        type="text"
                        value={customFooterText}
                        onChange={(e) => setCustomFooterText(e.target.value)}
                        placeholder="e.g. Fragile"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Barcode & Label Size Adjustment Controls */}
                <div className="bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 sm:space-y-3">
                  <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span>Barcode & Label Sizing</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    {/* Barcode Height */}
                    <div>
                      <div className="flex justify-between text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        <span>Bar Height</span>
                        <span className="font-mono text-sky-600 font-bold">{barcodeBarHeight}px</span>
                      </div>
                      <input
                        type="range"
                        min="25"
                        max="100"
                        step="5"
                        value={barcodeBarHeight}
                        onChange={(e) => setBarcodeBarHeight(Number(e.target.value))}
                        className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg"
                      />
                    </div>

                    {/* Bar Density Width */}
                    <div>
                      <div className="flex justify-between text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        <span>Line Density</span>
                        <span className="font-mono text-sky-600 font-bold">{barcodeBarWidth}x</span>
                      </div>
                      <div className="flex gap-1">
                        {[1.2, 1.8, 2.4].map((widthVal) => (
                          <button
                            key={widthVal}
                            type="button"
                            onClick={() => setBarcodeBarWidth(widthVal)}
                            className={`flex-1 py-1 rounded text-[10px] font-bold cursor-pointer border ${
                              barcodeBarWidth === widthVal
                                ? 'bg-sky-500 text-white border-sky-500'
                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {widthVal}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Preview Scale Zoom */}
                    <div>
                      <div className="flex justify-between text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        <span>Preview Zoom</span>
                        <span className="font-mono text-sky-600 font-bold">{previewZoom}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewZoom(Math.max(80, previewZoom - 20))}
                          className="p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <Minimize2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewZoom(Math.min(140, previewZoom + 20))}
                          className="p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Preview & Print Sheet Panel */}
              <div className="lg:col-span-6 space-y-4 sm:space-y-5 flex flex-col justify-between">
                <div className="bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center min-h-[300px] sm:min-h-[340px] overflow-hidden">
                  <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 sm:mb-4 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-sky-500" />
                    High-Contrast Label Preview ({labelTemplate.toUpperCase()})
                  </p>

                  {/* LABEL PREVIEW CONTAINER WITH SIZE ZOOM SCALING & TOUCH SCROLL WRAPPER */}
                  <div className="w-full overflow-x-auto flex justify-center py-2 no-scrollbar">
                    <div
                      style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: 'center center' }}
                      className="transition-transform duration-200 shrink-0"
                    >
                      <div
                        id="printable-single-label"
                        className={`bg-white text-slate-950 rounded-xl p-3.5 sm:p-4 shadow-xl border border-slate-300 flex flex-col items-center justify-between text-center transition-all ${
                          labelTemplate === '38x25'
                            ? 'w-56 sm:w-64 min-h-[130px] sm:min-h-[140px]'
                            : labelTemplate === '100x75'
                            ? 'w-80 sm:w-96 min-h-[230px] sm:min-h-[260px] p-4 sm:p-6'
                            : labelTemplate === '70x48'
                            ? 'w-72 sm:w-88 min-h-[200px] sm:min-h-[230px]'
                            : 'w-64 sm:w-80 min-h-[190px] sm:min-h-[210px]'
                        }`}
                      >
                        {/* Header: Brand & Title */}
                        <div className="w-full">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2 text-left">
                            <div>
                              {showBrand && (
                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-sky-600 block">
                                  {currentProd?.brand || 'ACME STORE'}
                                </span>
                              )}
                              {showProdTitle && (
                                <h4 className="text-[11px] sm:text-xs font-extrabold text-slate-900 line-clamp-1">
                                  {currentProd?.name}
                                </h4>
                              )}
                            </div>
                            {showVariantName && (
                              <span className="text-[9px] sm:text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold border border-slate-200 shrink-0">
                                {currentVar?.name}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle: Vector SVG Barcode Renderer */}
                        <div className="w-full flex flex-col items-center my-1">
                          <BarcodeSvgRenderer
                            value={barcodeValue}
                            format={barcodeFormat}
                            height={barcodeBarHeight}
                            barWidth={barcodeBarWidth}
                            displayValue={showBarcodeText}
                            className="w-full text-slate-950"
                          />
                        </div>

                        {/* Footer: SKU, Price & Text */}
                        <div className="w-full flex items-end justify-between border-t border-slate-200 pt-1.5 sm:pt-2 mt-1">
                          <div className="text-left">
                            {showSku && (
                              <>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">SKU</p>
                                <p className="font-mono text-[11px] sm:text-xs font-bold text-slate-800">
                                  {currentVar?.sku || 'SKU-001'}
                                </p>
                              </>
                            )}
                            {labelTemplate === '100x75' && (
                              <p className="text-[9px] text-slate-500 mt-0.5">Unit: {currentProd?.unit || 'pcs'}</p>
                            )}
                          </div>

                          {customFooterText && labelTemplate !== '38x25' && (
                            <p className="text-[8px] font-bold text-slate-400 uppercase max-w-[100px] sm:max-w-[120px] truncate">
                              {customFooterText}
                            </p>
                          )}

                          <div className="text-right">
                            {showPrice && (
                              <>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">RETAIL PRICE</p>
                                <div className="flex items-baseline gap-1 sm:gap-1.5 justify-end">
                                  {showMsrp && currentVar?.compareAtPrice && currentVar.compareAtPrice > currentVar.retailPrice && (
                                    <span className="text-[9px] sm:text-[10px] line-through text-slate-400">
                                      {formatCurrency(currentVar.compareAtPrice)}
                                    </span>
                                  )}
                                  <p className="text-sm sm:text-base font-black text-sky-600">
                                    {formatCurrency(currentVar?.retailPrice || 0)}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Add to Batch & Bulk Import Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 sm:mt-4 w-full">
                    {currentProd && currentVar && (
                      <button
                        type="button"
                        onClick={() => handleAddToBatch(currentProd, currentVar)}
                        className="px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-sky-500 shrink-0" />
                        <span className="truncate">Add to Batch</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsMultiSelectOpen(true)}
                      className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ListChecks className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="truncate">Multi-Select Catalog</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCsvModalOpen(true)}
                      className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="truncate">Upload CSV Batch</span>
                    </button>
                  </div>
                </div>

                {/* Print Action Bar */}
                <div className="bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center justify-between sm:justify-start space-x-3">
                    <label className="text-xs text-slate-600 dark:text-slate-300 font-bold">Print Copies:</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))}
                      className="w-20 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-center font-bold text-slate-900 dark:text-white"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:opacity-95 text-white text-xs font-extrabold shadow-md shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print {copies} {copies > 1 ? 'Labels' : 'Label'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BATCH PRINT QUEUE */}
          {activeTab === 'batch' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Batch Print Queue Management</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    Print multi-item inventory stickers or entire catalog batches on thermal rolls or A4 label sheets
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCsvModalOpen(true)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-white shrink-0" />
                    <span>Upload CSV Batch</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMultiSelectOpen(true)}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ListChecks className="w-3.5 h-3.5 text-white shrink-0" />
                    <span>Select Items from Catalog</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncStockToBatch}
                    className="px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span>Sync Stock Copies</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const allItems: BatchItem[] = products.flatMap((p) =>
                        p.variants.map((v) => ({
                          product: p,
                          variant: v,
                          copies: Math.max(1, getTotalStockForVariant(p.id, v.id) || 1),
                        }))
                      );
                      setBatchQueue(allItems);
                    }}
                    className="px-3 py-2 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Add All SKUs ({products.reduce((acc, p) => acc + p.variants.length, 0)})</span>
                  </button>
                </div>
              </div>

              {/* Batch Queue Table Container */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-xs custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[550px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3 sm:px-4">Item & Variant</th>
                      <th className="py-2.5 px-3 sm:px-4">SKU</th>
                      <th className="py-2.5 px-3 sm:px-4">Barcode</th>
                      <th className="py-2.5 px-3 sm:px-4">On-Hand Stock</th>
                      <th className="py-2.5 px-3 sm:px-4 text-center">Copies</th>
                      <th className="py-2.5 px-3 sm:px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {batchQueue.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                            <p className="font-semibold text-slate-500 dark:text-slate-400">Print queue is currently empty</p>
                            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setIsCsvModalOpen(true)}
                                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                Upload CSV Batch
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsMultiSelectOpen(true)}
                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <ListChecks className="w-3.5 h-3.5" />
                                Select Catalog Items
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      batchQueue.map((item) => (
                        <tr key={item.variant.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-850/50 transition-colors">
                          <td className="py-2.5 px-3 sm:px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{item.product.name}</div>
                            <div className="text-[11px] text-slate-500">{item.variant.name} ({item.product.brand})</div>
                          </td>
                          <td className="py-2.5 px-3 sm:px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                            {item.variant.sku}
                          </td>
                          <td className="py-2.5 px-3 sm:px-4 font-mono text-slate-600 dark:text-slate-400">
                            {item.variant.barcode || 'N/A'}
                          </td>
                          <td className="py-2.5 px-3 sm:px-4 font-bold text-slate-800 dark:text-slate-200">
                            {getTotalStockForVariant(item.product.id, item.variant.id)} pcs
                          </td>
                          <td className="py-2.5 px-3 sm:px-4 text-center">
                            <input
                              type="number"
                              min="1"
                              max="1000"
                              value={item.copies}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value));
                                setBatchQueue((prev) =>
                                  prev.map((i) => (i.variant.id === item.variant.id ? { ...i, copies: val } : i))
                                );
                              }}
                              className="w-14 sm:w-16 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-center font-bold text-xs"
                            />
                          </td>
                          <td className="py-2.5 px-3 sm:px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveFromBatch(item.variant.id)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary Footer */}
              <div className="bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Total SKUs: <strong className="text-slate-900 dark:text-white">{batchQueue.length}</strong> | Total Labels: <strong className="text-sky-600 dark:text-sky-400">{totalBatchLabels}</strong>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchQueue([])}
                    disabled={batchQueue.length === 0}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-bold cursor-pointer"
                  >
                    Clear Queue
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={batchQueue.length === 0}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:opacity-95 disabled:opacity-50 text-white text-xs font-extrabold shadow-md shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Batch ({totalBatchLabels} Labels)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-3 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850/50 shrink-0">
          <div className="flex items-center space-x-1.5 sm:space-x-2 text-[11px] sm:text-xs text-slate-500 truncate">
            <Printer className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span className="truncate">Thermal roll & A4 desktop paper ready</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            Close
          </button>
        </div>
      </div>

      {/* --- SUB MODAL 1: MULTI-ITEM INVENTORY SELECTION MODAL --- */}
      {isMultiSelectOpen && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh]">
            {/* Header */}
            <div className="p-3.5 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-850/50 shrink-0 gap-2">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
                  <ListChecks className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                      Select Inventory Items
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      {selectedVariantIds.size} Selected
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                    Filter catalog products and choose items to add to your barcode label batch queue
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMultiSelectOpen(false)}
                className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Responsive Filter Toolbar */}
            <div className="p-3 sm:p-4 bg-slate-100/60 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                {/* Search */}
                <div className="md:col-span-5 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={multiSearch}
                    onChange={(e) => setMultiSearch(e.target.value)}
                    placeholder="Search title, SKU, or barcode..."
                    className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {multiSearch && (
                    <button
                      type="button"
                      onClick={() => setMultiSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Mobile Dropdowns Side-by-Side (grid-cols-2) */}
                <div className="grid grid-cols-2 md:contents gap-2">
                  {/* Category Filter */}
                  <div className="md:col-span-4">
                    <select
                      value={multiCategory}
                      onChange={(e) => setMultiCategory(e.target.value)}
                      className="w-full py-2 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                    >
                      <option value="all">All Categories ({categories.length})</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Stock Filter */}
                  <div className="md:col-span-3">
                    <select
                      value={multiStockFilter}
                      onChange={(e) => setMultiStockFilter(e.target.value as any)}
                      className="w-full py-2 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                    >
                      <option value="all">All Stock Status</option>
                      <option value="instock">In Stock Only</option>
                      <option value="out">Out of Stock Only</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Responsive Bulk Actions Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-xs">
                {/* Selection Buttons */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="flex-1 sm:flex-none px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Select All ({filteredCatalogVariants.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    disabled={selectedVariantIds.size === 0}
                    className="flex-1 sm:flex-none px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg text-[11px] sm:text-xs font-bold transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>

                {/* Copy Presets & Stock Match */}
                <div className="flex items-center justify-between sm:justify-end gap-2 bg-white/60 dark:bg-slate-900/60 p-1 sm:p-0 rounded-lg sm:bg-transparent">
                  <div className="flex items-center space-x-1.5 text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>Default Copies:</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={bulkDefaultCopies}
                      onChange={(e) => setBulkDefaultCopies(Math.max(1, Number(e.target.value)))}
                      className="w-14 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-center font-bold text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const nextMap: Record<string, number> = {};
                      filteredCatalogVariants.forEach((item) => {
                        nextMap[item.variant.id] = Math.max(1, item.stock || 1);
                      });
                      setCopiesMap(nextMap);
                    }}
                    className="px-2.5 py-1 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900 border border-sky-200 dark:border-sky-800 rounded-md text-[11px] font-extrabold cursor-pointer transition-colors shrink-0"
                  >
                    Match Stock
                  </button>
                </div>
              </div>
            </div>

            {/* Catalog Items Container */}
            <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 custom-scrollbar">
              {filteredCatalogVariants.length === 0 ? (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="text-xs font-semibold">No matching catalog items found.</p>
                  <p className="text-[11px] mt-1 text-slate-400">Try adjusting your search query or filter settings.</p>
                </div>
              ) : (
                <>
                  {/* MOBILE & TABLET CARD VIEW (Visible on screens < md) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 md:hidden">
                    {filteredCatalogVariants.map(({ product: p, variant: v, stock }) => {
                      const isSelected = selectedVariantIds.has(v.id);
                      const currentCopyVal = copiesMap[v.id] ?? bulkDefaultCopies ?? 1;

                      return (
                        <div
                          key={v.id}
                          onClick={() => handleToggleSelectVariant(v.id)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer select-none relative flex flex-col justify-between gap-2.5 ${
                            isSelected
                              ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-500/80 shadow-xs ring-1 ring-indigo-500/40'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          {/* Top Row: Checkbox, Name, Price */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start space-x-2.5 min-w-0">
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSelectVariant(v.id);
                                }}
                                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                                }`}
                              >
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                              <div className="min-w-0">
                                <div className="font-extrabold text-xs text-slate-900 dark:text-white leading-tight truncate">
                                  {p.name}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                                  {v.name} <span className="opacity-70">({p.brand})</span>
                                </div>
                              </div>
                            </div>
                            <span className="font-extrabold text-xs text-indigo-600 dark:text-indigo-400 shrink-0">
                              {formatCurrency(v.retailPrice)}
                            </span>
                          </div>

                          {/* Middle Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700">
                              SKU: {v.sku}
                            </span>
                            {v.barcode ? (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                {v.barcode}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-sans font-semibold">
                                Auto EAN
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-md font-sans font-extrabold ml-auto ${
                                stock > 0
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                  : 'bg-red-500/10 text-red-500 border border-red-500/20'
                              }`}
                            >
                              {stock} pcs stock
                            </span>
                          </div>

                          {/* Bottom Row: Copies Stepper */}
                          <div
                            className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                              Label Copies:
                            </span>
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const val = Math.max(1, currentCopyVal - 1);
                                  setCopiesMap((prev) => ({ ...prev, [v.id]: val }));
                                  if (!isSelected) handleToggleSelectVariant(v.id);
                                }}
                                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold transition-colors cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                max="500"
                                value={currentCopyVal}
                                onChange={(e) => {
                                  const val = Math.max(1, Number(e.target.value));
                                  setCopiesMap((prev) => ({ ...prev, [v.id]: val }));
                                  if (!isSelected) handleToggleSelectVariant(v.id);
                                }}
                                className="w-12 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg py-1 text-center font-bold text-xs font-mono text-slate-900 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const val = currentCopyVal + 1;
                                  setCopiesMap((prev) => ({ ...prev, [v.id]: val }));
                                  if (!isSelected) handleToggleSelectVariant(v.id);
                                }}
                                className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 hover:bg-indigo-200 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* DESKTOP TABLE VIEW (Visible on screens >= md) */}
                  <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[650px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={
                                filteredCatalogVariants.length > 0 &&
                                filteredCatalogVariants.every((i) => selectedVariantIds.has(i.variant.id))
                              }
                              onChange={(e) => {
                                if (e.target.checked) handleSelectAllFiltered();
                                else handleDeselectAll();
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </th>
                          <th className="py-2.5 px-3">Product Name & Variant</th>
                          <th className="py-2.5 px-3">SKU</th>
                          <th className="py-2.5 px-3">Barcode</th>
                          <th className="py-2.5 px-3">On-Hand Stock</th>
                          <th className="py-2.5 px-3">Retail Price</th>
                          <th className="py-2.5 px-3 text-center">Copies</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {filteredCatalogVariants.map(({ product: p, variant: v, stock }) => {
                          const isSelected = selectedVariantIds.has(v.id);
                          const currentCopyVal = copiesMap[v.id] ?? bulkDefaultCopies ?? 1;

                          return (
                            <tr
                              key={v.id}
                              onClick={() => handleToggleSelectVariant(v.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-indigo-50/70 dark:bg-indigo-950/40'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-850'
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectVariant(v.id)}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                                <div className="text-[11px] text-slate-500">{v.name} ({p.brand})</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                                {v.sku}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                                {v.barcode || <span className="text-amber-500 font-sans text-[11px] font-semibold">Auto-generate</span>}
                              </td>
                              <td className="py-2.5 px-3 font-bold">
                                <span className={stock > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                                  {stock} pcs
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                                {formatCurrency(v.retailPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="number"
                                  min="1"
                                  max="500"
                                  value={currentCopyVal}
                                  onChange={(e) => {
                                    const val = Math.max(1, Number(e.target.value));
                                    setCopiesMap((prev) => ({ ...prev, [v.id]: val }));
                                    if (!isSelected) {
                                      handleToggleSelectVariant(v.id);
                                    }
                                  }}
                                  className="w-14 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 py-1 text-center font-bold text-xs"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Sub-Modal Responsive Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-slate-50/80 dark:bg-slate-850/50 gap-2.5 shrink-0">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-center sm:text-left">
                Selected: <strong className="text-indigo-600 dark:text-indigo-400">{selectedVariantIds.size} items</strong>
                {selectedVariantIds.size > 0 && (
                  <span className="text-slate-500 ml-1.5">
                    ({Array.from(selectedVariantIds).reduce((sum, id) => sum + (copiesMap[id] ?? bulkDefaultCopies ?? 1), 0)} total labels)
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsMultiSelectOpen(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleAddSelectedToBatch}
                  disabled={selectedVariantIds.size === 0}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:opacity-95 disabled:opacity-40 text-white text-xs font-extrabold shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add {selectedVariantIds.size} Items to Batch</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB MODAL 2: CSV BATCH UPLOAD & PARSER MODAL --- */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-850/50">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Upload Barcode CSV Batch File
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Import a CSV file with SKUs, barcodes, and quantities to generate labels automatically
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsCsvModalOpen(false);
                  setParsedCsvRows([]);
                  setCsvError(null);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingCsv(true);
                }}
                onDragLeave={() => setIsDraggingCsv(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingCsv(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center space-y-3 ${
                  isDraggingCsv
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Drag and drop your CSV file here, or{' '}
                    <label className="text-emerald-600 dark:text-emerald-400 underline cursor-pointer hover:text-emerald-700">
                      browse computer
                      <input
                        type="file"
                        accept=".csv,.txt"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileUpload(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Supports headers: <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">sku</code>,{' '}
                    <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">barcode</code>,{' '}
                    <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">name</code>,{' '}
                    <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">copies</code>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={downloadSampleCsv}
                  className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer mt-2"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Download Sample CSV Template</span>
                </button>
              </div>

              {/* CSV Error message */}
              {csvError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{csvError}</span>
                </div>
              )}

              {/* Parsed Preview Table */}
              {parsedCsvRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Parsed CSV Batch Preview ({parsedCsvRows.length} Rows)
                    </h4>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Total Labels to Print: {parsedCsvRows.reduce((a, b) => a + b.copies, 0)}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-[260px] custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <th className="py-2 px-3">Item Title & Variant</th>
                          <th className="py-2 px-3">SKU</th>
                          <th className="py-2 px-3">Barcode</th>
                          <th className="py-2 px-3">Catalog Status</th>
                          <th className="py-2 px-3 text-center">Copies</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {parsedCsvRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-850">
                            <td className="py-2 px-3">
                              <div className="font-bold text-slate-900 dark:text-white">{row.name}</div>
                              <div className="text-[11px] text-slate-500">{row.variantName}</div>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                              {row.sku}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                              {row.barcode}
                            </td>
                            <td className="py-2 px-3">
                              {row.isCatalogMatch ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  Matched Catalog
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                  <Plus className="w-3 h-3 text-sky-500" />
                                  Custom Item
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="number"
                                min="1"
                                max="1000"
                                value={row.copies}
                                onChange={(e) => {
                                  const val = Math.max(1, Number(e.target.value));
                                  setParsedCsvRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, copies: val } : r))
                                  );
                                }}
                                className="w-14 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 py-0.5 text-center font-bold text-xs"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-850/50">
              <button
                type="button"
                onClick={() => {
                  setIsCsvModalOpen(false);
                  setParsedCsvRows([]);
                  setCsvError(null);
                }}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmCsvImport}
                disabled={parsedCsvRows.length === 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Import {parsedCsvRows.length} Parsed Items into Queue</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB MODAL 3: SAVE TEMPLATE LAYOUT MODAL --- */}
      {isSaveTemplateModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-850/50">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-600 text-white flex items-center justify-center shadow-md">
                  <Bookmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Save Label Layout Template
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Save current dimensions, symbology & fields as a preset
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSaveTemplateModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewTemplate} className="p-4 sm:p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Boutique Price Tag, Shipping Box Sticker"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newTemplateCategory}
                    onChange={(e) => setNewTemplateCategory(e.target.value as any)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="Retail">Retail</option>
                    <option value="Shipping">Shipping</option>
                    <option value="Shelf">Shelf</option>
                    <option value="Jewelry">Jewelry</option>
                    <option value="Promo">Promo</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Dimension Size
                  </label>
                  <div className="py-2 px-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                    {labelTemplate.toUpperCase()}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  placeholder="e.g. Standard 58x40 label with barcode & retail price"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {/* Live Config Summary Box */}
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200/60 dark:border-indigo-900/50 text-[11px] space-y-1 text-slate-700 dark:text-slate-300">
                <p className="font-extrabold text-indigo-600 dark:text-indigo-400 uppercase text-[10px] tracking-wider">
                  Summary of Saved Settings:
                </p>
                <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
                  <div>• Symbology: <strong className="text-slate-900 dark:text-white">{barcodeFormat}</strong></div>
                  <div>• Height / Density: <strong className="text-slate-900 dark:text-white">{barcodeBarHeight}px / {barcodeBarWidth}x</strong></div>
                  <div className="col-span-2">• Footer Tag: <strong className="text-slate-900 dark:text-white">{customFooterText || 'None'}</strong></div>
                </div>
              </div>

              {/* Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSaveTemplateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
