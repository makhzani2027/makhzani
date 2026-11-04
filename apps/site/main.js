// موقع رقيم التعريفي — كل السلوك هنا (صغير وبلا مكتبات). الصفحة تعمل كاملة بلا JavaScript؛ هذا تحسين فوقها.
(() => {
  const root = document.documentElement;
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // أيقونات الأقسام الحية (من packages/shared/src/icons.ts، يحقنها scripts/build-site.mjs)
  const ICONS = __ICONS__;

  /** الأرقام المشرقية في النصوص (الرموز والهواتف تبقى لاتينية) */
  const ar = (v) => String(v).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const days = (n) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? `${ar(n)} أيام` : `${ar(n)} يوماً`);

  // ------------------------------------------------------------ المقدمة المتحركة
  if (root.classList.contains('has-intro')) {
    try { sessionStorage.setItem('rq.intro', '1'); } catch (e) { /* تصفح خاص: تظهر في كل مرة */ }
    const intro = document.querySelector('[data-intro]');
    const done = () => root.classList.remove('has-intro');
    const t = setTimeout(done, 1500);
    const skip = () => { clearTimeout(t); done(); };
    intro?.addEventListener('click', skip);
    addEventListener('keydown', skip, { once: true });
  }

  // ------------------------------------------------------------ الشريط العلوي والقائمة
  const hdr = document.querySelector('[data-hdr]');
  const onScroll = () => hdr?.classList.toggle('is-stuck', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const menuBtn = document.querySelector('[data-menu]');
  const setMenu = (open) => {
    hdr.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'القائمة');
  };
  menuBtn?.addEventListener('click', (e) => {
    const open = !hdr.classList.contains('is-open');
    setMenu(open);
    // القائمة قبل الزر في ترتيب الصفحة: من لوحة المفاتيح ننقل التركيز لأول رابط فيها
    if (open && e.detail === 0) document.querySelector('#nav a')?.focus();
  });
  $$('#nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  // خروج التركيز من الشريط العلوي (Tab بعد آخر عنصر) يغلق القائمة
  hdr?.addEventListener('focusout', (e) => { if (hdr.classList.contains('is-open') && !hdr.contains(e.relatedTarget)) setMenu(false); });
  // النقر خارج القائمة يغلقها
  document.addEventListener('click', (e) => { if (hdr?.classList.contains('is-open') && !hdr.contains(e.target)) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && hdr?.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });

  // ------------------------------------------------------------ الظهور عند التمرير + العدّ
  const countUp = (el) => {
    if (!Number(el.dataset.count) || reduce) return;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 1100);
      // الهدف يُقرأ في كل إطار: قد تصل القيمة الحية أثناء العدّ
      el.textContent = ar(Math.round(Number(el.dataset.count) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      $$('[data-count]', e.target).forEach(countUp);
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  const watch = (els) => els.forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
  watch($$('.rv'));

  // ------------------------------------------------------------ بيانات المتجر
  const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  const digits = (p) => String(p || '').replace(/[^\d+]/g, '');
  // رقم دولي بلا + (wa.me لا يقبل الصيغة المحلية 0770…، وصفحة الإعدادات تحفظ الرقم كما كُتب)
  const intl = (p) => {
    const d = digits(p).replace(/^\+/, '').replace(/^00/, '');
    return /^07\d{9}$/.test(d) ? `964${d.slice(1)}` : /^7\d{9}$/.test(d) ? `964${d}` : d;
  };
  const prettyPhone = (p) => {
    const d = intl(p);
    // +964 7XX XXX XXXX
    return /^9647\d{9}$/.test(d) ? `+964 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : p;
  };
  const links = {
    whatsapp: (c) => c.whatsapp && `https://wa.me/${intl(c.whatsapp)}`,
    phone: (c) => c.phone && `tel:${digits(c.phone)}`,
    email: (c) => c.email && `mailto:${c.email}`,
    map: (c) => c.map_url,
    instagram: (c) => c.socials?.instagram,
    facebook: (c) => c.socials?.facebook,
    tiktok: (c) => c.socials?.tiktok,
    telegram: (c) => c.socials?.telegram,
  };

  function apply(c) {
    if (c.returns_days) c.returns_days_text = days(Number(c.returns_days));
    $$('[data-cfg]').forEach((el) => {
      const k = el.dataset.cfg;
      const v = get(c, k);
      if (v == null || v === '') return;
      el.textContent = k === 'phone' || k === 'whatsapp' ? prettyPhone(v) : v;
    });
    $$('[data-link]').forEach((el) => {
      const href = links[el.dataset.link]?.(c);
      if (href) { el.href = href; el.hidden = false; }
      else if (el.closest('[data-socials]')) el.hidden = true;
    });
    $$('[data-show]').forEach((el) => { el.hidden = !get(c, el.dataset.show); });
    // بطاقات التواصل الصغيرة: إن كان عدد الظاهر منها فردياً تمتد الأخيرة على عمودين
    const small = $$('.contact-grid > .c-card:not(.c-wa)').filter((el) => !el.hidden);
    small.forEach((el, i) => el.classList.toggle('c-wide', small.length % 2 === 1 && i === small.length - 1));
    const socials = document.querySelector('[data-socials]');
    if (socials) socials.hidden = !$$('a', socials).some((a) => !a.hidden);
    if (c.site && typeof c.site === 'object') renderSite(c);
    if (c.play_store_url) {
      $$('[data-play]').forEach((el) => { el.href = c.play_store_url; el.removeAttribute('aria-disabled'); el.rel = 'noopener'; });
      $$('[data-play-meta]').forEach((el) => { el.textContent = 'حمّله من المتجر'; });
    }
    document.body.classList.toggle('is-draft', !!c.legal_review_pending);
  }

  // ------------------------------------------------------------ محتوى الموقع (app_settings.site — يحرّره المالك من «الموقع التعريفي» في اللوحة)
  // كل نص من قاعدة البيانات يُكتب بـ textContent فقط. العلامات المسموحة: {city} {name} {returns_days} {year}، و**غامق**، و[نص](/رابط).
  const sb = window.RAQEEM_SUPABASE;
  const hasSb = !!(sb && sb.url && sb.anonKey);
  const mediaSrc = (key, size) => {
    const clean = String(key || '').replace(/^\/+/, '');
    if (!clean || /^(blob|data):/.test(clean)) return null;
    if (/^https:\/\//.test(clean)) return clean;
    if (!hasSb) return null;
    const base = (sb.mediaBase || `${sb.url}/storage/v1/object/public/media`).replace(/\/$/, '');
    return `${base}/${/\.(webp|png|jpe?g|gif|svg|avif)$/i.test(clean) ? clean : `${clean}-${size}.webp`}`;
  };
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ class: 'i', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name] || ICONS.card || '');
    svg.append(p);
    return svg;
  };
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const safeHref = (u) => (/^\/(?!\/)/.test(u) || /^https:\/\//.test(u) ? u : null);
  /** يكتب نصاً بعلامات بسيطة داخل عنصر: نص عادي + strong + a — بلا innerHTML */
  const rich = (node, text) => {
    node.textContent = '';
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let i = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m.index > i) node.append(text.slice(i, m.index));
      if (m[1] != null) node.append(el('strong', '', m[1]));
      else {
        const href = safeHref(m[3]);
        if (href) {
          const a = el('a', '', m[2]);
          a.href = href;
          if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
          node.append(a);
        } else node.append(m[2]);
      }
      i = re.lastIndex;
    }
    if (i < text.length) node.append(text.slice(i));
  };
  let liveProducts = 0; // عدد المنتجات المنشورة (يُستعمل حين stats.products = null)
  let current = null;

  function renderSite(c) {
    current = c;
    const s = c.site;
    const vars = { city: c.city || 'بغداد', name: c.name || 'رقيم', returns_days: c.returns_days ? days(Number(c.returns_days)) : '', year: ar(new Date().getFullYear()) };
    const fill = (t) => String(t ?? '').replace(/\{(\w+)\}/g, (m, k) => vars[k] || m);
    // قائمة غائبة في البيانات (config.json تالف) ← يبقى ما في الصفحة
    const list = (sel, items, make) => {
      const host = document.querySelector(sel);
      if (!host || !Array.isArray(items)) return;
      host.replaceChildren(...items.filter(Boolean).map(make));
    };

    $$('[data-tpl]').forEach((n) => { const v = get(c, n.dataset.tpl); if (typeof v === 'string' && v.trim()) rich(n, fill(v)); });

    // الأسئلة: details/summary أصلية — لوحة المفاتيح وقارئ الشاشة يعملان بلا سكربت إضافي
    list('[data-faq]', Array.isArray(s.faq) ? s.faq.filter((f) => f && f.q) : null, (f) => {
      const d = el('details');
      const sum = el('summary', '', fill(f.q));
      const pm = el('span', 'pm');
      pm.setAttribute('aria-hidden', 'true');
      sum.append(pm);
      const ans = el('div', 'ans');
      rich(ans, fill(f.a));
      d.append(sum, ans);
      return d;
    });
    const faqList = document.querySelector('[data-faq]');
    if (faqList) faqList.closest('section').hidden = !faqList.children.length;

    const methods = Array.isArray(s.payments?.methods) ? s.payments.methods.filter((m) => m && m.enabled && m.label) : null;
    list('[data-methods]', methods, (m) => {
      const li = el('li');
      const ic = el('span', 'm-ic');
      const neutral = m.key === 'cod' ? 'cash' : m.key === 'office' ? 'store' : 'card';
      const src = mediaSrc(m.logo_key, 'sm');
      if (src) {
        const img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onerror = () => { ic.classList.remove('has-logo'); ic.replaceChildren(icon(neutral)); };
        img.src = src;
        ic.classList.add('has-logo');
        ic.append(img);
      } else ic.append(icon(neutral));
      const body = el('div');
      body.append(el('b', '', fill(m.label)));
      if (m.description) body.append(el('p', '', fill(m.description)));
      li.append(ic, body);
      return li;
    });
    list('[data-deliv]', Array.isArray(s.delivery?.rows) ? s.delivery.rows.filter((r) => r && (r.label || r.value)) : null, (r) => {
      const row = el('div');
      row.append(el('dt', '', fill(r.label)), el('dd', '', fill(r.value)));
      return row;
    });
    const govs = Array.isArray(s.delivery?.governorates) ? s.delivery.governorates : null;
    list('[data-governorates]', govs, (g) => el('li', '', g));

    // شريط الأرقام: التلقائي = عدد الشارات وعدد طرق الدفع المفعّلة
    const st = s.stats || {};
    const vals = {
      products: st.products ?? (liveProducts >= 50 ? liveProducts : null),
      governorates: st.governorates ?? (govs ? govs.length : null),
      delivery_days: st.delivery_days,
      payment_methods: st.payment_methods ?? (methods ? methods.length : null),
    };
    $$('[data-stat]').forEach((n) => {
      const v = vals[n.dataset.stat];
      if (v == null || v === '') return;
      if (n.dataset.count) n.dataset.count = v;
      n.textContent = ar(v);
    });

    // بيانات البحث المنظّمة تتبع المدينة وطرق الدفع
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const j = JSON.parse(ld.textContent);
        j.name = c.name || j.name;
        if (j.address) j.address.addressLocality = vars.city;
        if (methods && methods.length) j.paymentAccepted = methods.map((m) => fill(m.label)).join('، ');
        ld.textContent = JSON.stringify(j);
      } catch (e) { /* يبقى كما بُني */ }
    }
  }

  /** يدمج صفوف app_settings (store، site، app) فوق config.json: التواصل من store، والمحتوى من site قسماً قسماً (القوائم تُستبدل كاملة) */
  function merge(cfg, rows) {
    const by = {};
    (Array.isArray(rows) ? rows : []).forEach((r) => { if (r && r.key) by[r.key] = r.value; });
    const m = { ...cfg, socials: { ...cfg.socials }, site: { ...(cfg.site || {}) } };
    for (const [k, v] of Object.entries(by.store || {})) {
      if (k === 'socials' && v) Object.entries(v).forEach(([s, u]) => { if (u) m.socials[s] = u; });
      else if (v != null && v !== '' && typeof v !== 'object') m[k] = v;
    }
    if (by.app && by.app.play_store_url) m.play_store_url = by.app.play_store_url;
    const live = by.site && typeof by.site === 'object' ? by.site : {};
    for (const [sec, def] of Object.entries(m.site)) {
      const v = live[sec];
      if (Array.isArray(def)) { if (Array.isArray(v)) m.site[sec] = v; continue; }
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const next = { ...def };
      for (const [k, x] of Object.entries(v)) if (x !== undefined && Array.isArray(def[k]) === Array.isArray(x)) next[k] = x;
      m.site[sec] = next;
    }
    return m;
  }

  function renderCats(list) {
    const ul = document.querySelector('[data-cats]');
    if (!ul || !list.length) return;
    const more = ul.querySelector('.cat-more');
    $$('.cat:not(.cat-more)', ul).forEach((li) => li.remove());
    for (const cat of list.slice(0, 11)) {
      const li = document.createElement('li');
      li.className = 'cat rv in';
      const d = ICONS[cat.icon] || ICONS.tag;
      li.innerHTML = `<span class="cat-ic"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg></span><h3></h3><p></p>`;
      li.querySelector('h3').textContent = cat.name;
      li.querySelector('p').textContent = cat.description || '';
      ul.insertBefore(li, more);
    }
  }

  const cfgP = fetch('/config.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  // بيانات حية من Supabase (إن حُقنت عند البناء): طلب واحد لـ store و site (و app لرابط Google Play).
  // نطبّق مرة واحدة حين يصل الاثنان، أو config.json وحده بعد ١٫٢ ثانية إن تأخر الخادم. أي خطأ يُتجاهل ويبقى ما في config.json.
  const api = (path, extra = {}) => fetch(`${sb.url}/rest/v1/${path}`, {
    headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.anonKey}`, ...extra },
  });
  const liveP = hasSb
    ? api('app_settings?key=in.(store,site,app)&select=key,value').then((r) => (r.ok ? r.json() : [])).catch(() => [])
    : Promise.resolve([]);
  const shown = () => root.classList.remove('cfg-wait');
  cfgP.then((cfg) => {
    const slow = setTimeout(() => { apply(cfg); shown(); }, 1200);
    liveP.then((rows) => { clearTimeout(slow); apply(merge(cfg, rows)); shown(); });
    if (!hasSb) return;
    if (document.querySelector('[data-cats]')) {
      api('categories?select=name,slug,icon,description&is_visible=eq.true&parent_id=is.null&order=sort.asc')
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => Array.isArray(rows) && renderCats(rows))
        .catch(() => {});
      api('products?select=id&is_published=eq.true', { Prefer: 'count=exact', Range: '0-0' })
        .then((r) => {
          const n = Number((r.headers.get('content-range') || '').split('/')[1]);
          // نعرض العدد الحقيقي فقط إن كان معبّراً
          liveProducts = n;
          if (n >= 50 && current && current.site?.stats?.products == null) renderSite(current);
        })
        .catch(() => {});
    }
  });

  // ------------------------------------------------------------ زر التنزيل (download.json يكتبه البناء)
  fetch('/download.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => {
      const apks = $$('[data-apk]');
      if (!d || !d.url) {
        // قبل نشر أول نسخة: الزر يقود إلى التواصل (الطلب عبر واتساب متاح من الآن)
        $$('[data-apk-meta]').forEach((el) => { el.textContent = 'قريباً · اطلب الآن عبر واتساب'; });
        return;
      }
      apks.forEach((a) => { a.href = d.url; a.removeAttribute('aria-disabled'); a.setAttribute('download', 'raqeem.apk'); });
      const parts = ['ملف APK'];
      if (d.version) parts.push(`النسخة ${ar(d.version)}`);
      if (d.size_mb) parts.push(`${ar(d.size_mb)} ميغا`);
      $$('[data-apk-meta]').forEach((el) => { el.textContent = parts.join(' · '); });
    });
  // زر معطّل لا ينقل الصفحة
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[aria-disabled="true"]');
    if (a) e.preventDefault();
  });

  // ------------------------------------------------------------ صفحة مشاركة المنتج /p/<slug>
  // التطبيق يشارك ${SITE_URL}/p/<slug>؛ نقرأ المنتج من store_product العامة إن حُقنت بيانات Supabase، وإلا نعرض صفحة عامة.
  const pv = document.querySelector('[data-product]');
  if (pv) {
    const one = (s) => pv.querySelector(s);
    const raw = location.pathname.replace(/^\/p\/?/, '').split('/')[0] || new URLSearchParams(location.search).get('slug') || '';
    let slug = '';
    try { slug = decodeURIComponent(raw).trim(); } catch (e) { slug = ''; }
    const money = (n) => ar(Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')).replace(/,/g, '٬');
    if (slug) one('[data-pv-open]').href = `raqeem://product/${encodeURIComponent(slug)}`;
    const sb = window.RAQEEM_SUPABASE;
    if (slug && sb && sb.url && sb.anonKey) {
      pv.classList.add('is-loading');
      fetch(`${sb.url}/rest/v1/rpc/store_product`, {
        method: 'POST',
        headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug_or_id: slug }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((d) => {
          pv.classList.remove('is-loading');
          const p = d && d.product;
          if (!p) {
            one('[data-pv-name]').textContent = 'هذا المنتج لم يعد متاحاً';
            one('[data-pv-desc]').textContent = 'ربما بيع أو أوقف عرضه. افتح التطبيق لترى منتجات مشابهة وعروض اليوم.';
            return;
          }
          if (p.slug) one('[data-pv-open]').href = `raqeem://product/${encodeURIComponent(p.slug)}`;
          one('[data-pv-name]').textContent = p.name;
          document.title = `${p.name} — رقيم`;
          const crumb = [d.brand && d.brand.name, d.category && d.category.name].filter(Boolean).join(' · ');
          if (crumb) one('[data-pv-crumb]').textContent = crumb;
          const desc = (p.description || '').trim();
          one('[data-pv-desc]').textContent = desc ? (desc.length > 320 ? `${desc.slice(0, 320).trim()}…` : desc) : 'افتحه في التطبيق لترى صوره وخياراته، واطلبه بالدفع عند الاستلام.';
          const vs = (d.variants || []).filter((v) => v.price != null);
          if (vs.length) {
            const best = vs.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
            one('[data-pv-amount]').textContent = (vs.length > 1 && vs.some((v) => Number(v.price) !== Number(best.price)) ? 'من ' : '') + money(best.price);
            const was = Number(best.compare_at_price);
            if (was > Number(best.price)) {
              one('[data-pv-was]').textContent = `${money(was)} د.ع`;
              one('[data-pv-was]').hidden = false;
              one('[data-pv-off]').textContent = `خصم ${ar(Math.round((1 - Number(best.price) / was) * 100))}٪`;
              one('[data-pv-off]').hidden = false;
            }
            one('[data-pv-price]').hidden = false;
            const qty = vs.reduce((s, v) => s + Number(v.available_qty || 0), 0);
            const st = one('[data-pv-stock]');
            st.textContent = qty > 0 ? (qty <= 3 ? `متوفر · بقي ${ar(qty)} فقط` : 'متوفر') : 'نفد حالياً · اطلب توفيره من التطبيق';
            st.classList.toggle('out', qty <= 0);
            st.hidden = false;
          }
          const key = p.cover_key || (d.images && d.images[0] && d.images[0].key) || (vs[0] && vs[0].image_key);
          if (key) {
            const base = (sb.mediaBase || `${sb.url}/storage/v1/object/public/media`).replace(/\/$/, '');
            const clean = String(key).replace(/^\/+/, '');
            const src = /^https?:\/\//.test(clean) ? clean : `${base}/${/\.(webp|png|jpe?g|gif|svg|avif)$/i.test(clean) ? clean : `${clean}-md.webp`}`;
            const img = one('[data-pv-img]');
            img.alt = p.name;
            img.onload = () => { img.hidden = false; one('[data-pv-ph]').hidden = true; };
            img.src = src;
          }
        });
    }
  }

  // ------------------------------------------------------------ متجر على رقيم /s/<رابط المتجر>
  // كل الطلبات بترويسة x-store فتعيد قاعدة البيانات بيانات هذا المتجر وحده (العزل في الخادم).
  // الطلب عبر واتساب المتجر. كل نص من قاعدة البيانات يُكتب بـ textContent فقط.
  const sf = document.querySelector('[data-storefront]');
  if (sf) {
    const one = (q) => document.querySelector(q);
    let slug = '';
    try { slug = decodeURIComponent(location.pathname.replace(/^\/s\/?/, '').split('/')[0] || new URLSearchParams(location.search).get('store') || '').trim().toLowerCase(); } catch (e) { slug = ''; }
    const state = one('[data-sf-state]');
    const fail = (title, text) => {
      state.textContent = '';
      const h = document.createElement('h1'); h.textContent = title;
      const t = document.createElement('p'); t.textContent = text;
      state.append(h, t);
      state.hidden = false;
      one('[data-sf-body]').hidden = true;
    };
    const money = (n) => `${ar(Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','))} د.ع`.replace(/,/g, '٬');
    const waDigits = (p) => String(p || '').replace(/[^\d]/g, '').replace(/^0(?=7\d{9}$)/, '964');
    const headers = () => ({ apikey: sb.anonKey, Authorization: `Bearer ${sb.anonKey}`, 'x-store': slug, 'Content-Type': 'application/json' });
    const get = (path) => fetch(`${sb.url}/rest/v1/${path}`, { headers: headers() }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    const rpc = (fn, body) => fetch(`${sb.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(body || {}) })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    if (!slug || !/^[a-z0-9-]{3,40}$/.test(slug)) fail('رابط غير صحيح', 'تأكد من رابط المتجر الذي وصلك.');
    else if (!hasSb) fail('المتجر غير متاح الآن', 'حاول بعد قليل.');
    else {
      let store = null; let phone = ''; let cat = ''; let q = ''; let off = 0; const LIM = 24; let seq = 0;
      const grid = one('[data-sf-grid]');
      const dlg = one('[data-sf-dlg]');
      const openProduct = (key) => {
        rpc('store_product', { slug_or_id: key }).then((d) => {
          const p = d && d.product;
          if (!p) return;
          const vs = (d.variants || []).filter((v) => v.price != null);
          one('[data-sf-dname]').textContent = p.name;
          one('[data-sf-dcrumb]').textContent = [d.brand && d.brand.name, d.category && d.category.name].filter(Boolean).join(' · ');
          one('[data-sf-ddesc]').textContent = (p.description || '').trim();
          const sel = one('[data-sf-dvar]');
          sel.textContent = '';
          vs.forEach((v, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = v.title && v.title !== 'افتراضي' ? v.title : p.name; sel.append(o); });
          one('[data-sf-dvar-wrap]').hidden = vs.length < 2;
          const show = () => {
            const v = vs[Number(sel.value) || 0];
            const price = one('[data-sf-dprice]');
            price.textContent = v ? money(v.price) : '';
            if (v && Number(v.compare_at_price) > Number(v.price)) { const was = document.createElement('s'); was.textContent = money(v.compare_at_price); price.append(was); }
            const qty = v ? Number(v.available_qty || 0) : 0;
            const st = one('[data-sf-dstock]');
            st.textContent = qty > 0 ? (qty <= 3 ? `متوفر · بقي ${ar(qty)} فقط` : 'متوفر') : 'غير متوفر حالياً — اسأل المتجر عن موعد توفره';
            st.classList.toggle('out', qty <= 0);
            const label = v && v.title && v.title !== 'افتراضي' ? `${p.name} (${v.title})` : p.name;
            const text = `مرحباً ${store.name}، أريد طلب: ${label}${v ? ` — السعر ${money(v.price)}` : ''}\n${location.origin}/s/${slug}`;
            const order = one('[data-sf-order]');
            order.hidden = !phone;
            if (phone) order.href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
            const key2 = (v && v.image_key) || p.cover_key || (d.images && d.images[0] && d.images[0].key);
            const img = one('[data-sf-dimg]');
            const src = mediaSrc(key2, 'lg');
            img.hidden = !src;
            img.closest('figure').hidden = !src;
            if (src) { img.alt = p.name; img.src = src; }
          };
          sel.onchange = show;
          show();
          if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
        }).catch(() => {});
      };
      const card = (p) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sf-card';
        const ph = document.createElement('div'); ph.className = 'sf-ph';
        const src = mediaSrc(p.cover_key, 'md');
        if (src) { const im = document.createElement('img'); im.loading = 'lazy'; im.alt = p.name; im.src = src; ph.append(im); } else { const sp = document.createElement('span'); sp.textContent = (p.name || '؟').slice(0, 1); ph.append(sp); }
        const bd = document.createElement('div'); bd.className = 'sf-bd';
        if (p.brand_name) { const br = document.createElement('span'); br.className = 'sf-br'; br.textContent = p.brand_name; bd.append(br); }
        const nm = document.createElement('span'); nm.className = 'sf-nm'; nm.textContent = p.name; bd.append(nm);
        const pr = document.createElement('span'); pr.className = 'sf-pr';
        const pb = document.createElement('b'); pb.textContent = (Number(p.price_max) > Number(p.price_min) ? 'من ' : '') + money(p.price_min); pr.append(pb);
        if (p.compare_at_price) { const was = document.createElement('s'); was.textContent = money(p.compare_at_price); pr.append(was); }
        bd.append(pr);
        const st = document.createElement('span'); st.className = `sf-st${p.in_stock ? '' : ' out'}`; st.textContent = p.in_stock ? 'متوفر' : 'غير متوفر حالياً'; bd.append(st);
        b.append(ph, bd);
        b.addEventListener('click', () => openProduct(p.slug || p.id));
        return b;
      };
      const countText = (n) => (n === 1 ? 'منتج واحد' : n === 2 ? 'منتجان' : n <= 10 ? `${ar(n)} منتجات` : `${ar(n)} منتجاً`);
      const load = (reset) => {
        const my = ++seq;
        if (reset) { off = 0; grid.textContent = ''; }
        rpc('store_search', { q: q || null, category: cat || null, lim: LIM, off, sort: q ? 'relevance' : 'newest' }).then((r) => {
          if (my !== seq) return;
          const items = (r && r.items) || [];
          items.forEach((p) => grid.append(card(p)));
          off += items.length;
          const total = Number(r && r.total) || 0;
          one('[data-sf-count]').textContent = total ? countText(total) : (q || cat ? 'لا نتائج — جرّب كلمة أخرى أو قسماً آخر.' : 'لم يضف المتجر منتجات بعد.');
          one('[data-sf-more]').hidden = off >= total;
        }).catch(() => { if (my === seq) one('[data-sf-count]').textContent = 'تعذّر تحميل المنتجات، أعد المحاولة.'; });
      };
      one('[data-sf-close]').addEventListener('click', () => dlg.close());
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      one('[data-sf-more]').addEventListener('click', () => load(false));
      let tq = 0;
      one('[data-sf-q]').addEventListener('input', (e) => { clearTimeout(tq); tq = setTimeout(() => { q = e.target.value.trim(); load(true); }, 300); });

      Promise.all([rpc('current_store').catch(() => null), get('app_settings?key=eq.store&select=value').catch(() => [])]).then(([st, rows]) => {
        if (!st || st.slug !== slug) { fail('المتجر غير موجود', 'هذا الرابط غير مفعّل أو المتجر متوقف حالياً.'); return; }
        store = st;
        const cfgStore = (rows && rows[0] && rows[0].value) || {};
        phone = waDigits(cfgStore.whatsapp || cfgStore.phone || st.phone);
        document.title = `${st.name} — متجر على رقيم`;
        one('[data-sf-name]').textContent = st.name;
        one('[data-sf-meta]').textContent = [cfgStore.city || cfgStore.address, cfgStore.hours].filter(Boolean).join(' · ');
        const logo = mediaSrc(st.logo_key || cfgStore.logo_key, 'sm');
        if (logo) { const im = one('[data-sf-logo]'); im.src = logo; im.alt = st.name; im.hidden = false; } else one('[data-sf-initial]').textContent = st.name.slice(0, 1);
        if (phone) { const wa = one('[data-sf-wa]'); wa.href = `https://wa.me/${phone}`; wa.hidden = false; }
        state.hidden = true;
        one('[data-sf-body]').hidden = false;
        get('categories?select=id,name,parent_id&is_visible=eq.true&parent_id=is.null&order=sort.asc').then((cats) => {
          const box = one('[data-sf-cats]');
          const btn = (id, name) => {
            const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = name;
            b.setAttribute('aria-selected', String(cat === id));
            b.addEventListener('click', () => { cat = id; $$('button', box).forEach((x) => x.setAttribute('aria-selected', String(x === b))); load(true); });
            return b;
          };
          if (Array.isArray(cats) && cats.length) { box.append(btn('', 'الكل')); cats.forEach((c) => box.append(btn(c.id, c.name))); }
        }).catch(() => {});
        load(true);
      });
    }
  }

  // ------------------------------------------------------------ فهرس الصفحات القانونية: القسم الحالي
  const toc = $$('.toc nav a');
  if (toc.length) {
    const byId = new Map(toc.map((a) => [a.getAttribute('href').slice(1), a]));
    const mark = () => {
      const heads = $$('.doc h2[id]');
      // آخر عنوان مرّ أعلى الشاشة هو القسم الحالي
      let cur = heads[0];
      for (const h of heads) if (h.getBoundingClientRect().top < innerHeight * 0.35) cur = h;
      toc.forEach((a) => a.removeAttribute('aria-current'));
      byId.get(cur?.id)?.setAttribute('aria-current', 'true');
    };
    let raf = 0;
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; mark(); }); }, { passive: true });
    mark();
  }

})();
