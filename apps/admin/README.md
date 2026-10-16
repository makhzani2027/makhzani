# لوحة التحكم — دليل المطوّر (اقرأه قبل كتابة أي صفحة)

React 19 + Vite + TypeScript. تُنشر تحت `/dashboard/`. الهوية في `src/styles/` والمكونات في `src/ui/`.

## أين أضع صفحتي؟
- صفحتك ملف في مجلدك (`src/pages/<مجلدك>/…`) بـ `export default function`.
- سجّلها في ملف مساراتك (`src/routes/catalog.tsx` أو `src/routes/sales.tsx`) بـ `lazy(() => import(…))` بدل `Soon`.
  القائمة الجانبية والصلاحيات والعدّادات تُبنى تلقائياً من هذا السجل (`AppRoute` في `routes/types.ts`).
- لا تعدّل `App.tsx` ولا `src/ui` ولا `src/lib` ولا `src/styles` (للقائد). تحتاج شيئاً مشتركاً؟ اكتبه في مجلدك أو اطلبه في تقريرك.

## البيانات (نمط إلزامي)
كل صفحة لها ملف بيانات في مجلدها (مثل `pages/catalog/api.ts`) بدوال صغيرة، **كل دالة** تفرّع:
```ts
import { IS_DEMO } from '../../lib/env';
import { demoDb, demoDelay, demoId } from '../../lib/demo-db';
import { sb, rpc } from '../../lib/supabase';

export async function listProducts(q: string) {
  if (IS_DEMO) { await demoDelay(); return demoDb.products.filter(…); }
  const { data, error } = await sb().from('products').select('…').ilike('search_text', `%${q}%`);
  if (error) throw error;
  return data;
}
export const posCheckout = (p: PosPayload) => IS_DEMO ? demoPosCheckout(p) : rpc<{ invoice_id: string; number: string; change: number }>('pos_checkout', { p });
```
- **أسماء الجداول والأعمدة والدوال**: من `packages/shared/src/types.ts` و`system/06-database.md` حرفياً.
- **في وضع العرض** تحاكي الدالة النتيجة على `demoDb` (اكتب فيه: البيع ينقص `available_qty` و`stock_levels`، الحفظ يضيف صفاً…) حتى تعمل الصفحة كاملة بلا خادم.
- في الصفحة: `useLoad(() => listProducts(q), [q])` للقراءة، و`useAction(fn, { success: 'تم الحفظ' })` للكتابة (الأخطاء تظهر تلقائياً بالعربية).

## الأدوات الجاهزة
| | |
|---|---|
| `ui/` | `Button, IconButton, Field, Input, NumberInput, MoneyInput, Select, Textarea, Checkbox, Switch, Segmented, SearchInput, PageHeader, Card, Stat, Badge, StockBadge, Tabs, Chips, DataTable, Pagination, Modal, Drawer, askConfirm, askText, toast, Menu, EmptyState, ErrorState, Loading, Skeleton, Alert, BarChart, LineChart, Donut, Sparkline, Barcode, QrCode, barcodeSvg, qrSvg, Thumb, Avatar, Mark, Wordmark, Kbd, Icon` |
| `lib/auth` | `useAuth()` ← `can('pos.sell')`، `profile`، `isOwner` |
| `lib/settings` | `useFmt()` ← `money(n)`, `num(n)`, `qty(n)`, `date(d, time?)`, `ago(d)`, `count(n, nouns.product)` — **كل رقم يُعرض من هنا** |
| `lib/media` | `uploadImage(file, 'products', id)` ← يضغط WebP بثلاثة مقاسات ويرفع ويعيد المفتاح. `imgUrl(key, 'md')` |
| `lib/print` | `printHtml(html, { paper: '80mm' \| '58mm' \| 'A4' \| {width_mm,height_mm}, css, title })`، `escapeHtml` |
| `lib/scanner` | `useBarcodeScanner(code => …)` لقارئ الباركود USB في أي صفحة، `beep('ok' \| 'error')` |
| `lib/csv` | `toCsv(rows, cols)`, `downloadText(name, text)`, `parseCsv(text)` |
| `lib/hooks` | `useLoad`, `useAction`, `useDebounced`, `useHotkey('F2', fn)`, `useStored` |
| `lib/counts` | `useCounts().refresh()` بعد أي تغيير يمس الطلبات/التوفير/النواقص |
| `@raqeem/shared` | `formatMoney, computeTotals, tender, nextStatuses, primaryNext, ORDER_STATUS, PAYMENT_METHOD, MOVEMENT_KIND, …, normalizeIraqiPhone, whatsappLink, internalEan13, matchScore, GOVERNORATES` |

## قواعد الواجهة
- ابدأ كل صفحة بـ `<PageHeader title description actions />`. القوائم بـ `<DataTable>` (تتحول لبطاقات على الهاتف تلقائياً).
- الأرقام في الجداول: عمود `end: true` (محاذاة يسار، أرقام بعرض ثابت).
- الإجراءات الخطرة: `askConfirm({ danger: true })`، والحذف النهائي `typeToConfirm: 'حذف'`.
- لا `alert/confirm/prompt` من المتصفح. لا ألوان ثابتة (متغيرات CSS فقط). لا إيموجي.
- الحالات الأربع لكل قائمة: تحميل (هيكل)، فارغة (رسالة + زر)، خطأ (إعادة)، بيانات.
- نصوص الأزرار أفعال واضحة: «حفظ المنتج»، «تأكيد الطلب»، «طباعة الإيصال».

## التحقق
```bash
npm run typecheck -w @raqeem/admin && npm run build -w @raqeem/admin
cd apps/admin && npx vite preview --port <منفذ جديد>   # ثم لقطات Playwright لصفحاتك فاتح/غامق وعرض هاتف
```
