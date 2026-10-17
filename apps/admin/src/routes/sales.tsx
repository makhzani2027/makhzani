/**
 * مسارات البيع والمال والمتجر والنظام — يملكها وكيل admin-sales (system/10-team.md).
 * كل صفحة lazy. الترتيب = ترتيب شريط التبويبات داخل القسم.
 */
import { lazy } from 'react';
import type { AppRoute } from './types';

const Soon = lazy(() => import('../pages/core/UnderConstruction'));
const Overview = lazy(() => import('../pages/sales/Overview'));
const Pos = lazy(() => import('../pages/sales/Pos'));
const Invoices = lazy(() => import('../pages/sales/Invoices'));
const InvoiceDetail = lazy(() => import('../pages/sales/InvoiceDetail'));
const Quotations = lazy(() => import('../pages/sales/Quotations'));
const QuotationForm = lazy(() => import('../pages/sales/QuotationForm'));
const Orders = lazy(() => import('../pages/sales/Orders'));
const OrderDetail = lazy(() => import('../pages/sales/OrderDetail'));
const Requests = lazy(() => import('../pages/sales/Requests'));

const Customers = lazy(() => import('../pages/finance/Customers'));
const CustomerDetail = lazy(() => import('../pages/finance/CustomerDetail'));
const Debts = lazy(() => import('../pages/finance/Debts'));
const Receipts = lazy(() => import('../pages/finance/Receipts'));
const Accounts = lazy(() => import('../pages/finance/Accounts'));
const Statements = lazy(() => import('../pages/finance/Statements'));
const Cash = lazy(() => import('../pages/finance/Cash'));
const Expenses = lazy(() => import('../pages/finance/Expenses'));
const Reports = lazy(() => import('../pages/finance/Reports'));

const Storefront = lazy(() => import('../pages/store/Storefront'));
const Coupons = lazy(() => import('../pages/store/Coupons'));
const Delivery = lazy(() => import('../pages/store/Delivery'));
const Notifications = lazy(() => import('../pages/store/Notifications'));
const Reviews = lazy(() => import('../pages/store/Reviews'));

export const salesRoutes: AppRoute[] = [
  { path: '/', label: 'نظرة عامة', icon: 'grid', group: 'home', perm: 'dashboard.view', element: Overview, order: 0 },
  { path: '/pos', label: 'نقطة البيع', icon: 'pos', group: 'sales', perm: 'pos.sell', element: Pos, order: 1, full: true },
  { path: '/invoices', label: 'فواتير البيع', icon: 'receipt', group: 'sales', perm: 'invoices.view', element: Invoices, order: 2 },
  { path: '/invoices/:id', label: 'الفاتورة', icon: 'receipt', group: 'sales', perm: 'invoices.view', element: InvoiceDetail, nav: false },
  { path: '/returns', label: 'المرتجعات', icon: 'return', group: 'sales', perm: 'invoices.view', element: Invoices, order: 3 },
  { path: '/quotations', label: 'عروض الأسعار', icon: 'fileText', group: 'sales', perm: 'quotations.manage', element: Quotations, order: 4 },
  { path: '/quotations/new', label: 'عرض سعر جديد', icon: 'fileText', group: 'sales', perm: 'quotations.manage', element: QuotationForm, nav: false },
  { path: '/quotations/:id', label: 'عرض السعر', icon: 'fileText', group: 'sales', perm: 'quotations.manage', element: QuotationForm, nav: false },
  { path: '/orders', label: 'الطلبات', icon: 'bag', group: 'sales', perm: 'orders.view', element: Orders, order: 5, badge: 'ordersNew' },
  { path: '/orders/:id', label: 'الطلب', icon: 'bag', group: 'sales', perm: 'orders.view', element: OrderDetail, nav: false },
  { path: '/requests', label: 'طلبات التوفير', icon: 'request', group: 'sales', perm: 'requests.manage', element: Requests, order: 6, badge: 'requestsNew' },
  { path: '/customers', label: 'الزبائن', icon: 'users', group: 'finance', perm: 'customers.view', element: Customers, order: 1 },
  { path: '/customers/:id', label: 'الزبون', icon: 'user', group: 'finance', perm: 'customers.view', element: CustomerDetail, nav: false },
  { path: '/debts', label: 'الديون', icon: 'debt', group: 'finance', perm: 'finance.view', element: Debts, order: 2 },
  { path: '/receipts', label: 'السندات', icon: 'wallet', group: 'finance', perm: 'finance.view', element: Receipts, order: 3 },
  { path: '/accounts', label: 'الصناديق والحسابات', icon: 'bank', group: 'finance', perm: 'finance.view', element: Accounts, order: 4 },
  { path: '/statements', label: 'الكشوفات', icon: 'fileText', group: 'finance', perm: 'finance.view', element: Statements, order: 5 },
  { path: '/cash', label: 'الصندوق', icon: 'cash', group: 'finance', perm: 'finance.view', element: Cash, order: 6 },
  { path: '/expenses', label: 'المصروفات', icon: 'expense', group: 'finance', perm: 'finance.view', element: Expenses, order: 7 },
  { path: '/reports', label: 'التقارير', icon: 'chartBar', group: 'finance', perm: 'reports.view', element: Reports, order: 8 },
  { path: '/storefront', label: 'واجهة المتجر', icon: 'layout', group: 'store', perm: 'store.manage', element: Storefront, order: 1 },
  { path: '/coupons', label: 'الكوبونات', icon: 'ticket', group: 'store', perm: 'store.manage', element: Coupons, order: 2 },
  { path: '/delivery', label: 'التوصيل والدفع', icon: 'truck', group: 'store', perm: 'store.manage', element: Delivery, order: 3 },
  { path: '/notifications', label: 'الإشعارات', icon: 'megaphone', group: 'store', perm: 'notifications.send', element: Notifications, order: 4 },
  { path: '/reviews', label: 'التقييمات', icon: 'star', group: 'store', perm: 'products.write', element: Reviews, order: 5 },
  { path: '/staff', label: 'المستخدمون', icon: 'idCard', group: 'system', perm: 'staff.manage', element: Soon, order: 1 },
  { path: '/settings', label: 'الإعدادات', icon: 'settings', group: 'system', perm: 'settings.manage', element: Soon, order: 2 },
  { path: '/audit', label: 'سجل العمليات', icon: 'history', group: 'system', perm: 'audit.view', element: Soon, order: 3 },
];
