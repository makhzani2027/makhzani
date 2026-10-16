/**
 * قاعدة بيانات وضع العرض: نسخة في الذاكرة من @raqeem/shared/demo يمكن الكتابة عليها خلال الجلسة.
 * كل صفحة تتحقق من IS_DEMO وتقرأ/تكتب هنا بدل Supabase، فتعمل اللوحة كاملة بلا خادم.
 * لا تحفظ شيئاً — تحديث الصفحة يعيد البيانات الأصلية.
 */
import * as d from '@raqeem/shared/demo';
import { DEFAULT_ROLES, type StaffRole } from '@raqeem/shared';

const now = () => new Date().toISOString();
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const roles: StaffRole[] = DEFAULT_ROLES.map((r, i) => ({ id: `role-${i + 1}`, name: r.name, description: r.description, permissions: [...r.permissions], is_system: true, created_at: now() }));

export const demoDb = {
  categories: clone(d.demoCategories),
  brands: clone(d.demoBrands),
  products: clone(d.demoProducts),
  product_variants: clone(d.demoVariants),
  variant_costs: Object.entries(d.demoCosts).map(([variant_id, cost]) => ({ variant_id, avg_cost: cost, last_cost: cost, updated_at: now() })),
  stock_levels: clone(d.demoStock),
  warehouses: clone(d.demoWarehouses),
  customers: clone(d.demoCustomers),
  suppliers: clone(d.demoSuppliers),
  orders: clone(d.demoOrders),
  order_items: clone(d.demoOrderItems),
  banners: clone(d.demoBanners),
  home_sections: clone(d.demoHomeSections),
  delivery_zones: clone(d.demoZones),
  coupons: clone(d.demoCoupons),
  product_requests: clone(d.demoRequests),
  staff_roles: roles,
  settings: { store: clone(d.demoStore), checkout: clone(d.demoCheckout) } as Record<string, unknown>,
};

export type DemoTable = Exclude<keyof typeof demoDb, 'settings'>;

let idSeq = 1000;
/** معرّف جديد بشكل uuid (للعرض فقط) */
export function demoId(): string {
  idSeq += 1;
  const r = Math.random().toString(16).slice(2, 14).padEnd(12, '0');
  return `00000000-0000-4000-9${String(idSeq).padStart(3, '0').slice(-3)}-${r}`;
}

/** تأخير بسيط يحاكي الشبكة حتى تظهر حالات التحميل في العرض */
export const demoDelay = (ms = 180) => new Promise((r) => setTimeout(r, ms));

const listeners = new Set<() => void>();
export function onDemoChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function demoChanged() {
  listeners.forEach((f) => f());
}
