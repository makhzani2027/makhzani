"""يبني SQL يعيد كميات المخزن من نسخة احتياطية (data.sql من supabase db dump / pg_dump --data-only).

  python3 scripts/restore_stock.py data.sql > restore.sql

- الكميات تعود كحركة «رصيد افتتاحي» (opening) عبر private.apply_movement، فيبقى سجل الحركات صحيحاً
  ولا تتغير التكلفة (unit_cost = null).
- المنتجات بتاريخ انتهاء: كل دفعة بكودها وتاريخها، والباقي بلا دفعة.
- الأرقام التسلسلية غير المباعة (في المخزن، مُرجعة، معيبة) تعود كما كانت، بلا ربط بفواتير محذوفة.
- يتوقف إن وُجدت حركات مخزون بعد التصفير (حتى لا تتضاعف الكميات)، وكل شيء في معاملة واحدة.
"""
import re
import sys
from collections import defaultdict
from decimal import Decimal

NOTE = 'رصيد افتتاحي — مسترجع من النسخة الاحتياطية قبل التصفير'


def unescape(v):
    if v == r'\N':
        return None
    return re.sub(r'\\(.)', lambda m: {'t': '\t', 'n': '\n', 'r': '\r', '\\': '\\'}.get(m.group(1), m.group(1)), v)


def read_copy(text, table):
    """صفوف COPY public.<table> (يدعم الأسماء المقتبسة وغير المقتبسة)"""
    m = re.search(r'^COPY "?public"?\."?' + table + r'"? \(([^)]*)\) FROM stdin;\n(.*?)^\\\.$', text, re.M | re.S)
    if not m:
        return []
    cols = [c.strip().strip('"') for c in m.group(1).split(',')]
    rows = []
    for line in m.group(2).splitlines():
        if line:
            rows.append(dict(zip(cols, [unescape(x) for x in line.split('\t')])))
    return rows


def q(s):
    return 'null' if s is None else "'" + str(s).replace("'", "''") + "'"


def main():
    text = open(sys.argv[1], encoding='utf-8').read()
    levels = read_copy(text, 'stock_levels')
    lots = read_copy(text, 'stock_lots')
    serials = read_copy(text, 'serials')
    if not levels:
        raise SystemExit('لا جدول stock_levels في النسخة')

    lots_by = defaultdict(list)
    for l in lots:
        if Decimal(l['qty']) > 0:
            lots_by[(l['variant_id'], l['warehouse_id'])].append(l)

    out = ['do $$', 'declare n int := 0; s int := 0; skipped int := 0;', 'begin',
           "  if exists (select 1 from public.stock_movements) then",
           "    raise exception using message = 'توجد حركات مخزون بعد التصفير — أُوقف الاسترجاع حتى لا تتضاعف الكميات.';",
           '  end if;']

    def move(v, w, qty, lot=None, exp=None):
        out.append(
            f"  if exists (select 1 from public.product_variants x where x.id = {q(v)}::uuid) and exists (select 1 from public.warehouses x where x.id = {q(w)}::uuid and x.is_active) then"
            f" perform private.apply_movement({q(v)}::uuid, {q(w)}::uuid, {qty}, 'opening', null, null, null, {q(NOTE)}, {q(lot)}, {q(exp)}::date); n := n + 1;"
            " else skipped := skipped + 1; end if;")

    total = Decimal(0)
    for r in levels:
        qty = Decimal(r['qty'])
        if qty <= 0:
            continue
        total += qty
        key = (r['variant_id'], r['warehouse_id'])
        left = qty
        for l in lots_by.get(key, []):
            take = min(Decimal(l['qty']), left)
            if take > 0:
                move(key[0], key[1], take, l['lot_code'], l['expiry_date'])
                left -= take
        if left > 0:
            move(key[0], key[1], left)

    for r in serials:
        if r['status'] not in ('in_stock', 'returned', 'defective'):
            continue
        out.append(
            f"  if exists (select 1 from public.product_variants x where x.id = {q(r['variant_id'])}::uuid) and not exists (select 1 from public.serials x where x.variant_id = {q(r['variant_id'])}::uuid and x.serial = {q(r['serial'])}) then"
            f" insert into public.serials (variant_id, serial, status, warehouse_id, note) values ({q(r['variant_id'])}::uuid, {q(r['serial'])}, {q(r['status'])}::public.serial_status,"
            f" (select x.id from public.warehouses x where x.id = {q(r['warehouse_id'])}::uuid), {q(r['note'])}); s := s + 1; end if;")

    out += ["  raise notice 'movements=% serials=% skipped=%', n, s, skipped;", 'end $$;']
    sys.stderr.write(f'levels={sum(1 for r in levels if Decimal(r["qty"]) > 0)} qty_total={total} lots={len(lots)} serials={len(serials)}\n')
    print('\n'.join(out))


if __name__ == '__main__':
    main()
