# قاعدة البيانات (Supabase / Postgres 15+)

> **الأعمدة بالحرف**: `packages/shared/src/types.ts` هو العقد. أي جدول هنا = interface هناك بنفس الأسماء والأنواع.
> كل تغيير لاحق = ملف migration **جديد** آمن لإعادة التشغيل. لا يُعدَّل ملف طُبّق، ولا يُغيَّر نوع إرجاع دالة (أنشئ `_v2`).

## المبادئ
1. **الرصيد لا يُكتب مباشرة.** `stock_levels` و`product_variants.available_qty` تحدّثهما الدالة الداخلية `private.apply_movement()` فقط.
2. **كل عملية مالية/مخزنية دالة واحدة ذرّية** (`security definer`، `set search_path = ''`) تفحص الصلاحية بنفسها، وتقفل الصفوف (`for update`) بترتيب ثابت (حسب `variant_id`) لتجنب الجمود.
3. **الأسعار من الخادم**: `place_order` و`pos_checkout` يقرآن السعر من `product_variants` (نقطة البيع تقبل سعراً مختلفاً فقط مع `pos.price_override`).
4. **لا حذف للمستندات**: الفاتورة والدفعة تُلغى (`status='void'` / `voided_at`) بقيد عكسي. المنتج ذو الحركات يُؤرشف.
5. **الأرقام المتسلسلة** من `doc_counters` بقفل الصف (`next_doc_number(kind)` ← `S-000123`) — نفس `formatDocNumber` في shared.
6. **migrations آمنة لإعادة التشغيل**: `create … if not exists`، `create or replace function`، `drop policy if exists` ثم `create policy`، enums بـ `do $$ … exception when duplicate_object`.
7. كل جدول: `created_at timestamptz default now()`، و`updated_at` بمشغّل `set_updated_at` حيث يوجد.

## الأنواع (enums)
مطابقة حرفياً للمصفوفات في `types.ts`: `profile_kind, profile_status, movement_kind, invoice_kind, invoice_channel, invoice_status,
payment_method, payment_direction, order_status, order_payment_method, order_payment_status, fulfillment, request_status,
serial_status, coupon_kind, banner_link_kind, banner_placement, home_section_kind, payment_tx_status, cash_session_status,
doc_status, notification_kind`.

## الجداول (schema `public`)
| الجدول | المفتاح | ملاحظات وقيود |
|---|---|---|
| `profiles` | id = auth.users.id | يُنشأ تلقائياً بمشغّل على `auth.users` (kind='customer'). `phone` فريد إن وُجد. مشغّل `protect_profile` يمنع غير المالك/staff.manage من تغيير `kind, role_id, is_owner, status`. |
| `staff_roles` | id | `permissions text[]`، `name` فريد |
| `customers` | id | `profile_id` فريد إن وُجد. صف واحد `is_cash_customer = true` (فهرس فريد جزئي). عند إكمال الزبون بياناته يُنشأ/يُحدَّث صفه. |
| `suppliers` | id | |
| `categories` | id | `parent_id` ← نفس الجدول (عمقان كحد أقصى)، `slug` فريد |
| `brands` | id | `slug` فريد |
| `products` | id | `slug` فريد، `search_text` عمود مولّد/محدّث = normalize_ar(name ‖ tags ‖ اسم العلامة ‖ SKUs). فهرس GIN trigram عليه. |
| `product_variants` | id | `sku` فريد (غير حساس لحالة الأحرف)، `barcode` فريد إن وُجد، `price >= 0`. فهرس على `product_id` و`barcode`. |
| `variant_costs` | variant_id | تكلفة — **قراءة costs.view فقط** |
| `product_images` | id | ترتيب `sort`؛ مشغّل يحدّث `products.cover_key` بأول صورة |
| `warehouses` | id | `code` فريد، مخزن واحد `is_default` (فهرس فريد جزئي) |
| `stock_levels` | (variant_id, warehouse_id) | `qty`، `reserved >= 0`. لا كتابة مباشرة لأي دور. |
| `stock_movements` | id bigint identity | سجل لا يُعدَّل ولا يُحذف (مشغّل يمنع update/delete). فهارس: (variant_id, created_at desc)، (ref_type, ref_id) |
| `serials` | id | `serial` فريد لكل variant |
| `transfers` + `transfer_items` | | |
| `stocktakes` + `stocktake_items` | | |
| `invoices` | id | `number` فريد، `due` عمود مولّد `total - paid`، `check (customer_id is not null or supplier_id is not null or kind='sale')` |
| `invoice_items` | id | |
| `payments` | id | `amount > 0` |
| `expenses` | id | |
| `cash_sessions` | id | جلسة مفتوحة واحدة لكل موظف (فهرس فريد جزئي) |
| `addresses` | id | للزبون نفسه، افتراضي واحد |
| `delivery_zones` | id | `governorate` فريد |
| `orders` + `order_items` + `order_events` | | `orders` في Realtime |
| `payment_transactions` | id | |
| `cart_items` | (profile_id, variant_id) | |
| `favorites` | (profile_id, product_id) | |
| `coupons` + `coupon_redemptions(coupon_id, profile_id, order_id)` | | `code` فريد بأحرف كبيرة |
| `banners`, `home_sections` | | |
| `product_requests` | id | |
| `reviews` | id | فريد (product_id, profile_id)؛ الزبون يقيّم فقط ما استلمه (طلب delivered) |
| `notifications`, `notification_campaigns`, `push_tokens` | | |
| `app_settings` | key | `is_public` |
| `audit_log` | id bigint | مشغّل `audit()` على جداول الموظفين |
| `doc_counters` | kind | |

