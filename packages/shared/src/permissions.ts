/**
 * صلاحيات الموظفين — نفس المفاتيح في قاعدة البيانات (staff_roles.permissions، دالة has_perm).
 * صاحب المتجر (profiles.is_owner) يملك كل شيء دائماً.
 */

export const PERMISSION_GROUPS = [
  {
    key: 'sales',
    label: 'البيع والطلبات',
    items: [
      { key: 'dashboard.view', label: 'رؤية الرئيسية والملخصات' },
      { key: 'pos.sell', label: 'البيع من نقطة البيع' },
      { key: 'pos.discount', label: 'إعطاء خصم في نقطة البيع' },
      { key: 'pos.price_override', label: 'تغيير سعر البيع يدوياً' },
      { key: 'orders.view', label: 'رؤية طلبات التطبيق' },
      { key: 'orders.manage', label: 'إدارة الطلبات وتغيير حالتها' },
      { key: 'requests.manage', label: 'إدارة طلبات التوفير' },
    ],
  },
  {
    key: 'catalog',
    label: 'المنتجات والمخزون',
    items: [
      { key: 'products.view', label: 'رؤية المنتجات' },
      { key: 'products.write', label: 'إضافة وتعديل المنتجات والأقسام' },
      { key: 'products.delete', label: 'أرشفة وحذف المنتجات' },
      { key: 'inventory.view', label: 'رؤية المخزون والحركات' },
      { key: 'inventory.adjust', label: 'تعديل المخزون والجرد' },
      { key: 'inventory.transfer', label: 'النقل بين المخازن' },
      { key: 'purchases.manage', label: 'فواتير الشراء والموردون' },
      { key: 'costs.view', label: 'رؤية التكلفة والأرباح' },
    ],
  },
  {
    key: 'finance',
    label: 'الزبائن والمال',
    items: [
      { key: 'customers.view', label: 'رؤية الزبائن' },
      { key: 'customers.manage', label: 'إضافة وتعديل الزبائن' },
      { key: 'invoices.view', label: 'رؤية الفواتير' },
      { key: 'invoices.void', label: 'إلغاء الفواتير والإرجاع' },
      { key: 'finance.view', label: 'رؤية الديون والصندوق' },
      { key: 'finance.manage', label: 'تسجيل الدفعات والمصروفات والصندوق' },
      { key: 'reports.view', label: 'التقارير والتحليلات' },
    ],
  },
  {
    key: 'system',
    label: 'المتجر والنظام',
    items: [
      { key: 'store.manage', label: 'واجهة المتجر: البانرات والأقسام والكوبونات والتوصيل' },
      { key: 'notifications.send', label: 'إرسال الإشعارات' },
      { key: 'staff.manage', label: 'الموظفون والصلاحيات' },
      { key: 'settings.manage', label: 'إعدادات النظام' },
      { key: 'audit.view', label: 'سجل العمليات' },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number]['key'];
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export function permissionLabel(p: string): string {
  for (const g of PERMISSION_GROUPS) for (const i of g.items) if (i.key === p) return i.label;
  return p;
}

/** الأدوار الافتراضية (تُنشأ في seed، قابلة للتعديل من اللوحة ما عدا الاسم الثابت) */
export const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  {
    name: 'مدير',
    description: 'كل شيء عدا الموظفين والإعدادات',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'staff.manage' && p !== 'settings.manage'),
  },
  {
    name: 'كاشير',
    description: 'نقطة البيع والزبائن والفواتير',
    permissions: ['dashboard.view', 'pos.sell', 'pos.discount', 'orders.view', 'products.view', 'inventory.view', 'customers.view', 'customers.manage', 'invoices.view'],
  },
  {
    name: 'أمين مخزن',
    description: 'المنتجات والمخزون والمشتريات',
    permissions: ['dashboard.view', 'products.view', 'products.write', 'inventory.view', 'inventory.adjust', 'inventory.transfer', 'purchases.manage', 'costs.view'],
  },
  {
    name: 'مسؤول طلبات',
    description: 'طلبات التطبيق وطلبات التوفير',
    permissions: ['dashboard.view', 'orders.view', 'orders.manage', 'requests.manage', 'products.view', 'inventory.view', 'customers.view', 'invoices.view'],
  },
];

/** يفحص الصلاحية في الواجهة (الخادم يفحص دائماً بنفسه) */
export function can(user: { is_owner: boolean; permissions: readonly string[] } | null | undefined, p: Permission): boolean {
  if (!user) return false;
  return user.is_owner || user.permissions.includes(p);
}
