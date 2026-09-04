import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Order } from '../../types';
import { ReceiptTemplateConfig } from '../../types/receipt';
import { useCommerce } from '../../context/CommerceContext';
import { buildQrPayload, generateEscPosStream } from '../../utils/receiptUtils';
import { QrCode, ExternalLink, ShieldCheck, CheckCircle2, Copy, FileText, Sparkles, ChefHat, Gift, DollarSign } from 'lucide-react';

interface ReceiptTemplateEngineProps {
  order: Order;
  config: ReceiptTemplateConfig;
  onOpenQrVerificationModal?: (url: string, label: string) => void;
}

export const ReceiptTemplateEngine: React.FC<ReceiptTemplateEngineProps> = ({
  order,
  config,
  onOpenQrVerificationModal,
}) => {
  const { formatCurrency, currentLocation } = useCommerce();
  const [copiedEscPos, setCopiedEscPos] = useState(false);
  const qrInfo = buildQrPayload(order, config);

  const handleCopyEscPos = () => {
    const stream = generateEscPosStream(order, config);
    navigator.clipboard.writeText(stream);
    setCopiedEscPos(true);
    setTimeout(() => setCopiedEscPos(false), 2000);
  };

  // Determine container styling based on paper width or template type
  const is58mm = config.templateType === 'compact58mm' || config.paperWidthMm === 58;
  const isKitchen = config.templateType === 'kitchen';
  const isGift = config.templateType === 'gift';
  const isInvoice = config.templateType === 'invoice';

  if (config.showEscPosPreview) {
    const escPosOutput = generateEscPosStream(order, config);
    return (
      <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto space-y-3 border border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center space-x-2 text-slate-300">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span className="font-bold uppercase tracking-wider">ESC/POS Thermal Command Stream</span>
          </div>
          <button
            onClick={handleCopyEscPos}
            className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded border border-emerald-500/30 text-[11px] font-bold flex items-center space-x-1 transition-colors cursor-pointer"
          >
            {copiedEscPos ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedEscPos ? 'Copied Bytes!' : 'Copy ESC/POS Stream'}</span>
          </button>
        </div>
        <pre className="whitespace-pre-wrap leading-relaxed text-[11px] text-emerald-300/90">{escPosOutput}</pre>
      </div>
    );
  }

  // A4 Commercial Tax Invoice Template Layout
  if (isInvoice) {
    return (
      <div className="bg-white text-slate-900 p-6 md:p-8 rounded-xl shadow-sm border border-slate-200 font-sans text-xs print:p-0 print:border-none print:shadow-none">
        {/* Invoice Header */}
        <div className="flex flex-wrap justify-between items-start gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">{config.storeName}</h1>
            <p className="text-slate-600 font-medium">{currentLocation.name}</p>
            <p className="text-slate-500">{currentLocation.address}</p>
            <p className="text-slate-500">Phone: {currentLocation.phone} • Tax ID: {config.taxRegistrationNumber}</p>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-slate-900 text-white font-extrabold text-sm uppercase rounded tracking-wider">
              OFFICIAL TAX INVOICE
            </span>
            <p className="mt-2 text-sm font-bold text-slate-900">Invoice #: {order.orderNumber}</p>
            <p className="text-slate-500">Date: {new Date(order.createdAt).toLocaleString()}</p>
            <p className="text-slate-500">Fulfillment: {order.fulfillmentMethod}</p>
          </div>
        </div>

        {/* Customer & Billing Info */}
        <div className="py-4 grid grid-cols-2 gap-4 border-b border-slate-200 text-slate-700">
          <div>
            <span className="font-bold uppercase text-[10px] tracking-wider text-slate-400 block mb-1">Billed To Customer</span>
            <p className="font-bold text-slate-900">{order.customerName || 'Walk-in Retail Customer'}</p>
            {order.customerEmail && <p>{order.customerEmail}</p>}
            {order.customerPhone && <p>{order.customerPhone}</p>}
            {order.customerTier && <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold rounded">{order.customerTier} Member</span>}
          </div>
          <div className="text-right">
            <span className="font-bold uppercase text-[10px] tracking-wider text-slate-400 block mb-1">POS Shift Details</span>
            <p><span className="text-slate-500">Terminal Location:</span> {order.locationName}</p>
            <p><span className="text-slate-500">Cashier:</span> {order.cashierName || 'Terminal 01'}</p>
            <p><span className="text-slate-500">Payment Status:</span> <strong className="text-emerald-600 font-bold uppercase">{order.paymentStatus}</strong></p>
          </div>
        </div>

        {/* Invoice Itemized Table */}
        <div className="py-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-900 text-[10px] font-black uppercase text-slate-600">
                <th className="py-2 pl-1">Item Description</th>
                <th className="py-2">SKU</th>
                <th className="py-2 text-center">Qty</th>
                <th className="py-2 text-right">Unit Price</th>
                <th className="py-2 text-right">Tax Rate</th>
                <th className="py-2 text-right pr-1">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {order.items.map((item, idx) => {
                const lineTotal = item.price * item.quantity * (1 - (item.discountPercentage || 0) / 100);
                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 pl-1">
                      <p className="font-bold text-slate-900">{item.productName}</p>
                      {item.variantName && <span className="text-[10px] text-slate-500">{item.variantName}</span>}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-slate-600">{item.sku}</td>
                    <td className="py-2.5 text-center font-bold">{item.quantity}</td>
                    <td className="py-2.5 text-right">{formatCurrency(item.price)}</td>
                    <td className="py-2.5 text-right font-medium text-slate-500">{item.taxRate || 10}%</td>
                    <td className="py-2.5 text-right pr-1 font-bold text-slate-900">{formatCurrency(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals & Working QR Code */}
        <div className="py-4 border-t border-slate-200 grid grid-cols-12 gap-6 items-start">
          <div className="col-span-7 flex items-center space-x-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div
              className="bg-white p-2 rounded border border-slate-300 cursor-pointer shadow-xs hover:border-blue-500 transition-all group"
              onClick={() => onOpenQrVerificationModal?.(qrInfo.url, qrInfo.displayLabel)}
              title="Click to simulate scanning QR Code"
            >
              <QRCodeSVG
                value={qrInfo.url}
                size={80}
                bgColor="#FFFFFF"
                fgColor="#000000"
                level="M"
              />
              <span className="text-[8px] text-blue-600 group-hover:underline block text-center mt-1 font-bold">
                Scan Code
              </span>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-[11px] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified Tax Digital Invoice</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{qrInfo.displayLabel}</p>
              <p className="text-[9px] font-mono text-slate-400 mt-1 break-all bg-white p-1 rounded border border-slate-200 max-w-xs">
                {qrInfo.url}
              </p>
            </div>
          </div>

          <div className="col-span-5 space-y-1 text-right text-slate-700 font-medium">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-bold text-slate-900">{formatCurrency(order.subtotal)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Total Savings / Discount:</span>
                <span className="font-bold">-{formatCurrency(order.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tax Amount ({config.taxRegistrationNumber}):</span>
              <span className="font-bold text-slate-900">{formatCurrency(order.taxAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-900">
              <span>GRAND TOTAL:</span>
              <span>{formatCurrency(order.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Invoice Footer */}
        <div className="pt-4 border-t border-slate-200 text-center text-[10px] text-slate-500 space-y-1">
          <p className="font-bold text-slate-700">{config.footerNote}</p>
          <p>{config.returnPolicyText}</p>
        </div>
      </div>
    );
  }

  // Kitchen / Order Prep Ticket Layout
  if (isKitchen) {
    return (
      <div className="bg-amber-100/90 text-slate-900 p-5 rounded-xl border-2 border-amber-300 font-mono text-xs shadow-inner print:bg-white print:text-black">
        <div className="text-center pb-3 border-b-2 border-slate-900 space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-amber-300 font-black text-sm uppercase rounded">
            <ChefHat className="w-4 h-4" />
            <span>KITCHEN PREP TICKET</span>
          </div>
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mt-1">
            ORDER #{order.orderNumber}
          </h2>
          <p className="text-[11px] font-bold text-slate-700">
            Fulfillment: {order.fulfillmentMethod} • Location: {currentLocation.name}
          </p>
          <p className="text-[10px] text-slate-600">Time Placed: {new Date(order.createdAt).toLocaleTimeString()}</p>
        </div>

        <div className="py-3 border-b-2 border-slate-900 space-y-2">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex items-start justify-between bg-white/80 p-2 rounded border border-amber-200">
              <div>
                <span className="text-sm font-black text-slate-900">{item.productName}</span>
                {item.variantName && <p className="text-[10px] font-bold text-amber-800">{item.variantName}</p>}
                <p className="text-[9px] text-slate-500">SKU: {item.sku}</p>
              </div>
              <div className="px-2.5 py-1 bg-slate-900 text-white rounded font-black text-sm">
                x{item.quantity}
              </div>
            </div>
          ))}
        </div>

        {order.notes && (
          <div className="py-2.5 bg-amber-200/80 p-2.5 rounded border border-amber-400 my-2 text-slate-900">
            <strong className="block text-[10px] uppercase font-black text-amber-900">Special Order Notes:</strong>
            <p className="font-bold text-xs mt-0.5">{order.notes}</p>
          </div>
        )}

        {/* QR Station Tracker */}
        <div className="pt-3 text-center space-y-1">
          <div
            className="inline-block bg-white p-2 rounded-lg border border-slate-300 cursor-pointer shadow-xs hover:ring-2 hover:ring-amber-500 transition-all"
            onClick={() => onOpenQrVerificationModal?.(qrInfo.url, qrInfo.displayLabel)}
            title="Click to simulate station barcode scan"
          >
            <QRCodeSVG
              value={qrInfo.url}
              size={100}
              bgColor="#FFFFFF"
              fgColor="#000000"
              level="M"
            />
          </div>
          <p className="text-[9px] font-bold text-slate-700 uppercase tracking-wider">{qrInfo.displayLabel}</p>
          <p className="text-[8px] font-mono text-slate-500">STATION-TRACK: {order.orderNumber}</p>
        </div>
      </div>
    );
  }

  // Gift Receipt Layout
  if (isGift) {
    return (
      <div className="bg-amber-50/70 text-slate-900 p-5 rounded-xl border border-amber-200 font-mono text-xs shadow-xs print:bg-white print:text-black">
        <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-400">
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-purple-100 text-purple-800 font-bold text-[10px] rounded uppercase">
            <Gift className="w-3.5 h-3.5 text-purple-600" />
            <span>GIFT RECEIPT (NO PRICES)</span>
          </div>
          <h2 className="text-base font-black tracking-tight uppercase text-slate-900 mt-1">{config.storeName}</h2>
          <p className="text-[10px] text-slate-600">{currentLocation.name}</p>
          <p className="text-[10px] text-slate-500">{currentLocation.address}</p>
        </div>

        <div className="py-2.5 space-y-0.5 text-[11px] border-b border-dashed border-slate-400">
          <div className="flex justify-between">
            <span className="text-slate-600">Gift Receipt #:</span>
            <strong className="font-bold text-slate-900">{order.orderNumber}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Date:</span>
            <span className="text-slate-900">{new Date(order.createdAt).toLocaleDateString()}</span>
          </div>
          {order.customerName && (
            <div className="flex justify-between">
              <span className="text-slate-600">Purchased For:</span>
              <span className="text-slate-900 font-semibold">{order.customerName}</span>
            </div>
          )}
        </div>

        {/* Gift Items List (Without Prices) */}
        <div className="py-3 border-b border-dashed border-slate-400 space-y-2">
          <p className="font-bold text-[10px] uppercase text-slate-600">Items Included:</p>
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start text-[11px] py-1 border-b border-slate-200/60 last:border-none">
              <div>
                <p className="font-bold text-slate-900">{item.productName}</p>
                <p className="text-[9px] text-slate-500">{item.variantName} • SKU: {item.sku}</p>
              </div>
              <span className="font-bold text-slate-900 bg-amber-100 px-2 py-0.5 rounded text-[10px]">
                x{item.quantity}
              </span>
            </div>
          ))}
        </div>

        {/* Gift QR Code for Exchange */}
        <div className="pt-3 text-center space-y-1.5">
          <p className="text-[10px] font-bold text-purple-900 uppercase">Gift Exchange QR Code</p>
          <div
            className="inline-block bg-white p-2 rounded border border-slate-300 cursor-pointer shadow-xs hover:border-purple-500 transition-all group"
            onClick={() => onOpenQrVerificationModal?.(qrInfo.url, qrInfo.displayLabel)}
            title="Click to simulate QR scan for gift exchange"
          >
            <QRCodeSVG
              value={qrInfo.url}
              size={config.qrCodeSize}
              bgColor="#FFFFFF"
              fgColor="#000000"
              level="M"
            />
            <span className="text-[8px] text-purple-600 group-hover:underline block text-center mt-1 font-bold">
              Test Scan Code
            </span>
          </div>
          <p className="text-[9px] text-slate-600 max-w-xs mx-auto leading-tight">
            Present this QR code at any store location for gift exchange or store credit within 30 days.
          </p>
        </div>
      </div>
    );
  }

  // Standard 80mm or 58mm Thermal Receipt Layout
  return (
    <div
      className={`mx-auto bg-amber-50/50 text-slate-900 font-mono text-xs p-4 rounded-xl border border-slate-200 shadow-xs print:p-0 print:bg-white print:text-black print:border-none print:shadow-none ${
        is58mm ? 'max-w-[280px] text-[10px]' : 'max-w-md text-[11px]'
      }`}
    >
      {/* Header */}
      <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-400">
        <h2 className={`font-black uppercase text-slate-900 tracking-tighter ${is58mm ? 'text-xs' : 'text-sm'}`}>
          {config.storeName}
        </h2>
        {config.storeSubtitle && <p className="text-[9px] text-slate-600 font-sans">{config.storeSubtitle}</p>}
        <p className="text-[10px] text-slate-700 font-semibold">{currentLocation.name}</p>
        <p className="text-[9px] text-slate-500">{currentLocation.address}</p>
        <p className="text-[9px] text-slate-500">Tel: {currentLocation.phone} • Tax ID: {config.taxRegistrationNumber}</p>
        {config.headerNote && <p className="text-[9px] text-blue-700 font-bold pt-1">{config.headerNote}</p>}
      </div>

      {/* Metadata */}
      <div className="py-2 space-y-0.5 border-b border-dashed border-slate-400 text-[10px]">
        <div className="flex justify-between">
          <span className="text-slate-600">Receipt #:</span>
          <strong className="font-bold text-slate-900">{order.orderNumber}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Date:</span>
          <span className="text-slate-900">{new Date(order.createdAt).toLocaleString()}</span>
        </div>
        {config.showCashierName && (
          <div className="flex justify-between">
            <span className="text-slate-600">Cashier:</span>
            <span className="text-slate-900">{order.cashierName || 'Terminal 01'}</span>
          </div>
        )}
        {config.showCustomerDetails && order.customerName && (
          <div className="flex justify-between">
            <span className="text-slate-600">Customer:</span>
            <span className="text-slate-900 font-semibold">{order.customerName} {order.customerTier ? `[${order.customerTier}]` : ''}</span>
          </div>
        )}
      </div>

      {/* Line Items */}
      <div className="py-2.5 border-b border-dashed border-slate-400 space-y-2">
        <div className="grid grid-cols-12 font-bold text-[9px] uppercase text-slate-600 border-b border-slate-300 pb-1">
          <span className="col-span-6">Item / Details</span>
          <span className="col-span-2 text-center">Qty</span>
          <span className="col-span-2 text-right">Price</span>
          <span className="col-span-2 text-right">Total</span>
        </div>

        {order.items.map((item, idx) => {
          const lineTotal = item.price * item.quantity * (1 - (item.discountPercentage || 0) / 100);
          return (
            <div key={idx} className="grid grid-cols-12 text-[10px] items-start pt-0.5">
              <div className="col-span-6 pr-1">
                <p className="font-bold leading-tight text-slate-900">{item.productName}</p>
                {item.variantName && <p className="text-[8px] text-slate-500">{item.variantName}</p>}
                {config.showItemSkus && <p className="text-[8px] text-slate-400 font-mono">SKU: {item.sku}</p>}
                {item.discountPercentage ? (
                  <span className="text-[8px] text-rose-600 font-bold block">-{item.discountPercentage}% Discount</span>
                ) : null}
              </div>
              <div className="col-span-2 text-center text-slate-700 font-semibold">{item.quantity} {item.unit}</div>
              <div className="col-span-2 text-right text-slate-700">{formatCurrency(item.price)}</div>
              <div className="col-span-2 text-right font-bold text-slate-900">{formatCurrency(lineTotal)}</div>
            </div>
          );
        })}
      </div>

      {/* Financial Totals */}
      <div className="py-2 space-y-1 text-[10px] border-b border-dashed border-slate-400">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal:</span>
          <span className="text-slate-900 font-semibold">{formatCurrency(order.subtotal)}</span>
        </div>
        {order.discountAmount > 0 && config.showSavingsSummary && (
          <div className="flex justify-between text-rose-600 font-bold">
            <span>Savings ({order.discountCode || 'Discount'}):</span>
            <span>-{formatCurrency(order.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-600">
          <span>Tax Amount:</span>
          <span className="text-slate-900 font-semibold">{formatCurrency(order.taxAmount)}</span>
        </div>
        <div className="flex justify-between text-xs font-black pt-1 border-t border-slate-400 text-slate-900">
          <span>TOTAL PAID:</span>
          <span>{formatCurrency(order.totalAmount)}</span>
        </div>
      </div>

      {/* Payment Tender Breakdown */}
      <div className="py-2 space-y-0.5 text-[9px] border-b border-dashed border-slate-400">
        <span className="font-bold uppercase text-slate-500 block">Tenders Received:</span>
        {order.payments.map((p, pIdx) => (
          <div key={pIdx} className="flex justify-between text-slate-800">
            <span>{p.method} {p.reference ? `(${p.reference})` : ''}:</span>
            <span className="font-bold">{formatCurrency(p.amount)}</span>
          </div>
        ))}
      </div>

      {/* Working QR Code & Footer */}
      <div className="pt-3 text-center space-y-1">
        {config.showLoyaltyPoints && order.loyaltyPointsEarned > 0 && (
          <p className="font-bold text-blue-700 text-[10px]">
            ★ Loyalty Points Earned: +{order.loyaltyPointsEarned} pts
          </p>
        )}

        <div className="py-1 flex flex-col items-center justify-center">
          <div
            className="border-2 border-slate-900 p-2 bg-white inline-block rounded shadow-xs cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all group"
            onClick={() => onOpenQrVerificationModal?.(qrInfo.url, qrInfo.displayLabel)}
            title="Click to test scan QR code"
          >
            <QRCodeSVG
              value={qrInfo.url}
              size={config.qrCodeSize}
              bgColor="#FFFFFF"
              fgColor="#000000"
              level="M"
            />
            <span className="text-[8px] text-blue-600 group-hover:underline block text-center mt-1 font-bold">
              Click to Test Scan
            </span>
          </div>
        </div>

        <p className="text-[9px] font-bold text-slate-800 uppercase tracking-tight">{qrInfo.displayLabel}</p>
        <p className="text-[8px] font-mono text-slate-400">REF: {order.orderNumber}</p>

        <p className="text-[9px] text-slate-600 font-semibold pt-1">{config.footerNote}</p>
        <p className="text-[8px] text-slate-500 max-w-xs mx-auto">{config.returnPolicyText}</p>
      </div>
    </div>
  );
};