### إضافات من صور المرجع (القرار ١٨)
| الجدول | ملاحظات |
|---|---|
| `branches` | فروع المتجر؛ فرع افتراضي واحد. `warehouses.branch_id`، `invoices.branch_id` (من المخزن)، `money_accounts.branch_id` |
| `money_accounts` | صناديق نقدية وحسابات مصرفية ومحافظ، لكل منها عملة (IQD/USD) ورصيد افتتاحي؛ صندوق افتراضي لنقطة البيع. `payments.account_id` و`expenses.account_id` |
| `account_transfers` | تحويل بين الصناديق (مع سعر صرف إن اختلفت العملة) — دالة `transfer_money` |
| `variant_units` | وحدات تعبئة بباركود خاص (كرتونة = ١٢ قطعة)؛ الباركود فريد عبر `product_variants.barcode` و`variant_units.barcode` معاً. المسح يضيف `factor` قطعة |
| `stock_lots` | دفعات بتاريخ صلاحية للمنتجات `track_expiry`؛ الشراء ينشئ دفعة، والبيع يستهلك الأقرب انتهاءً (FEFO) تلقائياً داخل `apply_movement` |
| `stock_vouchers` + `stock_voucher_items` | سندات مخزنية يدوية: إدخال، إخراج، خروج عينة، رجوع عينة، تالف — دالة `post_stock_voucher(p jsonb)` (inventory.adjust) بحركات `manual_in/manual_out/sample_out/sample_return/damage` |
| `quotations` + `quotation_items` | عروض الأسعار (quotations.manage): `save_quotation(p jsonb)`، `convert_quotation(id, payments jsonb)` ← فاتورة بيع بنفس منطق `pos_checkout` (يعيد التحقق من المخزون والأسعار ما لم يُثبَّت السعر) |
| العملات | `invoices.currency/exchange_rate`، `payments.currency/exchange_rate/amount_iqd` (مولّد)، `expenses.currency/exchange_rate`. الأرصدة (`customer_balances`, `supplier_balances`) تعطي `balance` بالدينار و`balance_usd` لمستندات الدولار **منفصلين**. سعر اليوم في `app_settings.currency` (`CurrencySettings`). التكلفة والأرباح دائماً بالدينار (تحويل بسعر المستند) |
| `pos_checkout` | يقبل في البنود `price_tier` ('retail'/'wholesale' — الجملة من `wholesale_price`) و`unit_id` (وحدة تعبئة)، وفي الرأس `currency` و`account_id` لكل دفعة |
| `money_account_balances` (view) | الرصيد بعملة الحساب وبالدينار المكافئ |
| `dashboard_summary` | يضيف `purchases_total` و`cash_balance` (مجموع الصناديق والحسابات بالدينار) |
| `near_expiry(days, lim)` | دفعات تنتهي خلال N يوم (inventory.view) |

**Views** (`security_invoker = true`): `customer_balances`، `supplier_balances` (الأعمدة في types.ts)، `variant_stock` (variant + اسم المنتج + الأرصدة لكل مخزن — للوحة).

