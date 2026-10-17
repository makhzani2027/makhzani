#!/usr/bin/env bash
# اختبار قاعدة البيانات على Postgres 16 محلي:
#   محاكاة Supabase ← كل الـ migrations مرتين ← seed مرتين ← ملفات الاختبار (RLS + المنطق + التزامن) ← ملخص PASS/FAIL.
# الاستعمال: bash supabase/tests/run.sh
#   - بلا إعداد: ينشئ عنقود Postgres مؤقتاً (initdb) على منفذ خاص ويحذفه في النهاية (لا يلمس أي قاعدة أخرى).
#   - DATABASE_URL=postgres://postgres@host:5432/postgres ← يستعمل خادماً موجوداً (CI) وينشئ قاعدة raqeem_test فيه.
#   - DENO=/path/to/deno (أو deno في PATH) ← يفحص أنواع دوال الخادم ويشغّل اختباراتها أيضاً.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DB=raqeem_test

PG_BIN="${PG_BIN:-}"
if [ -z "$PG_BIN" ]; then
  for d in /usr/lib/postgresql/16/bin /usr/lib/postgresql/17/bin /usr/lib/postgresql/15/bin; do
    [ -x "$d/initdb" ] && PG_BIN="$d" && break
  done
  [ -z "$PG_BIN" ] && command -v pg_config >/dev/null && PG_BIN="$(pg_config --bindir)"
fi

TMP=""
cleanup() {
  if [ -n "$TMP" ] && [ -d "$TMP" ]; then
    as_pg "$PG_BIN/pg_ctl -D '$TMP/data' -m immediate stop" >/dev/null 2>&1 || true
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT

# يشغّل أوامر الخادم بمستخدم غير root (Postgres يرفض العمل كـ root)
as_pg() {
  if [ "$(id -u)" = 0 ]; then su "$PGUSER_OS" -s /bin/sh -c "$1"; else sh -c "$1"; fi
}

if [ -n "${DATABASE_URL:-}" ]; then
  ADMIN_URL="$DATABASE_URL"
else
  [ -n "$PG_BIN" ] || { echo "لم أجد Postgres (initdb). ثبّت postgresql-16 أو اضبط PG_BIN أو DATABASE_URL"; exit 2; }
  PGUSER_OS=postgres
  if [ "$(id -u)" = 0 ] && ! id "$PGUSER_OS" >/dev/null 2>&1; then
    PGUSER_OS=pgtest
    id pgtest >/dev/null 2>&1 || useradd -r -M -s /bin/sh pgtest
  fi
  TMP="$(mktemp -d /tmp/raqeem-pg.XXXXXX)"
  chmod 755 "$TMP"
  [ "$(id -u)" = 0 ] && chown "$PGUSER_OS" "$TMP"
  PORT=$(( 54000 + RANDOM % 900 ))
  as_pg "$PG_BIN/initdb -D '$TMP/data' -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >'$TMP/initdb.log' 2>&1" \
    || { cat "$TMP/initdb.log"; exit 2; }
  as_pg "$PG_BIN/pg_ctl -D '$TMP/data' -l '$TMP/server.log' -w -o \"-p $PORT -k $TMP -c listen_addresses='' -c fsync=off\" start >/dev/null" \
    || { cat "$TMP/server.log"; exit 2; }
  ADMIN_URL="postgresql://postgres@/postgres?host=$TMP&port=$PORT"
fi

PSQL=(psql -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists $DB" -c "create database $DB" >/dev/null
DB_URL="${ADMIN_URL/\/postgres\?//$DB?}"
if [ "$DB_URL" = "$ADMIN_URL" ]; then DB_URL="${ADMIN_URL%/*}/$DB"; fi

echo "== محاكاة Supabase"
"${PSQL[@]}" "$DB_URL" -f "$HERE/supabase_stub.sql" >/dev/null

for pass in 1 2; do
  echo "== migrations (المرة $pass)"
  for f in "$ROOT"/migrations/*.sql; do
    "${PSQL[@]}" "$DB_URL" -f "$f" >/dev/null 2>"$HERE/.last_err" || { echo "فشل: $f"; cat "$HERE/.last_err"; rm -f "$HERE/.last_err"; exit 1; }
  done
  echo "== seed (المرة $pass)"
  "${PSQL[@]}" "$DB_URL" -f "$ROOT/seed.sql" >/dev/null 2>"$HERE/.last_err" || { echo "فشل: seed.sql"; cat "$HERE/.last_err"; rm -f "$HERE/.last_err"; exit 1; }
done
rm -f "$HERE/.last_err"

OUT="$(mktemp)"
echo "== الاختبارات"
for f in "$HERE"/[0-9][0-9]_*.sql; do
  echo "-- $(basename "$f")" >>"$OUT"
  psql -X -q -v ON_ERROR_STOP=0 "$DB_URL" -f "$f" >>"$OUT" 2>&1 || true
done

# التزامن الحقيقي: جلستان تطلبان آخر قطعة في نفس اللحظة ← واحدة فقط تنجح
if [ -f "$HERE/concurrency.sh" ]; then
  bash "$HERE/concurrency.sh" "$DB_URL" >>"$OUT" 2>&1 || true
fi

grep -E "(PASS|FAIL):|ERROR:" "$OUT" | sed -E 's/^.*NOTICE:  //' | sed -E 's/^psql:[^ ]+ //' >"$OUT.sum" || true
PASSN=$(grep -c '^PASS:' "$OUT.sum" || true)
FAILN=$(grep -c '^FAIL:' "$OUT.sum" || true)
ERRN=$(grep -c 'ERROR:' "$OUT.sum" || true)
grep -E '^FAIL:|ERROR:' "$OUT.sum" || true
[ "${VERBOSE:-0}" = 1 ] && cat "$OUT"

DENO_RC=0
DENO_BIN="${DENO:-$(command -v deno || true)}"
if [ -n "$DENO_BIN" ]; then
  echo "== دوال الخادم (deno check + deno test)"
  (cd "$ROOT/functions" && "$DENO_BIN" check */index.ts _shared/*.ts _shared/payments/*.ts && "$DENO_BIN" test --allow-env --allow-net=127.0.0.1 "$HERE/functions/") || DENO_RC=1
else
  echo "(deno غير موجود — تخطّي فحص دوال الخادم)"
fi

echo
echo "================ النتيجة: PASS=$PASSN  FAIL=$FAILN  ERROR=$ERRN  deno=$([ -n "$DENO_BIN" ] && { [ $DENO_RC = 0 ] && echo ok || echo FAIL; } || echo skipped)"
rm -f "$OUT" "$OUT.sum"
if [ "$FAILN" != 0 ] || [ "$ERRN" != 0 ] || [ "$PASSN" = 0 ] || [ "$DENO_RC" != 0 ]; then
  echo "FAIL"; exit 1
fi
echo "PASS"
