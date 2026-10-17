-- عروض الأسعار، الإرجاع، الإلغاء، السندات، المصروفات، التحويل، كشوف الحساب، التقارير، الطلبات والحملات
set client_min_messages = notice;
select test.login('owner');
set role authenticated;

-- عرض سعر ← فاتورة (السعر المثبّت يبقى حتى لو تغيّر سعر المنتج)
do $$
declare q jsonb; r jsonb; q0 numeric;
begin
  q := public.save_quotation(jsonb_build_object('customer_id', test.id('cust_b_c'), 'warehouse_id', test.id('main'), 'valid_until', (current_date + 7)::text,
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 10, 'unit_price', 4500)), 'discount', 1000));
  perform test.ok(q ->> 'number' ~ '^Q-\d{6}$' and (q ->> 'total')::numeric = 44000 and jsonb_array_length(q -> 'items') = 1, 'عرض سعر: حُفظ بالإجمالي');
  update public.product_variants set price = 6000 where id = test.id('cup');
  q0 := (select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main'));
  r := public.convert_quotation((q ->> 'id')::uuid, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 44000)));
  perform test.ok((r ->> 'total')::numeric = 44000 and (r ->> 'due')::numeric = 0, 'عرض سعر ← فاتورة بنفس الأسعار');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')), q0 - 10, 'عرض سعر ← فاتورة: المخزون خُصم');
  perform test.ok((select status = 'converted' and invoice_id = (r ->> 'invoice_id')::uuid from public.quotations where id = (q ->> 'id')::uuid), 'عرض سعر: محوّل ومربوط');
  perform test.eq((select quotation_id from public.invoices where id = (r ->> 'invoice_id')::uuid), (q ->> 'id')::uuid, 'الفاتورة تشير للعرض');
  perform test.throws(format('select public.convert_quotation(%L)', q ->> 'id'), 'محوّل', 'عرض سعر: لا يحوّل مرتين');
  update public.product_variants set price = 5000 where id = test.id('cup');
end $$;

-- إرجاع جزئي لفاتورة نقطة البيع ثم منع الزيادة
do $$
declare s jsonb; r jsonb; item uuid; q0 numeric;
begin
  s := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'), 'customer_id', test.id('cust_a_c'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 4)), 'discount', 2000,
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 18000))));
  item := (select id from public.invoice_items where invoice_id = (s ->> 'invoice_id')::uuid);
  q0 := (select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main'));
  r := public.post_return(jsonb_build_object('invoice_id', s ->> 'invoice_id', 'reason', 'لا يناسب',
    'items', jsonb_build_array(jsonb_build_object('invoice_item_id', item, 'qty', 2)), 'refund', jsonb_build_object('method', 'cash', 'amount', 9000)));
  perform test.ok(r ->> 'number' ~ '^SR-\d{6}$' and (r ->> 'total')::numeric = 9000, 'إرجاع: نصف الكمية = نصف الصافي بعد الخصم');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')), q0 + 2, 'إرجاع: الرصيد عاد');
  perform test.throws(format('select public.post_return(%L::jsonb)', jsonb_build_object('invoice_id', s ->> 'invoice_id', 'reason', 'x',
    'items', jsonb_build_array(jsonb_build_object('invoice_item_id', item, 'qty', 3)))), 'أكثر مما بيع', 'إرجاع: لا يتجاوز المباع');
  perform test.throws(format('select public.void_invoice(%L, %L)', s ->> 'invoice_id', 'خطأ'), 'إرجاع مسجّل', 'إلغاء: ممنوع مع إرجاع');
  perform test.eq((select balance from public.customer_balances where customer_id = test.id('cust_a_c')), 0::numeric, 'إرجاع: رصيد الزبون صفر');
end $$;

-- إلغاء فاتورة: حركات عكسية والدفعات ملغاة
do $$
declare s jsonb; q0 numeric;
begin
  q0 := (select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main'));
  s := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 3)), 'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 15000))));
  perform public.void_invoice((s ->> 'invoice_id')::uuid, 'فاتورة خاطئة');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')), q0, 'إلغاء: الرصيد عاد');
  perform test.ok((select status = 'void' and paid = 0 from public.invoices where id = (s ->> 'invoice_id')::uuid), 'إلغاء: الفاتورة void');
  perform test.ok((select bool_and(voided_at is not null) from public.payments where invoice_id = (s ->> 'invoice_id')::uuid), 'إلغاء: الدفعات ملغاة');
  perform test.throws(format('select public.void_invoice(%L, %L)', s ->> 'invoice_id', 'x'), 'ملغاة سابقاً', 'إلغاء: مرة واحدة');