## الدوال المساعدة
- `public.normalize_ar(text) returns text immutable` — نفس قواعد `normalizeArabic` في shared (تشكيل، تطويل، أإآ←ا، ى←ي، ة←ه، ؤ←و، ئ←ي، أرقام مشرقية←لاتينية، أحرف صغيرة).
- `public.is_staff() returns boolean` — profile.kind='staff' و status='active'.
- `public.has_perm(p text) returns boolean` — is_staff و(is_owner أو p = any(role.permissions))، **و**إن كان للمستخدم عامل تحقق بخطوتين مفعّل (`auth.mfa_factors.status='verified'`) فيجب أن تكون الجلسة `aal2` (`auth.jwt()->>'aal'`). **stable**، تُستعمل في كل سياسة.
- `public.my_customer_id() returns uuid`.
- `public.next_doc_number(kind text) returns text` (داخلية).
- `public.make_owner(email text, full_name text)` — تجعل مستخدم auth الموجود مالكاً (kind='staff', is_owner, active). **تنفيذها مسحوب من anon/authenticated** (تُشغَّل من SQL Editor فقط). انظر دليل الإعداد الخطوة ٦.
- `private.apply_movement(variant, warehouse, qty, kind, unit_cost, ref_type, ref_id, note)` — تقفل `stock_levels`، تمنع السالب (إلا بإعداد)، تكتب الحركة مع `balance_after`، تحدّث `available_qty` للنسخة، وتحدّث متوسط التكلفة عند `purchase`/`opening`.

## دوال RPC (العقد مع الواجهات — الأسماء والمعاملات بالحرف)
الكل `security definer` ويعيد JSON/صفاً واضحاً، ويرمي أخطاء **بالعربية** (`raise exception using message = '…', errcode = 'P0001'`) تُعرض للمستخدم كما هي.

### للزبون (authenticated، والتصفح لـ anon)
| الدالة | المعاملات | ماذا تفعل |
|---|---|---|
| `store_search` | `q text, category uuid, brand uuid, min_price, max_price, in_stock bool, sort text ('relevance','newest','price_asc','price_desc','best'), lim int, off int` | منتجات منشورة مع: السعر الأدنى/الأعلى، compare_at، التوفر، cover_key، rating. **anon مسموح** |
| `store_home` | — | البانرات الفعالة + الأقسام الظاهرة + أقسام الرئيسية بمنتجاتها (حسب kind) في استدعاء واحد. **anon** |
| `store_product` | `slug_or_id text` | المنتج + النسخ (بلا تكلفة) + الصور + العلامة + القسم + آخر التقييمات + مشابهة. **anon** |
| `quote_cart` | `items jsonb [{variant_id, qty}], governorate text, coupon_code text` | يعيد `CartQuote` (types.ts). **anon** (بلا كوبون لكل زبون) |
| `place_order` | `items jsonb, address_id uuid, fulfillment, payment_method, coupon_code, note` | ينشئ الطلب بأسعار الخادم، **يحجز المخزون**، يسجل الكوبون، يفرّغ السلة، حدث «استلمنا طلبك»، إشعار للموظفين. يرفض: غير مكمل البيانات، كمية غير متوفرة، طريقة دفع معطلة، أقل من الحد الأدنى. |
| `cancel_my_order` | `order_id, reason` | فقط pending/confirmed، يحرر الحجز |
| `upsert_my_profile` | `full_name, phone, governorate` | يكمل البيانات (onboarded) وينشئ/يحدّث صف `customers` |
| `delete_my_account` | — | شرط Google Play: يمسح البيانات الشخصية (الاسم ← «زبون محذوف»، الهاتف، العناوين، الرموز، السلة، المفضلة)، يبقي الطلبات والفواتير مجهولة، ويحذف مستخدم auth (عبر دالة الخادم `account`) |
| `create_product_request` | `title, details, image_key, link_url, qty, budget` | |
| `submit_review` | `product_id, rating, comment` | فقط بعد طلب مسلَّم يحوي المنتج؛ يحدّث rating_avg/count |
| `mark_notifications_read` | `ids uuid[]` (null = الكل) | |

