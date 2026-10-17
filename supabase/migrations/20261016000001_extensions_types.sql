-- =============================================================================
-- رقيم — ١: الامتدادات والمخطط الخاص والأنواع (enums)
-- آمن لإعادة التشغيل. الأنواع مطابقة حرفياً للمصفوفات في packages/shared/src/types.ts
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- pg_net لإشعارات الهاتف (غير موجود في الاختبار المحلي — المحاكاة تعرّف net.http_post)
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net غير متاح هنا (طبيعي في الاختبار المحلي): %', sqlerrm;
end $$;

-- مخطط خاص لا يكشفه PostgREST: الدوال الداخلية والإعدادات السرية
create schema if not exists private;
revoke all on schema private from public;
do $$ begin
  revoke all on schema private from anon, authenticated;
exception when undefined_object then null; end $$;

-- إعدادات سرية (رابط دالة push وسرها) — يملؤها سير عمل النشر، لا يقرؤها أي دور عام
create table if not exists private.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.settings from public;

do $$ begin create type public.profile_kind as enum ('customer', 'staff'); exception when duplicate_object then null; end $$;
do $$ begin create type public.profile_status as enum ('active', 'blocked'); exception when duplicate_object then null; end $$;
do $$ begin
  create type public.movement_kind as enum ('opening', 'purchase', 'purchase_return', 'sale', 'sale_return',
    'adjustment', 'damage', 'transfer_in', 'transfer_out', 'stocktake');
exception when duplicate_object then null; end $$;
do $$ begin create type public.invoice_kind as enum ('sale', 'sale_return', 'purchase', 'purchase_return'); exception when duplicate_object then null; end $$;
do $$ begin create type public.invoice_channel as enum ('pos', 'online', 'manual'); exception when duplicate_object then null; end $$;
do $$ begin create type public.invoice_status as enum ('posted', 'void'); exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_method as enum ('cash', 'card', 'zaincash', 'fib', 'qicard', 'asiapay', 'wayl', 'bank_transfer', 'other');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_direction as enum ('in', 'out'); exception when duplicate_object then null; end $$;
do $$ begin
  create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'returned');
exception when duplicate_object then null; end $$;
do $$ begin create type public.order_payment_method as enum ('cod', 'office', 'online'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_payment_status as enum ('unpaid', 'pending', 'paid', 'refunded', 'failed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fulfillment as enum ('delivery', 'pickup'); exception when duplicate_object then null; end $$;
do $$ begin
  create type public.request_status as enum ('new', 'reviewing', 'sourcing', 'available', 'fulfilled', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin create type public.serial_status as enum ('in_stock', 'sold', 'returned', 'defective'); exception when duplicate_object then null; end $$;
do $$ begin create type public.coupon_kind as enum ('percent', 'fixed', 'free_delivery'); exception when duplicate_object then null; end $$;
do $$ begin create type public.banner_link_kind as enum ('none', 'product', 'category', 'brand', 'search', 'url'); exception when duplicate_object then null; end $$;
do $$ begin create type public.banner_placement as enum ('home_hero', 'home_strip', 'category_top'); exception when duplicate_object then null; end $$;
do $$ begin
  create type public.home_section_kind as enum ('featured', 'new', 'best_sellers', 'on_sale', 'category', 'brand', 'manual');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_tx_status as enum ('created', 'pending', 'paid', 'failed', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;
do $$ begin create type public.cash_session_status as enum ('open', 'closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.doc_status as enum ('draft', 'applied', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.notification_kind as enum ('order', 'request', 'promo', 'system'); exception when duplicate_object then null; end $$;

-- مشغّل عام لتحديث updated_at
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- تطبيع النص العربي للبحث — نفس قواعد normalizeArabic في packages/shared/src/search.ts حرفياً:
-- أرقام مشرقية/فارسية ← لاتينية، حذف التشكيل (U+0610–061A، U+064B–065F، U+0670، U+06D6–06ED) والتطويل،
-- أإآٱ←ا، ى←ي، ة←ه، ؤ←و، ئ←ي، أحرف صغيرة، كل ما ليس حرفاً أو رقماً ← مسافة واحدة.
create or replace function public.normalize_ar(input text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when input is null or input = '' then '' else
    btrim(regexp_replace(
      regexp_replace(
        lower(
          translate(
            regexp_replace(
              translate(input, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
              '[' || chr(1552) || '-' || chr(1562) || chr(1611) || '-' || chr(1631) || chr(1648)
                  || chr(1750) || '-' || chr(1773) || chr(1600) || ']', '', 'g'),
            'أإآٱىةؤئ', 'اااايهوي')
        ),
        '[^[:alpha:][:digit:]]+', ' ', 'g'),
      '\s+', ' ', 'g'))
  end
$$;