end $$;

-- سند قبض لدين الزبون ب (4000 من نقطة البيع) وبالدولار
do $$
declare p jsonb;
begin
  p := public.record_payment(jsonb_build_object('direction', 'in', 'method', 'cash', 'amount', 3000, 'customer_id', test.id('cust_b_c')));
  perform test.ok(p ->> 'number' ~ '^RC-\d{6}$', 'سند قبض: RC');
  perform test.eq((select balance from public.customer_balances where customer_id = test.id('cust_b_c')), 1000::numeric, 'سند قبض: الرصيد نقص');
  p := public.record_payment(jsonb_build_object('direction', 'out', 'method', 'bank_transfer', 'amount',
    (select balance from public.supplier_balances where supplier_id = test.id('supplier')), 'supplier_id', test.id('supplier')));
  perform test.ok(p ->> 'number' ~ '^PV-\d{6}$', 'سند صرف: PV');
  perform test.eq((select balance from public.supplier_balances where supplier_id = test.id('supplier')), 0::numeric, 'سند صرف: دين المورد سُدّد');
  p := public.record_payment(jsonb_build_object('direction', 'out', 'method', 'cash', 'amount', 24, 'currency', 'USD', 'exchange_rate', 1305,
    'supplier_id', test.id('supplier'), 'account_id', test.id('box_usd')));
  perform test.ok((p ->> 'amount_iqd')::numeric = 31320 and (select balance_usd from public.supplier_balances where supplier_id = test.id('supplier')) = 0,
    'دولار: سند صرف 24$ ← amount_iqd 31320 ورصيد الدولار صفر');
  perform test.throws($q$select public.record_payment('{"direction":"in","amount":100}'::jsonb)$q$, 'زبوناً أو مورداً', 'سند: يتطلب طرفاً');
end $$;

-- المصروف والتحويل بين الصناديق
do $$
declare b0 numeric; e jsonb; t jsonb;
begin
  b0 := (select balance from public.money_account_balances where account_id = test.id('box_iqd'));
  e := public.record_expense(jsonb_build_object('category', 'كهرباء', 'amount', 25000, 'note', 'مولدة'));
  perform test.eq((select balance from public.money_account_balances where account_id = test.id('box_iqd')), b0 - 25000, 'مصروف: من الصندوق الافتراضي');
  t := public.transfer_money(jsonb_build_object('from_account_id', test.id('box_iqd'), 'to_account_id', test.id('box_usd'), 'amount', 131000, 'exchange_rate', 1310));
  perform test.ok(t ->> 'number' ~ '^AT-\d{6}$', 'تحويل: AT');
  perform test.eq((select balance from public.money_account_balances where account_id = test.id('box_iqd')), b0 - 25000 - 131000, 'تحويل: نقص المصدر');
  perform test.throws(format('select public.transfer_money(%L::jsonb)', jsonb_build_object('from_account_id', test.id('box_usd'), 'to_account_id', test.id('box_iqd'),
    'amount', 1000000)), 'لا يكفي', 'تحويل: لا يتجاوز الرصيد');
end $$;