### للموظفين (تفحص الصلاحية المذكورة)
| الدالة | الصلاحية | ماذا تفعل |
|---|---|---|
| `upsert_product(p jsonb)` | products.write | المنتج + النسخ + الصور + (التكلفة إن costs.view) + الرصيد الافتتاحي للجديد، في معاملة. يعيد المنتج. |
| `archive_product(id)` / `restore_product(id)` | products.delete | |
| `next_barcode()` | products.write | تسلسل للباركود الداخلي (shared `internalEan13`) |
| `pos_checkout(p jsonb)` | pos.sell | `{warehouse_id, customer_id?, items:[{variant_id, qty, unit_price?, discount?, serials?}], discount?, payments:[{method, amount, reference?}], note?}` ← فاتورة بيع + حركات + دفعات + فكة. الآجل يتطلب زبوناً غير «نقدي» ولا يتجاوز `credit_limit`. الخصم يتطلب pos.discount. يعيد `{invoice_id, number, change}` |
| `post_purchase(p jsonb)` | purchases.manage | `{supplier_id, warehouse_id, items:[{variant_id, qty, unit_cost, serials?}], discount?, payments?, note?}` ← فاتورة شراء + حركات + متوسط التكلفة |
| `post_return(p jsonb)` | invoices.void | `{invoice_id, items:[{invoice_item_id, qty}], refund:{method, amount}?, reason}` ← فاتورة إرجاع (بيع أو شراء) + حركات عكسية + دفعة مستردة |
| `void_invoice(id, reason)` | invoices.void | قيد عكسي كامل (حركات + دفعات) |
| `record_payment(p jsonb)` | finance.manage | سند قبض/صرف لزبون/مورد مع ربط اختياري بفاتورة (يحدّث `paid`) |
| `record_expense(p jsonb)` | finance.manage | |
| `adjust_stock(p jsonb)` | inventory.adjust | `{variant_id, warehouse_id, mode:'set'|'delta', qty, kind:'adjustment'|'damage'|'opening', note}` |
| `transfer_stock(p jsonb)` | inventory.transfer | |
| `create_stocktake(warehouse_id, note)` / `set_stocktake_count(id, variant_id, counted)` / `apply_stocktake(id)` | inventory.adjust | |
| `set_order_status(order_id, status, note)` | orders.manage | آلة الحالات في `order-flow.ts` حرفياً. `delivered` ← فاتورة بيع (channel=online) تستهلك الحجز + دفعة إن COD/مدفوع إلكترونياً. `cancelled` ← تحرير الحجز. `returned` ← فاتورة إرجاع. كل تغيير: حدث + إشعار للزبون. |
| `set_request_status(id, status, reply, product_id)` | requests.manage | + إشعار للزبون |
| `open_cash_session(float)` / `close_cash_session(counted, note)` | finance.manage أو pos.sell | المتوقع = الافتتاحي + نقد داخل − نقد خارج − مصروفات نقدية في الجلسة |
| `dashboard_summary(from, to)` | dashboard.view | `DashboardSummary` (الربح null بلا costs.view) |
| `sales_series(from, to, bucket 'day'|'week'|'month')` | reports.view | `SalesPoint[]` بتوقيت بغداد |
| `top_products(from, to, lim)` | reports.view | `TopProductRow[]` |
| `inventory_valuation()` | costs.view | `InventoryValuationRow[]` |
| `low_stock(lim)` | inventory.view | `LowStockRow[]` |
| `stagnant_products(days, lim)` | reports.view | لم يُبع منذ N يوم وله رصيد |
| `customer_statement(customer_id, from, to)` / `supplier_statement(…)` | finance.view | كشف حساب: الحركات مرتبة مع الرصيد التراكمي |
| `send_campaign(id)` | notifications.send | يضع وقت الإرسال، ويستدعي push لموضوع all |

## الصلاحيات (RLS) — ملخص
| الجدول | anon | الزبون | الموظف |
|---|---|---|---|
| categories, brands, banners (فعالة), home_sections, delivery_zones (فعالة) | قراءة الظاهر | قراءة | قراءة/كتابة بـ products.write أو store.manage |
| products, product_variants, product_images | قراءة المنشور غير المؤرشف | نفسه | products.view / products.write |
| variant_costs | ✗ | ✗ | costs.view |
| stock_levels, stock_movements, serials, transfers, stocktakes, warehouses | ✗ | ✗ | inventory.view (الكتابة عبر الدوال فقط) |
| reviews | قراءة الظاهر | قراءة + إنشاء عبر الدالة | إخفاء/إظهار products.write |
| profiles | ✗ | نفسه فقط | customers.view / staff.manage |
| customers | ✗ | صفه فقط | customers.view / customers.manage |
| addresses, cart_items, favorites, push_tokens | ✗ | ملكه فقط (CRUD) | ✗ (عبر الطلب) |
| orders, order_items, order_events (is_customer_visible) | ✗ | ملكه فقط (قراءة) | orders.view (الكتابة عبر الدوال) |
| product_requests | ✗ | ملكه (قراءة؛ إنشاء عبر الدالة) | requests.manage |
| notifications | ✗ | ملكه | ✗ |
| invoices, invoice_items, payments | ✗ | ✗ | invoices.view / finance.view |
| expenses, cash_sessions | ✗ | ✗ | finance.view |
| suppliers | ✗ | ✗ | purchases.manage |
| coupons | ✗ | ✗ (التحقق عبر quote_cart) | store.manage |
| app_settings | `is_public` فقط | `is_public` فقط | الكل قراءة؛ كتابة settings.manage |
| staff_roles | ✗ | ✗ | قراءة للموظف؛ كتابة staff.manage |
| audit_log | ✗ | ✗ | audit.view |

