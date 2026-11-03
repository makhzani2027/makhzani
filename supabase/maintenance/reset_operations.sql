-- =============================================================================
-- رقيم — تصفير العمليات لبداية فعلية (يُشغَّل يدوياً عبر Actions ← Reset Data، بعد نسخة احتياطية).
-- يحذف: الفواتير والطلبات وعروض الأسعار والسندات والمصروفات والصندوق وحركات المخزون والنقل والجرد
--        والسندات المخزنية والأرقام التسلسلية والدفعات وسجل العمليات والإشعارات وطلبات التوفير والتقييمات.
-- يُصفّر: أرصدة المخزن، المبيعات والتقييم في المنتجات، استعمال الكوبونات، الرصيد الافتتاحي للصناديق، الترقيم.
-- يبقي:  المنتجات والنسخ والأسعار والتكاليف والصور والوحدات، الأقسام والشركات، المخازن والفروع، الصناديق،
--        الزبائن والموردون (بلا رصيد)، الموظفون والأدوار، الإعدادات وواجهة المتجر والكوبونات ومناطق التوصيل.
-- كله في معاملة واحدة: ينجح كاملاً أو لا يتغير شيء. TRUNCATE بلا CASCADE: أي جدول مرتبط غير مذكور يوقف التنفيذ.
-- =============================================================================
begin;

truncate table
  public.order_events, public.order_items, public.order_reservations, public.payment_transactions,
  public.coupon_redemptions, public.orders,
  public.invoice_items, public.payments, public.quotation_items, public.quotations, public.invoices,
  public.expenses, public.account_transfers, public.cash_sessions,
  public.stock_movements, public.stock_lots, public.serials,
  public.stock_voucher_items, public.stock_vouchers, public.stocktake_items, public.stocktakes,
  public.transfer_items, public.transfers,
  public.notifications, public.notification_campaigns, public.product_requests, public.reviews
restart identity;

update public.stock_levels set qty = 0, reserved = 0, updated_at = now() where qty <> 0 or reserved <> 0;
update public.product_variants set available_qty = 0 where available_qty <> 0;
update public.products set sold_count = 0, rating_avg = 0, rating_count = 0 where sold_count <> 0 or rating_avg <> 0 or rating_count <> 0;
update public.coupons set used_count = 0 where used_count <> 0;
update public.money_accounts set opening_balance = 0 where opening_balance <> 0;
update public.doc_counters set last_value = 0;

-- سجل العمليات أخيراً (التحديثات أعلاه تكتب فيه)
truncate table public.audit_log restart identity;

commit;

select jsonb_build_object(
  'products', (select count(*) from public.products),
  'variants', (select count(*) from public.product_variants),
  'customers', (select count(*) from public.customers),
  'suppliers', (select count(*) from public.suppliers),
  'invoices', (select count(*) from public.invoices),
  'orders', (select count(*) from public.orders),
  'stock_total', (select coalesce(sum(qty), 0) from public.stock_levels)
) as result;
