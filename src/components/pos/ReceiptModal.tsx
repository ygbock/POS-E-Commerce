import React, { useState } from 'react';
import { Order } from '../../types';
import { ReceiptTemplateConfig, DEFAULT_RECEIPT_CONFIG, ReceiptTemplateType, QrCodeTargetType } from '../../types/receipt';
import { ReceiptTemplateEngine } from './ReceiptTemplateEngine';
import { QrVerificationModal } from './QrVerificationModal';
import { Printer, Check, X, QrCode, Settings, Code2, Eye, Sparkles, Sliders, ChevronDown, ChevronUp, Copy, CheckCircle2 } from 'lucide-react';

interface ReceiptModalProps {
  order: Order | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ order, onClose }) => {
  const [config, setConfig] = useState<ReceiptTemplateConfig>(DEFAULT_RECEIPT_CONFIG);
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalUrl, setQrModalUrl] = useState('');
  const [qrModalLabel, setQrModalLabel] = useState('');

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleOpenQrModal = (url: string, label: string) => {
    setQrModalUrl(url);
    setQrModalLabel(label);
    setQrModalOpen(true);
  };

  const templates: { type: ReceiptTemplateType; label: string; desc: string; icon: string }[] = [
    { type: 'standard80mm', label: '80mm Standard', desc: 'Default Retail Thermal', icon: '🧾' },
    { type: 'compact58mm', label: '58mm Mobile', desc: 'Bluetooth / Pocket Thermal', icon: '📱' },
    { type: 'gift', label: 'Gift Receipt', desc: 'No Prices + Gift QR', icon: '🎁' },
    { type: 'kitchen', label: 'Kitchen Ticket', desc: 'Order Station Prep', icon: '👨‍🍳' },
    { type: 'invoice', label: 'A4 Tax Invoice', desc: 'Formal VAT / Commercial', icon: '📄' },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto print:p-0 print:bg-white print:static">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto flex flex-col max-h-[92vh] print:max-w-none print:shadow-none print:border-none print:rounded-none print:max-h-none">
          {/* Top Control Bar (Hidden on Print) */}
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-tight">Receipt Generator & Thermal Printer Engine</h3>
                <p className="text-[11px] text-slate-400">Transaction #{order.orderNumber}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setConfig({ ...config, showEscPosPreview: !config.showEscPosPreview })}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  config.showEscPosPreview
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                }`}
                title="Toggle raw ESC/POS command stream preview"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ESC/POS Raw</span>
              </button>

              <button
                onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  showConfigDrawer
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Customizer</span>
              </button>

              <button
                onClick={handlePrint}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-600/20"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Template Switcher Tabs (Hidden on Print) */}
          <div className="bg-slate-100 dark:bg-slate-950 p-2 border-b border-slate-200 dark:border-slate-800 shrink-0 print:hidden overflow-x-auto custom-scrollbar">
            <div className="flex space-x-1.5 min-w-max">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.type}
                  onClick={() =>
                    setConfig({
                      ...config,
                      templateType: tmpl.type,
                      paperWidthMm: tmpl.type === 'compact58mm' ? 58 : tmpl.type === 'invoice' ? 210 : 80,
                    })
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    config.templateType === tmpl.type
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-900'
                  }`}
                >
                  <span>{tmpl.icon}</span>
                  <span>{tmpl.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Customizer Drawer */}
          {showConfigDrawer && (
            <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 p-4 shrink-0 text-xs space-y-3 print:hidden max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <span className="font-extrabold text-slate-800 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-600" />
                  <span>Receipt Template & QR Code Customizer</span>
                </span>
                <button
                  onClick={() => setConfig(DEFAULT_RECEIPT_CONFIG)}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-bold"
                >
                  Reset Defaults
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Store Header & Tax */}
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 text-[11px]">Store Name</label>
                  <input
                    type="text"
                    value={config.storeName}
                    onChange={(e) => setConfig({ ...config, storeName: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-900 dark:text-white"
                  />

                  <label className="block font-bold text-slate-700 dark:text-slate-300 text-[11px]">Tax ID / VAT #</label>
                  <input
                    type="text"
                    value={config.taxRegistrationNumber}
                    onChange={(e) => setConfig({ ...config, taxRegistrationNumber: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                {/* QR Target Action */}
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 text-[11px]">QR Code Target Action</label>
                  <select
                    value={config.qrTargetType}
                    onChange={(e) => setConfig({ ...config, qrTargetType: e.target.value as QrCodeTargetType })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-900 dark:text-white font-medium"
                  >
                    <option value="e-receipt">Digital E-Receipt & Warranty</option>
                    <option value="returns-portal">Self-Service Returns Portal</option>
                    <option value="feedback-survey">Customer Feedback & Survey</option>
                    <option value="tax-verification">Official Fiscal Tax Verification</option>
                    <option value="custom-url">Custom Web Link</option>
                  </select>

                  {config.qrTargetType === 'custom-url' && (
                    <input
                      type="text"
                      placeholder="https://yourstore.com/target"
                      value={config.customQrUrl || ''}
                      onChange={(e) => setConfig({ ...config, customQrUrl: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-900 dark:text-white"
                    />
                  )}

                  <label className="block font-bold text-slate-700 dark:text-slate-300 text-[11px]">QR Code Module Size (px)</label>
                  <input
                    type="range"
                    min="80"
                    max="180"
                    value={config.qrCodeSize}
                    onChange={(e) => setConfig({ ...config, qrCodeSize: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                {/* Show/Hide Toggles */}
                <div className="space-y-1.5 pt-1">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 text-[11px] mb-1">Display Options</label>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showItemSkus}
                        onChange={(e) => setConfig({ ...config, showItemSkus: e.target.checked })}
                      />
                      <span>Item SKUs</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showCashierName}
                        onChange={(e) => setConfig({ ...config, showCashierName: e.target.checked })}
                      />
                      <span>Cashier Name</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showCustomerDetails}
                        onChange={(e) => setConfig({ ...config, showCustomerDetails: e.target.checked })}
                      />
                      <span>Customer Details</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showLoyaltyPoints}
                        onChange={(e) => setConfig({ ...config, showLoyaltyPoints: e.target.checked })}
                      />
                      <span>Loyalty Points</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Receipt Preview Canvas Body */}
          <div className="p-4 md:p-6 bg-slate-100 dark:bg-slate-950/60 overflow-y-auto flex-1 print:p-0 print:bg-white">
            <ReceiptTemplateEngine
              order={order}
              config={config}
              onOpenQrVerificationModal={handleOpenQrModal}
            />
          </div>

          {/* Footer Actions (Hidden on Print) */}
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center gap-2 shrink-0 print:hidden">
            <button
              onClick={() => handleOpenQrModal('', '')}
              className="px-3 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5 text-blue-600" />
              <span>Test QR Code Resolver</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-600/20"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Thermal Receipt</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Done / Next Sale
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive QR Code Inspector Modal */}
      <QrVerificationModal
        order={order}
        config={config}
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        customUrl={qrModalUrl}
        customLabel={qrModalLabel}
      />
    </>
  );
};
