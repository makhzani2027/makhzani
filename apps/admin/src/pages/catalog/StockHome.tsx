import { Link } from 'react-router-dom';
import type { Permission } from '@raqeem/shared';
import { Icon, PageHeader, Skeleton, Stat, type IconName } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { stockTotals, listLowStock } from '../inventory/api';
import { nearExpiry } from '../inventory/api-extra';
import './catalog.css';

interface Opt { to: string; icon: IconName; title: string; text: string; perm: Permission }

const OPTIONS: Opt[] = [
  { to: '/products', icon: 'box', title: 'المنتجات', text: 'أضف منتجاً، عدّل الأسعار والنسخ، وانشر في المتجر.', perm: 'products.view' },
  { to: '/warehouses', icon: 'warehouse', title: 'المخازن', text: 'المخازن والفروع، وأيها يدخل رصيده في المتجر.', perm: 'inventory.view' },
  { to: '/suppliers', icon: 'supplier', title: 'الموردون والشركات', text: 'أرصدة الموردين بالدينار والدولار وكشوف الحساب.', perm: 'purchases.manage' },
  { to: '/samples', icon: 'package', title: 'العينات', text: 'من أخذ عينة، وما لم يرجع منها بعد.', perm: 'inventory.adjust' },
  { to: '/barcodes/print', icon: 'printer', title: 'طباعة الباركود', text: 'ملصقات باركود أو QR بمقاس طابعتك.', perm: 'products.view' },
  { to: '/barcodes', icon: 'barcode', title: 'إدارة الباركود', text: 'باركود كل نسخة ووحدات التعبئة (كرتونة، درزن).', perm: 'products.write' },
  { to: '/vouchers/in', icon: 'stockIn', title: 'إدخال مخزني', text: 'إدخال بضاعة بلا فاتورة شراء: هدية، تصحيح، إنتاج.', perm: 'inventory.adjust' },
  { to: '/vouchers/out', icon: 'stockOut', title: 'إخراج مخزني', text: 'إخراج للاستعمال الداخلي أو لسبب آخر موثّق.', perm: 'inventory.adjust' },
  { to: '/vouchers/damage', icon: 'damaged', title: 'التالف', text: 'سجّل الكسر والتلف والمفقود بسبب واضح.', perm: 'inventory.adjust' },
  { to: '/stocktakes', icon: 'stocktake', title: 'الجرد', text: 'عُدّ بالقارئ، وراجع الفروق، ثم اعتمد.', perm: 'inventory.adjust' },
  { to: '/transfers', icon: 'transfer', title: 'النقل بين المخازن', text: 'انقل بضاعة من مخزن لآخر بسند مرقّم.', perm: 'inventory.transfer' },
  { to: '/inventory', icon: 'layers', title: 'المخزون', text: 'الأرصدة لكل مخزن، النواقص والراكد، والتسوية.', perm: 'inventory.view' },
  { to: '/movements', icon: 'activity', title: 'حركة المخزون', text: 'كل دخول وخروج باسم من قام به، مع التصدير.', perm: 'inventory.view' },
  { to: '/expiry', icon: 'clock', title: 'الصلاحية', text: 'الدفعات المنتهية والقريبة من الانتهاء.', perm: 'inventory.view' },
  { to: '/purchases', icon: 'invoice', title: 'المشتريات', text: 'فواتير الشراء بالدينار أو الدولار والدفعات.', perm: 'purchases.manage' },
  { to: '/categories', icon: 'tags', title: 'الأقسام والعلامات', text: 'شجرة الأقسام وترتيبها، والعلامات التجارية.', perm: 'products.view' },
];

/** كل خيارات المخزون في صفحة واحدة: أرقام سريعة ثم بطاقة لكل عملية */
export default function StockHome() {
  const { can } = useAuth();
  const fmt = useFmt();
  const withCost = can('costs.view');
  const totals = useLoad(() => stockTotals('', withCost), [withCost]);
  const alerts = useLoad(async () => {
    const [low, exp] = await Promise.all([can('inventory.view') ? listLowStock() : Promise.resolve([]), can('inventory.view') ? nearExpiry(30, false) : Promise.resolve([])]);
    return { low: low.length, exp: exp.length };
  }, []);
  const t = totals.data;
  const sk = <Skeleton h={30} w={90} />;
  return (
    <>
      <PageHeader title="كل خيارات المخزون" description="كل ما يخص البضاعة من مكان واحد." />
      <div className="stat-row" style={{ marginBottom: 18 }}>
        <Stat label="عدد المواد" icon="box" value={t ? fmt.num(t.items) : sk} foot="نسخة لها رصيد" />
        <Stat label="إجمالي الكمية" icon="layers" value={t ? fmt.qty(t.units) : sk} foot="قطعة في كل المخازن" />
        <Stat label="قيمة المخزون" icon="coins" tone="hero" value={t ? fmt.money(t.cost_value ?? t.retail_value ?? 0) : sk} foot={t?.cost_value !== null ? 'بالتكلفة' : 'بسعر البيع'} />
        <Stat label="تنبيهات" icon="alert" value={alerts.data ? fmt.num(alerts.data.low + alerts.data.exp) : sk}
          foot={alerts.data ? <span>{fmt.num(alerts.data.low)} نواقص · {fmt.num(alerts.data.exp)} صلاحية</span> : null} />
      </div>
      <div className="opt-grid">
        {OPTIONS.filter((o) => can(o.perm)).map((o) => (
          <Link key={o.to} to={o.to} className="opt-card">
            <span className="opt-ic"><Icon name={o.icon} size={22} /></span>
            <span className="grow">
              <b>{o.title}</b>
              <span>{o.text}</span>
            </span>
            <Icon name="chevronLeft" size={18} className="faint" />
          </Link>
        ))}
      </div>
    </>
  );
}
