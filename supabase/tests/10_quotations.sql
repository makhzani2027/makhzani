-- عروض الأسعار المتكاملة (migration ٢٤): العنوان، هاتف الزبون، المميزات، ترتيب البنود
set client_min_messages = notice;

select test.login('owner');
set role authenticated;
do $$
declare q jsonb; q2 jsonb; q3 jsonb; r jsonb; qid uuid;
begin
  -- ترتيب الإدخال (هاتف، كوب، سماعة) ليس الترتيب الأبجدي (سماعة، كوب، هاتف)
  q := public.save_quotation(jsonb_build_object('warehouse_id', test.id('main'), 'customer_name', 'عبدالله جاسم',
    'customer_phone', ' 07701234567 ', 'title', '  منظومة طاقة شمسية ٥ ك.واط  ',
    'features', jsonb_build_array('تجهيزك بـ ١٠ أمبير نهاراً و٥ ليلاً', '   ', 'ضمان الانفيرتر ٤ سنوات (استبدال)'),
    'items', jsonb_build_array(
      jsonb_build_object('variant_id', test.id('ph'), 'qty', 1),
      jsonb_build_object('variant_id', test.id('cup'), 'qty', 20),
      jsonb_build_object('variant_id', test.id('hp'), 'qty', 6))));
  qid := (q ->> 'id')::uuid;
  perform test.eq(q ->> 'title', 'منظومة طاقة شمسية ٥ ك.واط', 'عرض: العنوان محفوظ ومقصوص الفراغات');
  perform test.eq(q ->> 'customer_phone', '07701234567', 'عرض: هاتف الزبون محفوظ');
  perform test.eq(jsonb_array_length(q -> 'features'), 2, 'عرض: المميزات الفارغة تُحذف');
  perform test.eq(q -> 'features' ->> 0, 'تجهيزك بـ ١٠ أمبير نهاراً و٥ ليلاً', 'عرض: ترتيب المميزات محفوظ');
  perform test.eq((select string_agg(x ->> 'name', '|' order by o) from jsonb_array_elements(q -> 'items') with ordinality t(x, o)),
    'هاتف|كوب سيراميك|سماعة لاسلكية', 'عرض: البنود بترتيب الإدخال لا أبجدياً');
  perform test.eq((q ->> 'total')::numeric, 300000 + 20 * 5000 + 6 * 25000::numeric, 'عرض: الإجمالي = مجموع (السعر × الكمية)');

  -- حفظ من نسخة لوحة قديمة لا ترسل العنوان والمميزات: لا تُمسح
  q2 := public.save_quotation(jsonb_build_object('id', qid, 'warehouse_id', test.id('main'), 'customer_name', 'عبدالله جاسم',
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 2))));
  perform test.ok(q2 ->> 'title' = 'منظومة طاقة شمسية ٥ ك.واط' and jsonb_array_length(q2 -> 'features') = 2
    and q2 ->> 'customer_phone' = '07701234567', 'عرض: الحفظ بلا الحقول الجديدة يبقيها كما هي');

  -- مسح صريح
  q3 := public.save_quotation(jsonb_build_object('id', qid, 'warehouse_id', test.id('main'), 'customer_name', 'عبدالله جاسم',
    'title', '', 'customer_phone', null, 'features', '[]'::jsonb,
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('hp'), 'qty', 1), jsonb_build_object('variant_id', test.id('cup'), 'qty', 3))));
  perform test.ok(q3 ->> 'title' is null and q3 ->> 'customer_phone' is null and jsonb_array_length(q3 -> 'features') = 0,
    'عرض: إرسال قيم فارغة يمسح العنوان والهاتف والمميزات');
  perform test.eq((select string_agg(x ->> 'name', '|' order by o) from jsonb_array_elements(q3 -> 'items') with ordinality t(x, o)),
    'سماعة لاسلكية|كوب سيراميك', 'عرض: الترتيب يتبع آخر حفظ');

  -- حد المميزات: ٤٠ بنداً
  q := public.save_quotation(jsonb_build_object('warehouse_id', test.id('main'), 'customer_name', 'زبون',
    'features', (select jsonb_agg('ميزة ' || g) from generate_series(1, 45) g),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1))));
  perform test.eq(jsonb_array_length(q -> 'features'), 40, 'عرض: المميزات تُقص عند ٤٠ بنداً');

  -- تغيير الحالة فقط يبقي كل شيء
  q2 := public.save_quotation(jsonb_build_object('id', qid, 'status', 'sent'));
  perform test.ok(q2 ->> 'status' = 'sent' and jsonb_array_length(q2 -> 'items') = 2, 'عرض: تغيير الحالة فقط يبقي البنود');

  -- التحويل لفاتورة (بنود متوفرة في المخزن)
  perform public.save_quotation(jsonb_build_object('id', qid, 'warehouse_id', test.id('main'), 'customer_name', 'عبدالله جاسم',
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 2), jsonb_build_object('variant_id', test.id('cup'), 'qty', 1))));
  r := public.convert_quotation(qid, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 15000)));
  perform test.eq((select count(*) from public.invoice_items where invoice_id = (r ->> 'invoice_id')::uuid), 2::bigint, 'عرض: التحويل ينقل كل البنود');
  perform test.eq((select status::text from public.quotations where id = qid), 'converted', 'عرض: الحالة محوّل');
end $$;
reset role;
