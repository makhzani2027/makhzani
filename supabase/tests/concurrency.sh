#!/usr/bin/env bash
# تزامن حقيقي: زبونان يطلبان آخر قطعة في نفس اللحظة من جلستين منفصلتين ← واحد فقط ينجح، والرصيد لا يصير سالباً
set -u
DB_URL="$1"
P=(psql -X -q -t -A -v ON_ERROR_STOP=1 "$DB_URL")

"${P[@]}" >/dev/null <<'SQL'
select test.login('owner');
set role authenticated;
select public.upsert_product(jsonb_build_object('name', 'قطعة أخيرة', 'is_published', true, 'variants', jsonb_build_array(
  jsonb_build_object('title', 'افتراضي', 'sku', 'LAST-1', 'price', 20000, 'cost', 10000,
    'opening', jsonb_build_array(jsonb_build_object('warehouse_id', test.id('main'), 'qty', 1))))));
reset role;
insert into test.ids select 'last', id from public.product_variants where sku = 'LAST-1' on conflict do nothing;
SQL

order_sql() {
  cat <<SQL
select test.login('$1');
set role authenticated;
begin;
select public.place_order(jsonb_build_array(jsonb_build_object('variant_id', test.id('last'), 'qty', 1)),
  (select id from public.addresses where profile_id = auth.uid() limit 1), 'delivery', 'cod');
select pg_sleep(1);
commit;
SQL
}

order_sql cust_a | "${P[@]}" >/tmp/raqeem-cc-a.log 2>&1 &
A=$!
sleep 0.3
order_sql cust_b | "${P[@]}" >/tmp/raqeem-cc-b.log 2>&1 &
B=$!
wait $A; RA=$?
wait $B; RB=$?

N=$("${P[@]}" -c "select count(*) from public.order_items where variant_id = test.id('last')")
Q=$("${P[@]}" -c "select available_qty from public.product_variants where id = test.id('last')")
if [ "$N" = 1 ] && [ $((RA + RB)) -ne 0 ] && [ "$RA" -eq 0 -o "$RB" -eq 0 ] && [ "${Q%%.*}" = 0 ]; then
  echo "PASS: تزامن: طلبان على آخر قطعة ← واحد فقط نجح"
else
  echo "FAIL: تزامن: orders=$N rcA=$RA rcB=$RB available=$Q"
  cat /tmp/raqeem-cc-a.log /tmp/raqeem-cc-b.log
fi
if grep -q "غير متوفرة" /tmp/raqeem-cc-a.log /tmp/raqeem-cc-b.log; then
  echo "PASS: تزامن: الثاني رُفض برسالة عربية"
else
  echo "FAIL: تزامن: رسالة الرفض"
fi
rm -f /tmp/raqeem-cc-a.log /tmp/raqeem-cc-b.log
