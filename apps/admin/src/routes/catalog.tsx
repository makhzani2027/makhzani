/**
 * مسارات المنتجات والمخزون — يملكها وكيل admin-catalog (system/10-team.md).
 * كل صفحة lazy حتى يبقى تحميل اللوحة الأول سريعاً.
 */
import { lazy } from 'react';
import type { AppRoute } from './types';

const Soon = lazy(() => import('../pages/core/UnderConstruction'));

export const catalogRoutes: AppRoute[] = [
  { path: '/products', label: 'المنتجات', icon: 'box', group: 'stock', perm: 'products.view', element: Soon, order: 1 },
  { path: '/products/new', label: 'منتج جديد', icon: 'plus', group: 'stock', perm: 'products.write', element: Soon, nav: false },
  { path: '/products/:id', label: 'المنتج', icon: 'box', group: 'stock', perm: 'products.view', element: Soon, nav: false },
  { path: '/categories', label: 'الأقسام والعلامات', icon: 'grid', group: 'stock', perm: 'products.view', element: Soon, order: 2 },
  { path: '/inventory', label: 'المخزون', icon: 'layers', group: 'stock', perm: 'inventory.view', element: Soon, order: 3, badge: 'lowStock' },
  { path: '/movements', label: 'حركة المخزون', icon: 'activity', group: 'stock', perm: 'inventory.view', element: Soon, order: 4 },
  { path: '/stocktakes', label: 'الجرد', icon: 'stocktake', group: 'stock', perm: 'inventory.adjust', element: Soon, order: 5 },
  { path: '/stocktakes/:id', label: 'جرد', icon: 'stocktake', group: 'stock', perm: 'inventory.adjust', element: Soon, nav: false },
  { path: '/transfers', label: 'النقل بين المخازن', icon: 'transfer', group: 'stock', perm: 'inventory.transfer', element: Soon, order: 6 },
  { path: '/warehouses', label: 'المخازن', icon: 'warehouse', group: 'stock', perm: 'inventory.view', element: Soon, order: 7 },
  { path: '/purchases', label: 'المشتريات', icon: 'stockIn', group: 'stock', perm: 'purchases.manage', element: Soon, order: 8 },
  { path: '/purchases/new', label: 'فاتورة شراء', icon: 'stockIn', group: 'stock', perm: 'purchases.manage', element: Soon, nav: false },
  { path: '/suppliers', label: 'الموردون', icon: 'supplier', group: 'stock', perm: 'purchases.manage', element: Soon, order: 9 },
  { path: '/suppliers/:id', label: 'المورد', icon: 'supplier', group: 'stock', perm: 'purchases.manage', element: Soon, nav: false },
];
