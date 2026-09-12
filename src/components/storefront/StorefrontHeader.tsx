import React, { useState } from 'react';
import { Search, ShoppingCart, Heart, User, Menu, X, Gift, LayoutDashboard, Monitor, Bell, Package } from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { useStorefrontContext } from '../../context/StorefrontContext';

interface StorefrontHeaderProps {
  searchQuery:string; setSearchQuery:(query:string)=>void; selectedCategory:string; setSelectedCategory:(cat:string)=>void; selectedBrand:string; setSelectedBrand:(brand:string)=>void;
  onOpenCart:()=>void; onOpenWishlist:()=>void; onOpenAccount:()=>void; onOpenOrderTracking?:()=>void; onOpenNotificationHub?:()=>void; onOpenClaimModal?:()=>void; onOpenMobileFilters?:()=>void;
  activeSection:string; setActiveSection:(sec:string)=>void; onOpenAdmin?:()=>void; onOpenPos?:()=>void; isDarkMode:boolean; onToggleTheme:()=>void;
}
export const StorefrontHeader: React.FC<StorefrontHeaderProps> = (p) => {
  const { storeCart, wishlist, products } = useCommerce();
  const { tenant } = useStorefrontContext();
  const [menuOpen,setMenuOpen]=useState(false);
  const cartCount=storeCart.reduce((s,i)=>s+i.quantity,0);
  const brand=tenant?.branding || {};
  const logo=typeof brand.logoUrl==='string'?brand.logoUrl:null;
  const announcement=typeof tenant?.policies?.announcement==='string'?tenant.policies.announcement:null;
  const threshold=tenant?.policies?.freeShippingThreshold;
  const shipping=typeof threshold==='number' ? 'Free shipping over '+tenant.currency.symbol+threshold : null;
  const suggestions=p.searchQuery.trim()?products.filter(x=>x.status==='active'&&(x.name.toLowerCase().includes(p.searchQuery.toLowerCase())||x.brand.toLowerCase().includes(p.searchQuery.toLowerCase()))).slice(0,5):[];
  const go=(fn:()=>void)=>{fn();setMenuOpen(false);};
  return <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
    <div className="bg-slate-950 text-white min-h-8 px-3 sm:px-6 flex items-center justify-center gap-3 text-[11px]"><span className="truncate">{announcement||shipping||('Welcome to '+(tenant?.name||'our store'))}</span>{shipping&&announcement&&<span className="hidden md:inline text-slate-400">• {shipping}</span>}</div>
    <div className="max-w-[1700px] mx-auto px-3 sm:px-6 lg:px-10 py-3"><div className="flex items-center gap-3">
      <button type="button" onClick={()=>setMenuOpen(v=>!v)} className="lg:hidden h-11 w-11 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700" aria-label={menuOpen?'Close navigation menu':'Open navigation menu'} aria-expanded={menuOpen}>{menuOpen?<X/>:<Menu/>}</button>
      <button type="button" onClick={()=>go(()=>p.setActiveSection('home'))} className="flex items-center gap-2 min-w-0" aria-label="Go to storefront home">{logo?<img src={logo} alt="" className="h-10 w-10 rounded-xl object-cover"/>:<span className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Gift className="h-5 w-5"/></span>}<span className="font-black truncate">{tenant?.name||'Store'}</span></button>
      <nav className="hidden lg:flex items-center gap-1 ml-4" aria-label="Primary navigation"><button type="button" onClick={()=>p.setActiveSection('home')} className="px-3 py-2 rounded-lg text-sm">Home</button><button type="button" onClick={()=>p.setActiveSection('catalog')} className="px-3 py-2 rounded-lg text-sm">Shop</button></nav>
      <div className="relative flex-1 max-w-2xl mx-auto"><label htmlFor="storefront-search" className="sr-only">Search products</label><div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3"><Search className="h-4 w-4 text-slate-400"/><input id="storefront-search" value={p.searchQuery} onChange={e=>p.setSearchQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&p.searchQuery.trim())p.setActiveSection('catalog')}} placeholder="Search products…" className="w-full bg-transparent py-2.5 text-sm outline-none"/></div>{suggestions.length>0&&<div className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1 z-50">{suggestions.map(x=><button key={x.id} type="button" onClick={()=>{p.setSearchQuery(x.name);p.setActiveSection('catalog')}} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">{x.name}</button>)}</div>}</div>
      <div className="flex items-center gap-1"><button type="button" onClick={p.onOpenWishlist} className="h-11 w-11 rounded-xl flex items-center justify-center" aria-label="Wishlist"><Heart className="h-5 w-5"/></button><button type="button" onClick={p.onOpenCart} className="relative h-11 w-11 rounded-xl flex items-center justify-center" aria-label={'Cart, '+cartCount+' items'}><ShoppingCart className="h-5 w-5"/>{cartCount>0&&<span aria-hidden="true" className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center px-1">{cartCount}</span>}</button><button type="button" onClick={p.onOpenAccount} className="hidden sm:flex h-11 w-11 rounded-xl items-center justify-center" aria-label="Customer account"><User className="h-5 w-5"/></button></div>
    </div></div>
    {menuOpen&&<div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-1"><button type="button" onClick={()=>go(()=>p.setActiveSection('home'))} className="w-full text-left p-3 rounded-lg">Home</button><button type="button" onClick={()=>go(()=>p.setActiveSection('catalog'))} className="w-full text-left p-3 rounded-lg">Shop</button>{p.onOpenOrderTracking&&<button type="button" onClick={()=>go(p.onOpenOrderTracking!)} className="w-full text-left p-3 rounded-lg flex gap-2"><Package className="h-4 w-4"/>Track order</button>}{p.onOpenNotificationHub&&<button type="button" onClick={()=>go(p.onOpenNotificationHub!)} className="w-full text-left p-3 rounded-lg flex gap-2"><Bell className="h-4 w-4"/>Notifications</button>}{p.onOpenAdmin&&<button type="button" onClick={()=>go(p.onOpenAdmin!)} className="w-full text-left p-3 rounded-lg flex gap-2"><LayoutDashboard className="h-4 w-4"/>Admin</button>}{p.onOpenPos&&<button type="button" onClick={()=>go(p.onOpenPos!)} className="w-full text-left p-3 rounded-lg flex gap-2"><Monitor className="h-4 w-4"/>POS</button>}</div>}
  </header>;
};