## التخزين
- حاوية **`media`** عامة القراءة: `products/ categories/ brands/ banners/ campaigns/`. الكتابة: products.write أو store.manage.
- حاوية **`private`**: `requests/<profile_id>/…` (الزبون يرفع في مجلده فقط، يقرأ مجلده؛ requests.manage يقرأ الكل)، `avatars/<profile_id>/…`.
- حد الملف ١٠ ميغا، الأنواع: image/webp, image/png, image/jpeg.

## المشغّلات والإشعارات
- `on_auth_user_created` ← profile.
- `notify_order_change` على `order_events` (is_customer_visible) ← صف في `notifications` للزبون.
- `notifications` بعد الإدراج ← `pg_net` إلى دالة `push` (الرابط والسر في `private.settings`، مثل سعي).
- طلب جديد ← Realtime على `orders` (اللوحة تشترك وتصدر صوتاً).
- `audit()` على: products, product_variants, variant_costs, categories, brands, warehouses, customers, suppliers, coupons, banners, home_sections, staff_roles, profiles (تغيير الدور/الحالة)، app_settings، delivery_zones.

## دوال الخادم (Deno — `supabase/functions/`)
| الدالة | ماذا تفعل |
|---|---|
| `push` | من pg_net: يرسل FCM HTTP v1 لرموز الزبون، أو لموضوع `all` للحملات. السر `PUSH_WEBHOOK_SECRET`، حساب `FCM_SERVICE_ACCOUNT` |
| `payments` | `create` (للزبون: ينشئ رابط دفع للطلب من مبلغ قاعدة البيانات)، `status`. مزوّدان: `wayl` (أسرار `WAYL_API_KEY`, `WAYL_BASE_URL`, `WAYL_WEBHOOK_SECRET`) و`mock` |
| `payments-webhook` | يتحقق من التوقيع ← `payment_transactions` + `orders.payment_status='paid'` + حدث + إشعار. `verify_jwt=false` |
| `staff` | للمالك/staff.manage: إنشاء موظف (بريد + كلمة سر مؤقتة)، تعطيل، إعادة تعيين كلمة السر — بمفتاح service role داخل الخادم فقط |
| `account` | حذف حساب الزبون من auth بعد `delete_my_account` |
| `media` | رابط رفع موقّع: R2 (إن وُجدت أسرار `R2_*`) وإلا Supabase Storage |

## البيانات الأولية (`supabase/seed.sql`، آمنة لإعادة التشغيل)
- الأدوار الافتراضية (من `DEFAULT_ROLES`)، المخزن الرئيسي، «زبون نقدي»، عدادات المستندات، مناطق التوصيل (١٩ محافظة، بغداد مفعّلة)،
  الإعدادات (`store`, `checkout`, `inventory`, `invoice`, `app`) بقيم `demo.ts`، أقسام الرئيسية الأربعة.

## الاختبارات (`supabase/tests/`) — تعمل على Postgres محلي وفي CI
- RLS: anon لا يرى التكلفة/المخزون/غير المنشور؛ زبون لا يرى طلب غيره؛ كاشير لا يرى التكلفة؛ لا أحد يكتب `stock_levels`.
- المنطق: بيع ← الرصيد ينقص والحركة مسجلة والتكلفة مثبتة؛ طلب ← حجز؛ إلغاء ← تحرير؛ تسليم ← فاتورة؛ إرجاع ← رصيد يعود؛
  شراء ← متوسط تكلفة صحيح؛ منع السالب؛ تزامن طلبين على آخر قطعة (واحد ينجح)؛ آجل يتجاوز الحد ← رفض؛ الجرد؛ النقل؛ الكوبون؛ الترقيم.
- كل migrations تُشغّل **مرتين** متتاليتين بلا خطأ.
