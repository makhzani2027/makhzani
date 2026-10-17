-- =============================================================================
-- رقيم — البيانات الأولية. آمنة لإعادة التشغيل: لا تكتب فوق ما عدّله المتجر (on conflict do nothing)
-- القيم مطابقة لـ packages/shared/src (DEFAULT_ROLES، GOVERNORATES، demo.ts)
-- =============================================================================

-- الأدوار الافتراضية (DEFAULT_ROLES)
insert into public.staff_roles (name, description, permissions, is_system) values
  ('مدير', 'كل شيء عدا الموظفين والإعدادات', array['dashboard.view', 'pos.sell', 'pos.discount', 'pos.price_override', 'quotations.manage',
    'orders.view', 'orders.manage', 'requests.manage', 'products.view', 'products.write', 'products.delete', 'inventory.view',
    'inventory.adjust', 'inventory.transfer', 'purchases.manage', 'costs.view', 'customers.view', 'customers.manage', 'invoices.view',
    'invoices.void', 'finance.view', 'finance.manage', 'reports.view', 'store.manage', 'notifications.send', 'audit.view'], true),
  ('كاشير', 'نقطة البيع والزبائن والفواتير', array['dashboard.view', 'pos.sell', 'pos.discount', 'quotations.manage', 'orders.view',
    'products.view', 'inventory.view', 'customers.view', 'customers.manage', 'invoices.view'], true),
  ('أمين مخزن', 'المنتجات والمخزون والمشتريات', array['dashboard.view', 'products.view', 'products.write', 'inventory.view',
    'inventory.adjust', 'inventory.transfer', 'purchases.manage', 'costs.view'], true),
  ('مسؤول طلبات', 'طلبات التطبيق وطلبات التوفير', array['dashboard.view', 'orders.view', 'orders.manage', 'requests.manage',
    'products.view', 'inventory.view', 'customers.view', 'invoices.view'], true)
on conflict (name) do nothing;

-- الفرع الافتراضي
insert into public.branches (name, is_default)
select 'الفرع الرئيسي', true where not exists (select 1 from public.branches where is_default);

-- المخزن الرئيسي
insert into public.warehouses (name, code, branch_id, is_default, is_sellable)
select 'المخزن الرئيسي', 'MAIN', (select id from public.branches where is_default), true, true
where not exists (select 1 from public.warehouses where upper(code) = 'MAIN');

-- الصناديق: الافتراضي لنقطة البيع بالدينار + صندوق الدولار
insert into public.money_accounts (name, kind, currency, branch_id, is_default)
select 'الصندوق الرئيسي', 'cash', 'IQD', (select id from public.branches where is_default), not exists (select 1 from public.money_accounts where is_default)
where not exists (select 1 from public.money_accounts where name = 'الصندوق الرئيسي');
insert into public.money_accounts (name, kind, currency, branch_id, is_default)
select 'صندوق الدولار', 'cash', 'USD', (select id from public.branches where is_default), false
where not exists (select 1 from public.money_accounts where name = 'صندوق الدولار');

-- الزبون النقدي (لبيع نقطة البيع بلا زبون)
insert into public.customers (name, is_cash_customer)
select 'زبون نقدي', true where not exists (select 1 from public.customers where is_cash_customer);

-- عدادات المستندات (DOC_PREFIX)
insert into public.doc_counters (kind, last_value)
select k, 0 from unnest(array['sale', 'sale_return', 'purchase', 'purchase_return', 'order', 'receipt', 'voucher', 'request',
  'transfer', 'stocktake', 'quotation', 'stock_voucher', 'account_transfer']) k
on conflict (kind) do nothing;

-- مناطق التوصيل: ١٩ محافظة، بغداد فقط مفعّلة بأجرة ٥٠٠٠
insert into public.delivery_zones (governorate, fee, eta_text, is_active, sort)
select g.key, case when g.key = 'baghdad' then 5000 else 8000 end,
  case when g.key = 'baghdad' then 'خلال ٢٤ ساعة' else '٢–٣ أيام' end, g.key = 'baghdad', g.n
from unnest(array['baghdad', 'basra', 'nineveh', 'erbil', 'sulaymaniyah', 'duhok', 'kirkuk', 'anbar', 'babil', 'karbala', 'najaf',
  'wasit', 'maysan', 'dhi_qar', 'muthanna', 'qadisiyah', 'salahuddin', 'diyala', 'halabja']) with ordinality g(key, n)
on conflict (governorate) do nothing;

-- الإعدادات (types.ts: StoreSettings، CheckoutSettings، InventorySettings، InvoiceSettings، AppConfigSettings، CurrencySettings)
insert into public.app_settings (key, value, is_public) values
  ('store', jsonb_build_object('name', 'رقيم', 'legal_name', null, 'phone', null, 'whatsapp', null, 'email', null,
    'address', 'بغداد', 'map_url', null, 'hours', 'السبت – الخميس · ١٠ صباحاً – ١٠ مساءً', 'socials', '{}'::jsonb,
    'currency', 'IQD', 'digits', 'arab'), true),
  ('checkout', jsonb_build_object('cod_enabled', true, 'office_enabled', true, 'online_enabled', false, 'pickup_enabled', true,
    'min_order_total', 10000, 'free_delivery_over', 150000,
    'office_instructions', 'نتواصل معك عبر واتساب لتحديد موعد الحضور إلى المكتب والدفع.'), true),
  ('inventory', jsonb_build_object('allow_negative_stock', false,
    'default_warehouse_id', (select id from public.warehouses where upper(code) = 'MAIN'), 'low_stock_default', 3), false),
  ('invoice', jsonb_build_object('receipt_width', 80, 'show_logo', true, 'header_note', null, 'footer_note', 'شكراً لتسوقكم من رقيم',
    'return_policy', 'الاستبدال والإرجاع خلال ٧ أيام مع الفاتورة والتغليف الأصلي.', 'show_qr', true,
    'label_size', jsonb_build_object('width_mm', 50, 'height_mm', 30)), false),
  ('app', jsonb_build_object('min_version', 1, 'latest_version', 1, 'maintenance', false, 'maintenance_message', null,
    'play_store_url', null, 'apk_url', null), true),
  ('currency', jsonb_build_object('base', 'IQD', 'usd_enabled', true, 'usd_rate', 1310, 'usd_rate_updated_at', null), false)
on conflict (key) do nothing;

-- أقسام الرئيسية الأربعة
insert into public.home_sections (title, kind, max_items, sort)
select s.title, s.kind::public.home_section_kind, 10, s.sort
from (values ('عروض اليوم', 'on_sale', 1), ('الأكثر مبيعاً', 'best_sellers', 2), ('وصل حديثاً', 'new', 3), ('مختارات لك', 'featured', 4)) s(title, kind, sort)
where not exists (select 1 from public.home_sections h where h.title = s.title);
