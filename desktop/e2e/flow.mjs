// اختبار شامل لنسخة الحاسوب (يعمل في CI مع PostgREST حقيقي): node e2e/flow.mjs <phase>
//   phase=first : إنشاء حساب بشعار من الواجهة، منتج، بيع، عرض سعر، نسخة احتياطية، حساب ثانٍ معزول
//   phase=second: بعد إعادة تشغيل البرنامج — فتح الحساب بكلمة السر والبيانات باقية
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:47831';
const SHOTS = process.env.SHOTS ?? 'e2e-shots';
const phase = process.argv[2] ?? 'first';
fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++; };

const rest = async (token, p, opts = {}) => {
  const r = await fetch(`${BASE}/rest/v1/${p}`, { ...opts, headers: { apikey: 'x', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) } });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${p}: ${r.status} ${t.slice(0, 300)}`);
  return j;
};
const rpc = (token, fn, body) => rest(token, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
const post = async (p, body, token) => {
  const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${p}: ${j.error ?? r.status}`);
  return j;
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1360, height: 860 }, locale: 'ar' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const token = async () => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'));
  return k ? JSON.parse(localStorage.getItem(k)).access_token : null;
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  if (phase === 'first') {
    // ---------------------------------------------------------------- إنشاء الحساب من الواجهة
    await page.getByPlaceholder('مركز الحلول الكهربائية').fill('مركز الحلول الكهربائية');
    await page.locator('input[type=file]').setInputFiles(path.resolve('resources/icon.png'));
    await page.locator('input[type=password]').nth(0).fill('سر1234');
    await page.locator('input[type=password]').nth(1).fill('سر1234');
    await page.screenshot({ path: `${SHOTS}/01-create.png` });
    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
    await page.locator('.side-brand').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/02-dashboard.png` });
    ok((await page.locator('.side-brand').innerText()).includes('مركز الحلول الكهربائية'), 'الشريط الجانبي باسم الشركة');
    ok(await page.locator('.side-brand img').count() === 1, 'الشريط الجانبي بشعار الشركة');
    const sideText = await page.locator('nav.side').innerText();
    ok(!sideText.includes('الطلبات') && !sideText.includes('متاجر المنصة') && !sideText.includes('المستخدمون'), 'صفحات الإنترنت مخفية');
    ok(sideText.includes('البيانات والنسخ الاحتياطي'), 'صفحة النسخ الاحتياطي ظاهرة');
    const t = await token();
    ok(!!t, 'جلسة محفوظة');

    // ---------------------------------------------------------------- منتج ومخزون
    const wh = (await rest(t, 'warehouses?select=id,name&is_default=eq.true'))[0];
    ok(!!wh, 'المخزن الرئيسي موجود');
    await rpc(t, 'upsert_product', { p: { name: 'انفيرتر كراون ٦ ك.واط', is_published: true, variants: [{ title: 'افتراضي', sku: 'CR-6', barcode: '6260000001', price: 657000, cost: 600000, opening: [{ warehouse_id: wh.id, qty: 10 }] }] } });
    await page.getByRole('link', { name: 'المنتجات' }).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/03-products.png` });
    ok((await page.locator('main').innerText()).includes('انفيرتر كراون'), 'المنتج يظهر في صفحة المنتجات');

    // ---------------------------------------------------------------- بيع وعرض سعر
    const v = (await rest(t, 'product_variants?select=id&sku=eq.CR-6'))[0];
    const sale = await rpc(t, 'pos_checkout', { p: { warehouse_id: wh.id, items: [{ variant_id: v.id, qty: 2 }], payments: [{ method: 'cash', amount: 1314000 }] } });
    ok(sale.number === 'S-000001', `فاتورة البيع الأولى ${sale.number}`);
    const stock = (await rest(t, `stock_levels?select=qty&variant_id=eq.${v.id}`))[0];
    ok(Number(stock.qty) === 8, `المخزون بعد البيع ${stock.qty}`);
    const q = await rpc(t, 'save_quotation', { p: { warehouse_id: wh.id, customer_name: 'عبدالله جاسم', title: 'منظومة ٦ ك.واط', features: ['ضمان ٤ سنوات'], items: [{ variant_id: v.id, qty: 1 }] } });
    ok(q.number === 'Q-000001', `عرض السعر الأول ${q.number}`);
    await page.getByRole('link', { name: 'عروض الأسعار' }).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/04-quotations.png` });
    ok((await page.locator('main').innerText()).includes('Q-000001'), 'العرض في سجل العروض');
    await page.getByRole('link', { name: 'نقطة البيع' }).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/05-pos.png` });
    ok((await page.locator('.pos-card').count()) >= 1, 'نقطة البيع تعرض المنتج');

    // ---------------------------------------------------------------- نسخة احتياطية
    const b = await post('/local/backup', {}, t);
    ok(fs.existsSync(b.file) && fs.statSync(b.file).size > 10_000, `نسخة احتياطية ${b.file}`);

    // ---------------------------------------------------------------- حساب ثانٍ على نفس الحاسوب: معزول
    const acc2 = await post('/local/create', { name: 'شركة ثانية', password: 'pass2' });
    const s2 = await post('/local/open', { id: acc2.id, password: 'pass2' });
    const p2 = await rest(s2.access_token, 'products?select=id');
    ok(p2.length === 0, 'الحساب الثاني لا يرى منتجات الأول');
    let rejected = false;
    try { await rest(t, 'products?select=id'); } catch { rejected = true; }
    ok(rejected || (await rest(t, 'products?select=id')).length === 0, 'جلسة الحساب الأول لا تفتح بيانات الثاني');
    let wrong = false;
    try { await post('/local/open', { id: acc2.id, password: 'bad' }); } catch { wrong = true; }
    ok(wrong, 'كلمة سر خاطئة مرفوضة');
    await post('/local/close', {});
  } else {
    // ---------------------------------------------------------------- بعد إعادة التشغيل
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/10-accounts.png` });
    const st = await (await fetch(`${BASE}/local/state`)).json();
    ok(st.accounts.length === 2, `حسابان محفوظان (${st.accounts.length})`);
    // الجلسة القديمة في المتصفح لم تعد صالحة بعد إعادة التشغيل؟ نسجّل الخروج إن ظهرت اللوحة
    if (await page.locator('.side-brand').count()) {
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
    }
    await page.getByText('مركز الحلول الكهربائية').first().click();
    await page.locator('input[type=password]').fill('سر1234');
    await page.getByRole('button', { name: 'دخول' }).click();
    await page.locator('.side-brand').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1200);
    const t = await token();
    const prods = await rest(t, 'products?select=name');
    ok(prods.length === 1 && prods[0].name.includes('كراون'), 'المنتج باقٍ بعد إعادة التشغيل');
    const inv = await rest(t, 'invoices?select=number');
    ok(inv.some((x) => x.number === 'S-000001'), 'الفاتورة باقية بعد إعادة التشغيل');
    await page.getByRole('link', { name: 'البيانات والنسخ الاحتياطي' }).first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/11-local-data.png` });
    ok((await page.locator('main').innerText()).includes('نسخة احتياطية الآن'), 'صفحة النسخ الاحتياطي');
  }
} catch (e) {
  console.log(`FAIL: ${e.message}`);
  failures++;
  await page.screenshot({ path: `${SHOTS}/error-${phase}.png` }).catch(() => {});
}
ok(errors.length === 0, `بلا أخطاء في الصفحة ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
