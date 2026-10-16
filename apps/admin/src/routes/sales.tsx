/**
 * مسارات البيع والمال والمتجر والنظام — يملكها وكيل admin-sales (system/10-team.md).
 */
import { lazy } from 'react';
import type { AppRoute } from './types';

const Soon = lazy(() => import('../pages/core/UnderConstruction'));

export const salesRoutes: AppRoute[] = [
  { path: '/', label: 'نظرة عامة', icon: 'grid', group: 'home', perm: 'dashboard.view', element: Soon, order: 0 },
  { path: '/pos', label: 'نقطة البيع', icon: 'pos', group: 'sales', perm: 'pos.sell', element: Soon, order: 1, full: true },
  { path: '/orders', label: 'الطلبات', icon: 'bag', group: 'sales', perm: 'orders.view', element: Soon, order: 2, badge: 'ordersNew' },
  { path: '/orders/:id', label: 'الطلب', icon: 'bag', group: 'sales', perm: 'orders.view', element: Soon, nav: false },
  { path: '/requests', label: 'طلبات التوفير', icon: 'request', group: 'sales', perm: 'requests.manage', element: Soon, order: 3, badge: 'requestsNew' },
  { path: '/invoices', label: 'الفواتير', icon: 'receipt', group: 'sales', perm: 'invoices.view', element: Soon, order: 4 },
  { path: '/invoices/:id', label: 'الفاتورة', icon: 'receipt', group: 'sales', perm: 'invoices.view', element: Soon, nav: false },
  { path: '/customers', label: 'الزبائن', icon: 'users', group: 'finance', perm: 'customers.view', element: Soon, order: 1 },
  { path: '/customers/:id', label: 'الزبون', icon: 'user', group: 'finance', perm: 'customers.view', element: Soon, nav: false },
  { path: '/debts', label: 'الديون', icon: 'debt', group: 'finance', perm: 'finance.view', element: Soon, order: 2 },
  { path: '/cash', label: 'الصندوق', icon: 'cash', group: 'finance', perm: 'finance.view', element: Soon, order: 3 },
  { path: '/expenses', label: 'المصروفات', icon: 'expense', group: 'finance', perm: 'finance.view', element: Soon, order: 4 },
  { path: '/reports', label: 'التقارير', icon: 'chartBar', group: 'finance', perm: 'reports.view', element: Soon, order: 5 },
  { path: '/storefront', label: 'واجهة المتجر', icon: 'layout', group: 'store', perm: 'store.manage', element: Soon, order: 1 },
  { path: '/coupons', label: 'الكوبونات', icon: 'ticket', group: 'store', perm: 'store.manage', element: Soon, order: 2 },
  { path: '/delivery', label: 'التوصيل والدفع', icon: 'truck', group: 'store', perm: 'store.manage', element: Soon, order: 3 },
  { path: '/notifications', label: 'الإشعارات', icon: 'megaphone', group: 'store', perm: 'notifications.send', element: Soon, order: 4 },
  { path: '/reviews', label: 'التقييمات', icon: 'star', group: 'store', perm: 'products.write', element: Soon, order: 5 },
  { path: '/staff', label: 'الموظفون', icon: 'idCard', group: 'system', perm: 'staff.manage', element: Soon, order: 1 },
  { path: '/settings', label: 'الإعدادات', icon: 'settings', group: 'system', perm: 'settings.manage', element: Soon, order: 2 },
  { path: '/audit', label: 'سجل العمليات', icon: 'history', group: 'system', perm: 'audit.view', element: Soon, order: 3 },
];
