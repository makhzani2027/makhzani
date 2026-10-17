/**
 * مسارات المنتجات والمخزون — يملكها وكيل admin-catalog (system/10-team.md).
 * كل صفحة lazy حتى يبقى تحميل اللوحة الأول سريعاً. الترتيب = ترتيب شريط التبويبات.
 */
import { lazy } from 'react';
import type { AppRoute } from './types';

const StockHome = lazy(() => import('../pages/catalog/StockHome'));
const Products = lazy(() => import('../pages/catalog/Products'));
const ProductForm = lazy(() => import('../pages/catalog/ProductForm'));
const Categories = lazy(() => import('../pages/catalog/Categories'));
const BarcodePrint = lazy(() => import('../pages/catalog/BarcodePrint'));
const Barcodes = lazy(() => import('../pages/catalog/Barcodes'));
const Warehouses = lazy(() => import('../pages/inventory/Warehouses'));
const Suppliers = lazy(() => import('../pages/inventory/Suppliers'));
const SupplierDetail = lazy(() => import('../pages/inventory/SupplierDetail'));
const Samples = lazy(() => import('../pages/inventory/Samples'));
const Vouchers = lazy(() => import('../pages/inventory/Vouchers'));
const Stocktakes = lazy(() => import('../pages/inventory/Stocktakes'));
const StocktakeDetail = lazy(() => import('../pages/inventory/StocktakeDetail'));
const Transfers = lazy(() => import('../pages/inventory/Transfers'));
const Inventory = lazy(() => import('../pages/inventory/Inventory'));
const Movements = lazy(() => import('../pages/inventory/Movements'));
const Expiry = lazy(() => import('../pages/inventory/Expiry'));
const Purchases = lazy(() => import('../pages/inventory/Purchases'));
const PurchaseNew = lazy(() => import('../pages/inventory/PurchaseNew'));

export const catalogRoutes: AppRoute[] = [
  { path: '/stock', label: 'كل خيارات المخزون', icon: 'grid', group: 'stock', perm: 'products.view', element: StockHome, order: 0 },
  { path: '/products', label: 'المنتجات', icon: 'box', group: 'stock', perm: 'products.view', element: Products, order: 1 },
  { path: '/products/new', label: 'منتج جديد', icon: 'plus', group: 'stock', perm: 'products.write', element: ProductForm, nav: false },
  { path: '/products/:id', label: 'المنتج', icon: 'box', group: 'stock', perm: 'products.view', element: ProductForm, nav: false },
  { path: '/warehouses', label: 'المخازن', icon: 'warehouse', group: 'stock', perm: 'inventory.view', element: Warehouses, order: 2 },
  { path: '/suppliers', label: 'الموردون والشركات', icon: 'supplier', group: 'stock', perm: 'purchases.manage', element: Suppliers, order: 3 },
  { path: '/suppliers/:id', label: 'المورد', icon: 'supplier', group: 'stock', perm: 'purchases.manage', element: SupplierDetail, nav: false },
  { path: '/samples', label: 'العينات', icon: 'package', group: 'stock', perm: 'inventory.adjust', element: Samples, order: 4 },
  { path: '/barcodes/print', label: 'طباعة الباركود', icon: 'printer', group: 'stock', perm: 'products.view', element: BarcodePrint, order: 5 },
  { path: '/barcodes', label: 'إدارة الباركود', icon: 'barcode', group: 'stock', perm: 'products.write', element: Barcodes, order: 6 },
  { path: '/vouchers/in', label: 'إدخال مخزني', icon: 'stockIn', group: 'stock', perm: 'inventory.adjust', element: Vouchers, order: 7 },
  { path: '/vouchers/out', label: 'إخراج مخزني', icon: 'stockOut', group: 'stock', perm: 'inventory.adjust', element: Vouchers, order: 8 },
  { path: '/vouchers/damage', label: 'التالف', icon: 'damaged', group: 'stock', perm: 'inventory.adjust', element: Vouchers, order: 9 },
  { path: '/stocktakes', label: 'الجرد', icon: 'stocktake', group: 'stock', perm: 'inventory.adjust', element: Stocktakes, order: 10 },
  { path: '/stocktakes/:id', label: 'جرد', icon: 'stocktake', group: 'stock', perm: 'inventory.adjust', element: StocktakeDetail, nav: false },
  { path: '/transfers', label: 'النقل بين المخازن', icon: 'transfer', group: 'stock', perm: 'inventory.transfer', element: Transfers, order: 11 },
  { path: '/inventory', label: 'المخزون', icon: 'layers', group: 'stock', perm: 'inventory.view', element: Inventory, order: 12, badge: 'lowStock' },
  { path: '/movements', label: 'حركة المخزون', icon: 'activity', group: 'stock', perm: 'inventory.view', element: Movements, order: 13 },
  { path: '/expiry', label: 'الصلاحية', icon: 'clock', group: 'stock', perm: 'inventory.view', element: Expiry, order: 14 },
  { path: '/purchases', label: 'المشتريات', icon: 'invoice', group: 'stock', perm: 'purchases.manage', element: Purchases, order: 15 },
  { path: '/purchases/new', label: 'فاتورة شراء', icon: 'stockIn', group: 'stock', perm: 'purchases.manage', element: PurchaseNew, nav: false },
  { path: '/categories', label: 'الأقسام والعلامات', icon: 'tags', group: 'stock', perm: 'products.view', element: Categories, order: 16 },
];