-- كشف الحساب: الرصيد التراكمي = الرصيد في العرض
do $$
declare s jsonb;
begin
  s := public.customer_statement(test.id('cust_b_c'));
  perform test.eq((s -> 'closing' ->> 'IQD')::numeric, (select balance from public.customer_balances where customer_id = test.id('cust_b_c')), 'كشف حساب الزبون = رصيده');
  perform test.eq(((s -> 'rows') -> -1 ->> 'balance')::numeric, (s -> 'closing' ->> 'IQD')::numeric, 'كشف حساب: آخر رصيد تراكمي');
  s := public.supplier_statement(test.id('supplier'));
  perform test.eq((s -> 'closing' ->> 'IQD')::numeric, 0::numeric, 'كشف حساب المورد');
end $$;

-- التقارير
do $$
declare d jsonb; f timestamptz := now() - interval '1 day'; t timestamptz := now() + interval '1 day';
begin
  d := public.dashboard_summary(f, t);
  perform test.ok((d ->> 'sales_total')::numeric > 0 and (d ->> 'sales_count')::int > 0 and (d ->> 'profit') is not null
    and (d ->> 'purchases_total')::numeric > 0 and (d ->> 'cash_balance') is not null and (d ->> 'expenses_total')::numeric = 25000, 'dashboard_summary: المؤشرات');
  perform test.ok(d ?& array['sales_total', 'sales_count', 'returns_total', 'profit', 'orders_new', 'orders_open', 'requests_new', 'low_stock_count',
    'out_of_stock_count', 'receivables', 'payables', 'purchases_total', 'cash_balance', 'cash_in', 'cash_out', 'expenses_total'], 'dashboard_summary: كل حقول DashboardSummary');
  perform test.ok(jsonb_array_length(public.sales_series(now() - interval '6 days', now(), 'day')) = 7, 'sales_series: 7 أيام بتوقيت بغداد');
  perform test.ok((public.sales_series(f, t, 'day') -> -1 ->> 'invoices') is not null, 'sales_series: الحقول');
  perform test.ok(public.top_products(f, t, 5) @> jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'))), 'top_products: الكوب ضمن الأكثر مبيعاً');
  perform test.ok(jsonb_array_length(public.low_stock(50)) >= 1, 'low_stock: نواقص');
  perform test.ok(jsonb_typeof(public.stagnant_products(0, 10)) = 'array', 'stagnant_products');
end $$;

-- المنتجات: أرشفة واستعادة وباركود داخلي
do $$
declare pid uuid := (select product_id from public.product_variants where id = test.id('hid')); b text;
begin
  perform public.archive_product(pid);
  perform test.ok((select archived_at is not null from public.products where id = pid), 'أرشفة المنتج');
  perform public.restore_product(pid);
  perform test.ok((select archived_at is null from public.products where id = pid), 'استعادة المنتج');
  b := public.next_barcode();
  perform test.ok(b ~ '^\d{13}$', 'next_barcode: EAN-13');
end $$;
reset role;

-- طلب توفير ← حالة ← إشعار
select test.login('cust_a');
set role authenticated;
select public.create_product_request('خلاط كهربائي', 'نوع قوي', null, null, 1, 50000);
reset role;
select test.login('owner');
set role authenticated;
select public.set_request_status((select id from public.product_requests limit 1), 'available', 'صار متوفراً', null);
insert into public.notification_campaigns (title, body) values ('تخفيضات', 'خصم 20%');
select test.ok((public.send_campaign((select id from public.notification_campaigns limit 1)) ->> 'recipients')::int = 2, 'حملة: إشعار لكل زبون');
select test.throws($$select public.send_campaign((select id from public.notification_campaigns limit 1))$$, 'سابقاً', 'حملة: مرة واحدة');
reset role;
select test.login('cust_a');
set role authenticated;
select test.ok((select count(*) from public.notifications where kind = 'request') = 1, 'طلب توفير: إشعار للزبون');
select test.ok(public.mark_notifications_read(null) > 0, 'إشعارات: تعليم الكل مقروءاً');
select test.eq((select count(*) from public.notifications where read_at is null), 0::bigint, 'إشعارات: لا غير مقروء');
reset role;
