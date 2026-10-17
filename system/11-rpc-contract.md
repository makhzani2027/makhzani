# عقد دوال RPC الفعلي (من تنفيذ قاعدة البيانات — مُختبَر: ١٨٩ اختباراً)

> هذا ما نُفّذ فعلاً في `supabase/migrations`. الواجهات تستدعي بهذه الأشكال حرفياً.
> كل الأخطاء رسائل عربية برمز `P0001`: اعرض `error.message` كما هي. المعاملات المسماة `from`/`to` تُمرَّر `{from, to}`.

## نقطة البيع والصندوق
- `pos_checkout(p)` ← `{warehouse_id, customer_id?, currency?:'IQD'|'USD', exchange_rate?, discount?, note?, items:[{variant_id, qty, unit_id?, price_tier?:'retail'|'wholesale', unit_price?, discount?, serials?:[]}], payments:[{method, amount, reference?, account_id?, currency?, exchange_rate?}]}` → `{invoice_id, number, total, paid, due, change, currency}`. `qty` بالوحدة المختارة (كرتونة = factor قطع).
- `open_cash_session(opening_float)` · `close_cash_session(counted, note)` → صف الجلسة + `difference`.

## المشتريات والإرجاع والإلغاء
- `post_purchase(p)` ← `{supplier_id, warehouse_id, currency?, exchange_rate?, discount?, note?, items:[{variant_id, qty, unit_cost, discount?, unit_id?, serials?, lot_code?, expiry_date?}], payments?}` → `{invoice_id, number, total, paid, due, currency}`
- `post_return(p)` ← `{invoice_id, reason, items:[{invoice_item_id, qty, serials?}], refund?:{method, amount, account_id?, currency?}}` → `{invoice_id, number, total, paid, currency}`
- `void_invoice(id, reason)` → `{invoice_id, number, status:'void'}`

## المال
- `record_payment(p)` ← `{direction, method, amount, currency?, exchange_rate?, account_id?, customer_id?|supplier_id?|invoice_id?, reference?, note?}` → صف الدفعة
- `record_expense(p)` ← `{category, amount, currency?, exchange_rate?, account_id?, method?, note?, spent_at?}` → صف المصروف
- `transfer_money(p)` ← `{from_account_id, to_account_id, amount, exchange_rate?, note?}` (المبلغ بعملة المصدر) → صف التحويل

## المخزون
- `adjust_stock(p)` ← `{variant_id, warehouse_id, mode:'set'|'delta', qty, kind:'adjustment'|'damage'|'opening', note, unit_cost?, lot_code?, expiry_date?}` → `{variant_id, warehouse_id, qty, changed}`
- `transfer_stock(p)` ← `{from_warehouse_id, to_warehouse_id, items:[{variant_id, qty, serials?}], note?}` → `{transfer_id, number}`
- `create_stocktake(warehouse_id, note)` → صف · `set_stocktake_count(id, variant_id, counted)` (null يحذف البند) · `apply_stocktake(id)` → `{stocktake_id, number, status, adjusted}`
- `post_stock_voucher(p)` ← `{kind, warehouse_id, customer_id?, reason, note?, items:[{variant_id, qty, unit_cost?, lot_code?, expiry_date?}]}` → `{voucher_id, number, kind}`

## عروض الأسعار والطلبات
- `save_quotation(p)` ← `{id?, customer_id?|customer_name, warehouse_id, currency?, status?, valid_until?, note?, discount?, items:[{variant_id, qty, unit_price?, discount?, price_tier?}]}` → العرض + `items`
- `convert_quotation(id, payments)` → شكل `pos_checkout` + `quotation_id` (العرض الساري يثبّت أسعاره، والمنتهي بسعر اليوم)
- `set_order_status(order_id, status, note)` → `{order_id, status, invoice_id, return_invoice_id}`
- `set_request_status(id, status, reply, product_id)` → صف · `send_campaign(id)` → صف + `recipients`

## التقارير (JSON)
- `dashboard_summary({from,to})` → DashboardSummary · `sales_series({from,to,bucket})` → SalesPoint[] · `top_products({from,to,lim})` → TopProductRow[]
- `inventory_valuation()` · `low_stock({lim})` · `stagnant_products({days,lim})` → `[{variant_id, product_id, name, variant_title, sku, qty, last_sold_at, cost_value}]`
- `near_expiry({days,lim})` → `[{lot_id, variant_id, product_id, name, variant_title, sku, warehouse_id, lot_code, expiry_date, qty, days_left}]`
- `customer_statement(customer_id, from, to)` / `supplier_statement(supplier_id, from, to)` → `{customer_id|supplier_id, opening:{IQD,USD}, rows:[{at, doc_type, doc_id, number, description, currency, debit, credit, balance}], closing:{IQD,USD}}`

## دوال الخادم (Edge Functions)
- `payments` (POST مع JWT): `{action:'create'|'status', order_id, redirect_url?}` → create: `{transaction_id, checkout_url, amount}` · status: `{order_id, payment_status, transaction}`
- `staff`: `{action:'create'|'set_role'|'disable'|'enable'|'reset_password', email?, full_name?, role_id?, phone?, user_id?, password?}` → `temp_password` عند التوليد
- `account`: POST فقط (حذف حساب الزبون بعد `delete_my_account`)
- `media`: `{bucket:'media'|'private', keys:[…-sm.webp,…], content_type}` → `{mode:'r2'|'supabase', uploads:[{key, upload_url?, method?, headers?, public_url?}]}`

## ملاحظات
- `store_home` يحذف الأقسام الفارغة. الربح `null` بلا `costs.view`. أرصدة الزبائن/الموردين تخضع لـ RLS (بلا `finance.view` تظهر صفراً).
- `checkout.online_enabled=false` في البيانات الأولية حتى يُضبط Wayl. إعداد `app` عام (التطبيق يقرأ `min_version`)، و`currency` للموظفين فقط.
