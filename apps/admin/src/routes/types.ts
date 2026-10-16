import type { ComponentType, LazyExoticComponent } from 'react';
import type { IconName, Permission } from '@raqeem/shared';

/** أقسام القائمة الجانبية بالترتيب (لكل قسم لون) */
export const NAV_GROUPS = [
  { key: 'home', label: '', color: 'var(--accent)' },
  { key: 'sales', label: 'البيع', color: '#E8622A' },
  { key: 'stock', label: 'المخزون', color: '#86A8F0' },
  { key: 'finance', label: 'الزبائن والمال', color: '#5BC48D' },
  { key: 'store', label: 'المتجر', color: '#E7B04F' },
  { key: 'system', label: 'النظام', color: '#B3AA9C' },
] as const;
export type NavGroup = (typeof NAV_GROUPS)[number]['key'];

/** عدّادات حية تظهر بجانب التبويب */
export type BadgeKey = 'ordersNew' | 'requestsNew' | 'lowStock';

export interface AppRoute {
  /** المسار داخل اللوحة: '/products' أو '/products/:id' */
  path: string;
  label: string;
  icon: IconName;
  group: NavGroup;
  /** الصلاحية المطلوبة (بلا = لكل موظف) */
  perm?: Permission;
  element: LazyExoticComponent<ComponentType> | ComponentType;
  /** false = صفحة داخلية لا تظهر في القائمة */
  nav?: boolean;
  badge?: BadgeKey;
  /** صفحة بملء الشاشة بلا هوامش (نقطة البيع) */
  full?: boolean;
  /** ترتيب داخل القسم */
  order?: number;
}
