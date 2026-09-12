
import React from 'react';
import { Product, ProductVariant, Order } from '../../types';
import { ProductDetailModal } from './ProductDetailModal';
import { OrderTrackingModal } from './OrderTrackingModal';
import { OrderNotificationHubModal } from './OrderNotificationHubModal';
import { AccountClaimModal } from './AccountClaimModal';
import { OrderSuccessModal } from './OrderSuccessModal';
import { WishlistDrawer } from './WishlistDrawer';
import { StoreCartDrawer } from './StoreCartDrawer';
import { CustomerAccountModal, AccountPortalTab } from './CustomerAccountModal';
import { StoreCheckoutModal } from './StoreCheckoutModal';

export interface StorefrontOverlaysProps {
  selectedDetailProduct: Product | null;
  setSelectedDetailProduct: (product: Product | null) => void;
  addToStoreCart: (product: Product, variant: ProductVariant, quantity?: number) => void;
  onBuyNow: (product: Product, variant: ProductVariant, quantity: number) => void;
  isOrderTrackingOpen: boolean;
  setIsOrderTrackingOpen: (open: boolean) => void;
  initialTrackingNumber: string;
  initialTrackingEmail: string;
  isNotificationHubOpen: boolean;
  setIsNotificationHubOpen: (open: boolean) => void;
  selectedNotificationOrder: Order | null;
  setSelectedNotificationOrder: (order: Order | null) => void;
  isClaimModalOpen: boolean;
  setIsClaimModalOpen: (open: boolean) => void;
  claimModalEmail: string;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
  goCart: () => void;
  goCheckout: () => void;
  isWishlistDrawerOpen: boolean;
  setIsWishlistDrawerOpen: (open: boolean) => void;
  isAccountModalOpen: boolean;
  setIsAccountModalOpen: (open: boolean) => void;
  accountPortalTab: AccountPortalTab;
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
  isSuccessModalOpen: boolean;
  setIsSuccessModalOpen: (open: boolean) => void;
  successOrder: Order | null;
  setInitialTrackingNumber: (value: string) => void;
  setInitialTrackingEmail: (value: string) => void;
  setClaimModalEmail: (value: string) => void;
}

export const StorefrontOverlays: React.FC<StorefrontOverlaysProps> = ({
  selectedDetailProduct, setSelectedDetailProduct, addToStoreCart, onBuyNow,
  isOrderTrackingOpen, setIsOrderTrackingOpen, initialTrackingNumber, initialTrackingEmail,
  isNotificationHubOpen, setIsNotificationHubOpen, selectedNotificationOrder, setSelectedNotificationOrder,
  isClaimModalOpen, setIsClaimModalOpen, claimModalEmail,
  isCartDrawerOpen, setIsCartDrawerOpen, goCart, goCheckout,
  isWishlistDrawerOpen, setIsWishlistDrawerOpen,
  isAccountModalOpen, setIsAccountModalOpen, accountPortalTab,
  isCheckoutOpen, setIsCheckoutOpen, isSuccessModalOpen, setIsSuccessModalOpen, successOrder,
  setInitialTrackingNumber, setInitialTrackingEmail, setClaimModalEmail,
}) => (
  <>
    {/* Order Tracking Live Modal (Method 1 & on-site tracking) */}
    <OrderTrackingModal
      isOpen={isOrderTrackingOpen}
      onClose={() => setIsOrderTrackingOpen(false)}
      initialOrderNumber={initialTrackingNumber}
      initialEmail={initialTrackingEmail}
      onOpenNotificationHub={(ord) => {
        setSelectedNotificationOrder(ord);
        setIsNotificationHubOpen(true);
      }}
      onOpenClaimAccount={(email) => {
        setClaimModalEmail(email || '');
        setIsClaimModalOpen(true);
      }}
    />

    {/* Order Notification & Magic Links Hub Modal (Method 2 & Method 3) */}
    <OrderNotificationHubModal
      isOpen={isNotificationHubOpen}
      onClose={() => setIsNotificationHubOpen(false)}
      order={selectedNotificationOrder}
      onOpenLiveTracking={(orderNumber, email) => {
        setInitialTrackingNumber(orderNumber);
        setInitialTrackingEmail(email || '');
        setIsOrderTrackingOpen(true);
      }}
      onOpenClaimModal={(email) => {
        setClaimModalEmail(email || '');
        setIsClaimModalOpen(true);
      }}
    />

    {/* Retroactive Account Claim Modal (Method 4) */}
    <AccountClaimModal
      isOpen={isClaimModalOpen}
      onClose={() => setIsClaimModalOpen(false)}
      initialEmail={claimModalEmail}
      onOpenOrderTracking={(orderNumber, email) => {
        setInitialTrackingNumber(orderNumber);
        setInitialTrackingEmail(email || '');
        setIsOrderTrackingOpen(true);
      }}
    />

    {/* Product Detail Modal */}
    {selectedDetailProduct && (
      <ProductDetailModal
        product={selectedDetailProduct}
        onClose={() => setSelectedDetailProduct(null)}
        onAddToCart={addToStoreCart}
        onBuyNow={handleBuyNow}
        onSelectRelatedProduct={(rel) => setSelectedDetailProduct(rel)}
      />
    )}

    {/* Cart Drawer */}
    <StoreCartDrawer
      isOpen={isCartDrawerOpen}
      onClose={() => setIsCartDrawerOpen(false)}
      onProceedToCheckout={goCheckout}
    />

    {/* Wishlist Drawer */}
    <WishlistDrawer
      isOpen={isWishlistDrawerOpen}
      onClose={() => setIsWishlistDrawerOpen(false)}
      onSelectProduct={(prod) => setSelectedDetailProduct(prod)}
      onOpenCart={goCart}
    />

    {/* Customer Account Portal Modal with integrated Tracking & Wishlist */}
    <CustomerAccountModal
      isOpen={isAccountModalOpen}
      onClose={() => setIsAccountModalOpen(false)}
      initialTab={accountPortalTab}
      initialOrderNumber={initialTrackingNumber}
      initialTrackingEmail={initialTrackingEmail}
      onSelectProduct={(prod) => setSelectedDetailProduct(prod)}
      onOpenCart={() => setIsCartDrawerOpen(true)}
      onOpenNotificationHub={(ord) => {
        setSelectedNotificationOrder(ord);
        setIsNotificationHubOpen(true);
      }}
      onOpenClaimModal={(email) => {
        setClaimModalEmail(email || '');
        setIsClaimModalOpen(true);
      }}
    />

    {/* Checkout Modal */}
    <StoreCheckoutModal
      isOpen={isCheckoutOpen}
      onClose={() => setIsCheckoutOpen(false)}
      onOrderSuccess={(order) => {
        setSuccessOrder(order);
        setIsSuccessModalOpen(true);
      }}
    />

    {/* Enhanced Order Success Modal with 4-Way Tracking Access */}
    <OrderSuccessModal
      isOpen={isSuccessModalOpen}
      onClose={() => setIsSuccessModalOpen(false)}
      order={successOrder}
      onOpenTracking={(num, email) => {
        setInitialTrackingNumber(num);
        setInitialTrackingEmail(email || '');
        setAccountPortalTab('tracking');
        setIsAccountModalOpen(true);
      }}
      onOpenNotificationHub={(ord) => {
        setSelectedNotificationOrder(ord);
        setIsNotificationHubOpen(true);
      }}
      onOpenClaimModal={(email) => {
        setClaimModalEmail(email || '');
        setIsClaimModalOpen(true);
      }}
    />


  </>
);
