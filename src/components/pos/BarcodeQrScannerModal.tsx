import React, { useState, useEffect, useRef } from 'react';
import { useCommerce } from '../../context/CommerceContext';
import { Product, ProductVariant, Customer, Order } from '../../types';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  X,
  QrCode,
  Barcode,
  Volume2,
  VolumeX,
  Zap,
  CheckCircle2,
  AlertCircle,
  Upload,
  RefreshCw,
  Search,
  UserCheck,
  PackageCheck,
  Receipt,
  Video,
  VideoOff,
  Sparkles,
  Plus,
  Minus,
  ShoppingCart,
  UserPlus,
  ExternalLink,
  Layers,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface BarcodeQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (code: string) => void;
}

export const BarcodeQrScannerModal: React.FC<BarcodeQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanResult,
}) => {
  const { products, customers, orders, addToPosCart, setSelectedPosCustomer, getTotalStockForVariant } = useCommerce();
  const [manualCode, setManualCode] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanStatusToast, setScanStatusToast] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState<boolean>(false);
  const [scanQty, setScanQty] = useState<number>(1);
  const [showTestShortcuts, setShowTestShortcuts] = useState<boolean>(false);

  // Multi-Scan Mode & Buffer State
  const [isMultiScan, setIsMultiScan] = useState<boolean>(false);
  const [multiScanBuffer, setMultiScanBuffer] = useState<
    Array<{
      id: string;
      product: Product;
      variant: ProductVariant;
      qty: number;
    }>
  >([]);

  const handleCommitMultiScanBuffer = () => {
    if (multiScanBuffer.length === 0) return;
    let totalItemsCount = 0;
    multiScanBuffer.forEach((item) => {
      addToPosCart(item.product, item.variant, item.qty);
      totalItemsCount += item.qty;
    });
    setMultiScanBuffer([]);
    playBeepSound('success');
    setScanStatusToast(`Committed ${totalItemsCount} item(s) to POS Cart`);
  };

  const handleClearMultiScanBuffer = () => {
    setMultiScanBuffer([]);
    setScanStatusToast('Multi-scan buffer cleared');
  };

  const handleUpdateBufferQty = (id: string, delta: number) => {
    setMultiScanBuffer((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as typeof multiScanBuffer
    );
  };

  const handleRemoveFromBuffer = (id: string) => {
    setMultiScanBuffer((prev) => prev.filter((item) => item.id !== id));
  };

  const [lastScannedItem, setLastScannedItem] = useState<{
    code: string;
    type: 'product' | 'customer' | 'order' | 'unknown';
    title: string;
    sub: string;
    product?: Product;
    variant?: ProductVariant;
    customer?: Customer;
    order?: Order;
  } | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isScanningRef = useRef<boolean>(false);

  // Focus manual input when modal opens
  useEffect(() => {
    if (isOpen) {
      setLastScannedItem(null);
      setScanStatusToast(null);
      setCameraError(null);
      setScanQty(1);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Sound beep utility using Web Audio API
  const playBeepSound = (type: 'success' | 'error' = 'success') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        
        if (type === 'success') {
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        } else {
          osc.frequency.setValueAtTime(300, ctx.currentTime);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        }
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (type === 'success' ? 0.15 : 0.3));
      }
    } catch {
      // Audio context fallback
    }
  };

  const processScannedCode = (codeToProcess: string) => {
    const trimmed = codeToProcess.trim();
    if (!trimmed) return;

    // Prevent immediate duplicate rapid re-scans within 1.2s
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setTimeout(() => {
      isScanningRef.current = false;
    }, 1200);

    setScanQty(1);

    let matchedType: 'product' | 'customer' | 'order' | 'unknown' = 'unknown';
    let title = trimmed;
    let sub = 'Unrecognized barcode/QR payload';
    let matchedProd: Product | undefined;
    let matchedVar: ProductVariant | undefined;
    let matchedCust: Customer | undefined;
    let matchedOrd: Order | undefined;

    const matchedProduct = products.find(
      (p) =>
        p.id === trimmed ||
        p.variants.some(
          (v) =>
            v.sku.toUpperCase() === trimmed.toUpperCase() ||
            (v.barcode && v.barcode.toUpperCase() === trimmed.toUpperCase())
        )
    );

    if (matchedProduct) {
      matchedType = 'product';
      matchedProd = matchedProduct;
      matchedVar =
        matchedProduct.variants.find(
          (v) =>
            v.sku.toUpperCase() === trimmed.toUpperCase() ||
            (v.barcode && v.barcode.toUpperCase() === trimmed.toUpperCase())
        ) || matchedProduct.variants[0];
      title = matchedProduct.name;
      sub = `Variant: ${matchedVar.name} • SKU: ${matchedVar.sku}`;

      // Multi-Scan mode buffers items; Single-scan adds directly to POS Cart
      if (isMultiScan) {
        setMultiScanBuffer((prevBuffer) => {
          const existingIdx = prevBuffer.findIndex(
            (b) => b.product.id === matchedProd!.id && b.variant.sku === matchedVar!.sku
          );
          if (existingIdx >= 0) {
            const updated = [...prevBuffer];
            updated[existingIdx] = {
              ...updated[existingIdx],
              qty: updated[existingIdx].qty + 1,
            };
            return updated;
          }
          return [
            ...prevBuffer,
            {
              id: `${matchedVar!.sku}-${Date.now()}`,
              product: matchedProd!,
              variant: matchedVar!,
              qty: 1,
            },
          ];
        });
        playBeepSound('success');
        setScanStatusToast(`Buffered: ${matchedProduct.name}`);
      } else {
        playBeepSound('success');
        setScanStatusToast(null);
      }
    } else {
      const matchedCustomer = customers.find(
        (c) =>
          c.id.toUpperCase() === trimmed.toUpperCase() ||
          c.email.toLowerCase() === trimmed.toLowerCase()
      );
      if (matchedCustomer) {
        matchedType = 'customer';
        matchedCust = matchedCustomer;
        title = matchedCustomer.name;
        sub = `Customer • Tier: ${matchedCustomer.tier} • ${matchedCustomer.email}`;
        playBeepSound('success');
        setScanStatusToast(null);
      } else {
        const matchedOrder = orders.find(
          (o) =>
            o.id.toUpperCase() === trimmed.toUpperCase() ||
            o.orderNumber.toUpperCase() === trimmed.toUpperCase()
        );
        if (matchedOrder) {
          matchedType = 'order';
          matchedOrd = matchedOrder;
          title = `Order #${matchedOrder.orderNumber}`;
          sub = `Amount: $${matchedOrder.totalAmount.toFixed(
            2
          )} • Date: ${new Date(matchedOrder.createdAt).toLocaleDateString()}`;
          playBeepSound('success');
          setScanStatusToast(null);
        } else {
          playBeepSound('error');
          setScanStatusToast(null);
        }
      }
    }

    setLastScannedItem({
      code: trimmed,
      type: matchedType,
      title,
      sub,
      product: matchedProd,
      variant: matchedVar,
      customer: matchedCust,
      order: matchedOrd,
    });

    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 600);
    setManualCode('');
  };

  // Start Real Camera Hardware Scanning using Html5Qrcode
  const startCameraScan = async () => {
    setCameraError(null);
    try {
      const elementId = 'html5qr-code-viewfinder';
      const element = document.getElementById(elementId);
      if (!element) return;

      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
        } catch {
          // ignore cleanup err
        }
      }

      const html5QrCode = new Html5Qrcode(elementId);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 20,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const vw = viewfinderWidth > 0 ? viewfinderWidth : 400;
            const vh = viewfinderHeight > 0 ? viewfinderHeight : 300;
            const calcW = Math.floor(vw * 0.88);
            const calcH = Math.floor(vh * 0.78);
            return {
              width: Math.max(60, calcW),
              height: Math.max(60, calcH),
            };
          },
        },
        (decodedText) => {
          processScannedCode(decodedText);
        },
        () => {
          // frame loop
        }
      );

      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Camera initialization error:', err);
      setIsCameraActive(false);
      setCameraError(
        err?.message ||
          'Could not access camera device. Please check permissions or use physical USB scanner.'
      );
    }
  };

  const stopCameraScan = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Error stopping camera:', err);
      }
      html5QrCodeRef.current = null;
    }
    setIsCameraActive(false);
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !isCameraActive) return;
    try {
      const nextTorch = !torchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        // @ts-ignore
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch {
      alert('Flashlight control is not supported on this device.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('html5qr-code-file-helper');
      const result = await html5QrCode.scanFile(file, true);
      processScannedCode(result);
      html5QrCode.clear();
    } catch (err: any) {
      alert(`Could not decode code from image: ${err?.message || 'Invalid barcode payload'}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        startCameraScan();
      }, 300);
      return () => {
        clearTimeout(timer);
        stopCameraScan();
      };
    } else {
      stopCameraScan();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processScannedCode(manualCode);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* HEADER */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold">
              <Camera className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm tracking-tight text-white">
                  Barcode & QR Scanner
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {/* Multi-Scan Toggle */}
            <button
              type="button"
              onClick={() => setIsMultiScan(!isMultiScan)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isMultiScan
                  ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-purple-300" />
              <span>Multi-Scan</span>
              {multiScanBuffer.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold">
                  {multiScanBuffer.reduce((acc, i) => acc + i.qty, 0)}
                </span>
              )}
            </button>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-slate-800/80 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800/80 text-slate-500 border-slate-700'
              }`}
              title={soundEnabled ? 'Beep enabled' : 'Muted'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Torch Toggle */}
            {isCameraActive && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                  torchOn
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700'
                }`}
                title="Toggle Torch"
              >
                <Zap className="w-4 h-4" />
              </button>
            )}

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
          {/* Custom CSS for Scanner Viewfinder */}
          <style>{`
            @keyframes laserScanSweep {
              0% { top: 6%; opacity: 0.85; }
              50% { top: 90%; opacity: 1; }
              100% { top: 6%; opacity: 0.85; }
            }
            .animate-laser-sweep {
              animation: laserScanSweep 2s ease-in-out infinite;
            }
            #html5qr-code-viewfinder {
              width: 100% !important;
              height: 100% !important;
              position: relative !important;
              overflow: hidden !important;
              border: none !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              background-color: transparent !important;
            }
            #html5qr-code-viewfinder video {
              width: 100% !important;
              height: 100% !important;
              object-fit: cover !important;
            }
            #html5qr-code-viewfinder__scan_region {
              width: 100% !important;
              height: 100% !important;
              border: none !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
            }
            #qr-shaded-region, #qr-shaded-region * {
              display: none !important;
            }
            #html5qr-code-viewfinder__scan_region img,
            #html5qr-code-viewfinder__scan_region canvas,
            #html5qr-code-viewfinder__dashboard,
            #html5qr-code-viewfinder__status_span,
            #html5qr-code-viewfinder div a,
            #html5qr-code-viewfinder span {
              display: none !important;
            }
          `}</style>

          {/* REAL CAMERA VIEWFINDER CONTAINER */}
          <div className="relative mx-auto w-full h-52 sm:h-60 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center shadow-inner">
            <div id="html5qr-code-viewfinder" className="w-full h-full" />
            <div id="html5qr-code-file-helper" className="hidden" />

            {/* Target Reticle Overlay */}
            {isCameraActive && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center z-10">
                <div
                  className={`w-[85%] h-[80%] border-2 rounded-xl relative transition-all duration-300 overflow-hidden ${
                    scanFlash
                      ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.7)]'
                      : 'border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                  }`}
                >
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-400 -mt-0.5 -ml-0.5 rounded-tl-sm" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-400 -mt-0.5 -mr-0.5 rounded-tr-sm" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-400 -mb-0.5 -ml-0.5 rounded-bl-sm" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-400 -mb-0.5 -mr-0.5 rounded-br-sm" />

                  <div
                    className={`w-full h-0.5 bg-rose-500 shadow-[0_0_10px_#f43f5e] absolute left-0 animate-laser-sweep ${
                      scanFlash ? 'opacity-20' : 'opacity-100'
                    }`}
                  />
                </div>
                <p className="text-[10px] font-bold text-slate-300 bg-slate-950/80 px-2.5 py-0.5 rounded-full mt-1.5 border border-slate-800">
                  {scanFlash ? 'Code Recognized' : 'Align Barcode or QR Code in Frame'}
                </p>
              </div>
            )}

            {/* In-Camera Start/Stop Toggle Button when Camera is Active */}
            {isCameraActive && (
              <button
                type="button"
                onClick={stopCameraScan}
                className="absolute top-2.5 right-2.5 z-20 px-2.5 py-1 bg-slate-950/80 hover:bg-rose-950/90 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition-all shadow-md cursor-pointer"
                title="Stop Camera Feed"
              >
                <VideoOff className="w-3.5 h-3.5 text-rose-400" />
                <span>Stop Scanner</span>
              </button>
            )}

            {/* Camera Stopped / Paused Overlay */}
            {!isCameraActive && !cameraError && (
              <div className="absolute inset-0 z-20 bg-slate-950/90 flex flex-col items-center justify-center p-4 space-y-2.5 animate-in fade-in">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                  <VideoOff className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-white">Camera Scanner Paused</p>
                  <p className="text-[11px] text-slate-400">Press start to resume live hardware scanning</p>
                </div>
                <button
                  type="button"
                  onClick={startCameraScan}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-colors shadow-lg"
                >
                  <Video className="w-4 h-4" />
                  <span>Start Camera Scanner</span>
                </button>
              </div>
            )}

            {/* Recognition Flash Overlay */}
            {scanFlash && (
              <div className="pointer-events-none absolute inset-0 bg-emerald-500/15 backdrop-blur-2xs z-30 flex items-center justify-center animate-in fade-in duration-100">
                <div className="bg-slate-950/90 text-emerald-400 border border-emerald-400/80 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Code Scanned</span>
                </div>
              </div>
            )}

            {/* Camera Error State */}
            {cameraError && (
              <div className="p-4 text-center z-10 bg-slate-950/95 inset-0 absolute flex flex-col items-center justify-center space-y-2">
                <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <VideoOff className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-300 max-w-xs">{cameraError}</p>
                <button
                  type="button"
                  onClick={startCameraScan}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>
              </div>
            )}
          </div>

          {/* INTEGRATED MANUAL INPUT & IMAGE UPLOAD BAR */}
          <div className="space-y-1.5">
            <form onSubmit={handleManualSubmit} className="flex gap-1.5">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={inputRef}
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Type barcode or scan with USB reader..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs font-mono text-white focus:outline-none focus:border-amber-500/80 transition-colors"
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl transition-colors cursor-pointer"
                title="Scan from Image File"
              >
                <Upload className="w-4 h-4 text-amber-400" />
              </button>

              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all disabled:opacity-30 cursor-pointer"
              >
                Enter
              </button>
            </form>

            {/* Test Shortcuts Collapsible Pill */}
            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                onClick={() => setShowTestShortcuts(!showTestShortcuts)}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Test Barcodes</span>
                {showTestShortcuts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {/* Toast Message (Only when non-empty) */}
              {scanStatusToast && (
                <span className="text-[11px] font-medium text-emerald-400 animate-in fade-in truncate max-w-[200px]">
                  {scanStatusToast}
                </span>
              )}
            </div>

            {showTestShortcuts && (
              <div className="p-2.5 bg-slate-950/80 border border-slate-800/80 rounded-xl flex flex-wrap gap-1.5 animate-in fade-in duration-150">
                <button
                  type="button"
                  onClick={() => processScannedCode('CHAIR-AERO-BLK')}
                  className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-md text-[10px] font-mono cursor-pointer"
                >
                  + CHAIR-AERO-BLK
                </button>
                <button
                  type="button"
                  onClick={() => processScannedCode('DESK-OAK-STD')}
                  className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-md text-[10px] font-mono cursor-pointer"
                >
                  + DESK-OAK-STD
                </button>
                <button
                  type="button"
                  onClick={() => processScannedCode('#ORD-1001')}
                  className="px-2 py-0.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-md text-[10px] font-mono cursor-pointer"
                >
                  Receipt #ORD-1001
                </button>
                <button
                  type="button"
                  onClick={() => processScannedCode('CUST-101')}
                  className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-md text-[10px] font-mono cursor-pointer"
                >
                  Customer CUST-101
                </button>
                <button
                  type="button"
                  onClick={() => processScannedCode('UNKNOWN-ITEM-999')}
                  className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-md text-[10px] font-mono cursor-pointer"
                >
                  Unknown Item
                </button>
              </div>
            )}
          </div>

          {/* SCANNED ITEM DISPLAY / RESULT CARD (PLACED DIRECTLY BELOW SEARCH BAR) */}
          {lastScannedItem && (
            <div className="animate-in fade-in duration-200">
              {/* UNKNOWN / NOT AVAILABLE ITEM ALERT (SINGLE CLEAN CARD, NO DUPLICATE MESSAGES) */}
              {lastScannedItem.type === 'unknown' && (
                <div className="p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl text-rose-200 flex items-center justify-between text-xs shadow-md">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="p-1.5 bg-rose-500/20 rounded-lg text-rose-400 shrink-0">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <span className="font-bold text-rose-300 block text-xs">Item Not Available in Inventory</span>
                      <span className="text-[11px] text-rose-200/80 font-mono truncate block">
                        Payload: {lastScannedItem.code}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLastScannedItem(null)}
                    className="text-rose-400 hover:text-white p-1.5 rounded-lg hover:bg-rose-900/50 shrink-0 cursor-pointer transition-colors"
                    title="Dismiss alert"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* MATCHED AVAILABLE PRODUCT (LISTED BELOW SEARCH BAR WITH ADD BUTTON) */}
              {lastScannedItem.type === 'product' && lastScannedItem.product && lastScannedItem.variant && (
                <div className="p-3.5 bg-slate-950 border border-emerald-500/40 rounded-xl space-y-2.5 shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                        <PackageCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                            {lastScannedItem.product.name}
                          </h4>
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                            Available
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {lastScannedItem.variant.name} • SKU: {lastScannedItem.variant.sku}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-emerald-400 block">
                        ${lastScannedItem.variant.price.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        Stock: {getTotalStockForVariant(lastScannedItem.variant)} pcs
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                    <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => setScanQty(Math.max(1, scanQty - 1))}
                        className="p-1 text-slate-400 hover:text-white rounded"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-white">{scanQty}</span>
                      <button
                        type="button"
                        onClick={() => setScanQty(scanQty + 1)}
                        className="p-1 text-slate-400 hover:text-white rounded"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (lastScannedItem.product && lastScannedItem.variant) {
                          if (isMultiScan) {
                            setMultiScanBuffer((prevBuffer) => {
                              const existingIdx = prevBuffer.findIndex(
                                (b) => b.product.id === lastScannedItem.product!.id && b.variant.sku === lastScannedItem.variant!.sku
                              );
                              if (existingIdx >= 0) {
                                const updated = [...prevBuffer];
                                updated[existingIdx] = {
                                  ...updated[existingIdx],
                                  qty: updated[existingIdx].qty + scanQty,
                                };
                                return updated;
                              }
                              return [
                                ...prevBuffer,
                                {
                                  id: `${lastScannedItem.variant!.sku}-${Date.now()}`,
                                  product: lastScannedItem.product!,
                                  variant: lastScannedItem.variant!,
                                  qty: scanQty,
                                },
                              ];
                            });
                            setScanStatusToast(`Buffered: ${lastScannedItem.product.name}`);
                          } else {
                            addToPosCart(lastScannedItem.product, lastScannedItem.variant, scanQty);
                            setScanStatusToast(`Added ${scanQty}x to POS Cart`);
                          }
                          playBeepSound('success');
                        }
                      }}
                      className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                    >
                      <Plus className="w-4 h-4 font-bold" />
                      <span>Add {scanQty > 1 ? `${scanQty}x ` : ''}to Cart</span>
                    </button>
                  </div>
                </div>
              )}

              {/* MATCHED ORDER RECEIPT */}
              {lastScannedItem.type === 'order' && lastScannedItem.order && (
                <div className="p-3 bg-slate-950 border border-sky-500/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <Receipt className="w-4 h-4 text-sky-400" />
                      <span className="font-bold text-white">Order #{lastScannedItem.order.orderNumber}</span>
                    </div>
                    <span className="text-sky-400 font-bold">${lastScannedItem.order.totalAmount.toFixed(2)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (lastScannedItem.order) {
                        onScanResult(lastScannedItem.order.orderNumber);
                        onClose();
                      }
                    }}
                    className="w-full py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View Receipt Details</span>
                  </button>
                </div>
              )}

              {/* MATCHED CUSTOMER */}
              {lastScannedItem.type === 'customer' && lastScannedItem.customer && (
                <div className="p-3 bg-slate-950 border border-amber-500/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4 text-amber-400" />
                      <span className="font-bold text-white">{lastScannedItem.customer.name}</span>
                    </div>
                    <span className="text-amber-400 text-[11px] font-semibold">Tier: {lastScannedItem.customer.tier}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (lastScannedItem.customer) {
                        setSelectedPosCustomer(lastScannedItem.customer);
                        setScanStatusToast(`Attached ${lastScannedItem.customer.name} to Cart`);
                        playBeepSound('success');
                      }
                    }}
                    className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Attach Customer to POS Order</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MULTI-SCAN BATCH BUFFER TRAY */}
          {(isMultiScan || multiScanBuffer.length > 0) && (
            <div className="p-3 bg-slate-950 border border-purple-500/40 rounded-xl space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      Multi-Scan Batch ({multiScanBuffer.reduce((a, b) => a + b.qty, 0)})
                    </h4>
                  </div>
                </div>

                {multiScanBuffer.length > 0 && (
                  <span className="text-xs font-bold text-emerald-400">
                    Subtotal: ${multiScanBuffer.reduce((s, i) => s + i.variant.price * i.qty, 0).toFixed(2)}
                  </span>
                )}
              </div>

              {multiScanBuffer.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {multiScanBuffer.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 bg-slate-900/90 border border-slate-800/80 rounded-lg flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-200 truncate">{item.product.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {item.variant.name} • ${item.variant.price.toFixed(2)} ea
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0 bg-slate-950 rounded-md p-0.5 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleUpdateBufferQty(item.id, -1)}
                          className="p-0.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center font-bold text-white text-xs">{item.qty}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateBufferQty(item.id, 1)}
                          className="p-0.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromBuffer(item.id)}
                          className="p-0.5 text-rose-400 hover:text-rose-300 rounded transition-colors ml-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic text-center py-1">
                  Scan multiple items in sequence. They will accumulate here before adding to cart.
                </p>
              )}

              {multiScanBuffer.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClearMultiScanBuffer}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-rose-400 rounded-lg text-xs font-semibold border border-slate-800 cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitMultiScanBuffer}
                    className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Commit Batch ({multiScanBuffer.reduce((a, b) => a + b.qty, 0)}) to Cart</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex justify-between items-center shrink-0 text-xs">
          <div className="flex items-center space-x-2 text-slate-400">
            <span className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-[11px]">{isCameraActive ? 'Camera Active' : 'Scanner Ready'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
