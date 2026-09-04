import { Order } from './index';

export type ReceiptTemplateType = 'standard80mm' | 'compact58mm' | 'gift' | 'kitchen' | 'invoice';

export type QrCodeTargetType = 'e-receipt' | 'returns-portal' | 'feedback-survey' | 'tax-verification' | 'custom-url';

export interface ReceiptTemplateConfig {
  templateType: ReceiptTemplateType;
  paperWidthMm: number; // 80 or 58 or 210 for A4
  
  // Branding & Header
  storeName: string;
  storeSubtitle: string;
  taxRegistrationNumber: string;
  showLogoText: boolean;
  
  // Custom Notes
  headerNote?: string;
  footerNote: string;
  returnPolicyText: string;

  // Toggle Features
  showItemSkus: boolean;
  showCashierName: boolean;
  showCustomerDetails: boolean;
  showLoyaltyPoints: boolean;
  showSavingsSummary: boolean;
  showTaxBreakdown: boolean;
  showEscPosPreview: boolean;

  // QR Code Settings
  qrTargetType: QrCodeTargetType;
  customQrUrl?: string;
  qrCodeSize: number;
  qrLabelText?: string;
}

export const DEFAULT_RECEIPT_CONFIG: ReceiptTemplateConfig = {
  templateType: 'standard80mm',
  paperWidthMm: 80,
  storeName: 'OMNICORE RETAIL & COMMERCE',
  storeSubtitle: 'Omnichannel POS & Inventory Engine',
  taxRegistrationNumber: 'VAT-98420194-TX',
  showLogoText: true,
  headerNote: 'Welcome to our flagship store!',
  footerNote: 'Thank you for shopping with us!',
  returnPolicyText: 'Returns & exchanges accepted within 30 days with receipt and original tags intact.',
  showItemSkus: true,
  showCashierName: true,
  showCustomerDetails: true,
  showLoyaltyPoints: true,
  showSavingsSummary: true,
  showTaxBreakdown: true,
  showEscPosPreview: false,
  qrTargetType: 'e-receipt',
  qrCodeSize: 110,
  qrLabelText: 'SCAN FOR DIGITAL RECEIPT & WARRANTY',
};
