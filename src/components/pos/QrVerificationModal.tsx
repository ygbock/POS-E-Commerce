import React, { useState } from 'react';
import { Order } from '../../types';
import { ReceiptTemplateConfig } from '../../types/receipt';
import { QRCodeSVG } from 'qrcode.react';
import { buildQrPayload } from '../../utils/receiptUtils';
import { useCommerce } from '../../context/CommerceContext';
import { QrCode, CheckCircle2, ExternalLink, ShieldCheck, X, Camera, RefreshCw, Sparkles, Smartphone, ArrowRight, Package, ArrowLeftRight } from 'lucide-react';

interface QrVerificationModalProps {
  order: Order | null;
  config: ReceiptTemplateConfig;
  isOpen: boolean;
  onClose: () => void;
  customUrl?: string;
  customLabel?: string;
}

export const QrVerificationModal: React.FC<QrVerificationModalProps> = ({
  order,
  config,
  isOpen,
  onClose,
  customUrl,
  customLabel,
}) => {
  const { formatCurrency } = useCommerce();
  const [scanSimulated, setScanSimulated] = useState(false);
  const [activeView, setActiveView] = useState<'scan' | 'digital-receipt' | 'returns-portal'>('scan');

  if (!isOpen || !order) return null;

  const qrInfo = buildQrPayload(order, config);
  const targetUrl = customUrl || qrInfo.url;
  const labelText = customLabel || qrInfo.displayLabel;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight text-white">Interactive QR Code Resolver</h3>
              <p className="text-[11px] text-slate-400">Verifying receipt payload & digital destination</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 pt-2">
          <button
            onClick={() => setActiveView('scan')}
            className={`px-3 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeView === 'scan'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>QR Scanner Test</span>
          </button>
          <button
            onClick={() => setActiveView('digital-receipt')}
            className={`px-3 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeView === 'digital-receipt'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Digital E-Receipt Landing</span>
          </button>
          <button
            onClick={() => setActiveView('returns-portal')}
            className={`px-3 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeView === 'returns-portal'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Returns Portal View</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {activeView === 'scan' && (
            <div className="space-y-4 text-center">
              {/* Simulated Camera Scanner View */}
              <div className="relative mx-auto w-48 h-48 bg-slate-950 rounded-2xl p-4 flex flex-col items-center justify-center border-2 border-slate-800 shadow-inner group overflow-hidden">
                <QRCodeSVG
                  value={targetUrl}
                  size={140}
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                  level="H"
                  className="rounded"
                />

                {/* Laser scan animation overlay */}
                <div className="absolute inset-x-0 h-1 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse top-1/2" />
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
              </div>

              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold text-xs">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Valid Encoded Payload</span>
                </span>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{labelText}</p>
              </div>

              {/* Encoded Data Stream Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-left space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>DECODED DATA PAYLOAD</span>
                  <span className="text-blue-600 font-mono text-[10px]">Type: {config.qrTargetType}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all">
                  {targetUrl}
                </div>
                <p className="text-[10px] text-slate-500">
                  When scanned with any smartphone camera or optical scanner, this payload directs the user to the verified online record.
                </p>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setActiveView('digital-receipt')}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-blue-600/20"
                >
                  <span>Simulate Opening E-Receipt</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {activeView === 'digital-receipt' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 rounded-2xl text-white space-y-1 shadow-md">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                    Verified E-Receipt Portal
                  </span>
                  <span className="text-xs font-bold">Order #{order.orderNumber}</span>
                </div>
                <h4 className="text-lg font-black">{config.storeName}</h4>
                <p className="text-xs text-blue-100">Issued on {new Date(order.createdAt).toLocaleString()}</p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Purchased Items ({order.items.length})
                </h5>
                <div className="divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                  {order.items.map((item, i) => (
                    <div key={i} className="py-2 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{item.productName}</p>
                        <p className="text-[10px] text-slate-500">{item.variantName} • Qty: {item.quantity}</p>
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-black">
                  <span className="text-slate-800 dark:text-slate-200">Total Paid:</span>
                  <span className="text-blue-600 dark:text-blue-400">{formatCurrency(order.totalAmount)}</span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl flex items-center space-x-3 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold">Digital Warranty & Proof of Purchase Active</p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    This digital receipt is cryptographically tied to transaction {order.orderNumber}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeView === 'returns-portal' && (
            <div className="space-y-4">
              <div className="bg-slate-900 p-4 rounded-2xl text-white space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded border border-rose-500/40">
                    Self-Service Returns Portal
                  </span>
                  <span className="text-xs text-slate-400">Order #{order.orderNumber}</span>
                </div>
                <h4 className="text-base font-bold text-white">Initiate Item Return or Exchange</h4>
                <p className="text-xs text-slate-400">Eligible for return until 30 days from purchase.</p>
              </div>

              <div className="space-y-2 text-xs">
                {order.items.map((item, i) => (
                  <div key={i} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{item.productName}</p>
                      <p className="text-[10px] text-slate-500">{item.variantName} • {formatCurrency(item.price)}</p>
                    </div>
                    <button className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer">
                      Select for Return
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
          <span className="text-slate-500 font-mono text-[11px]">Payload Verified</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
