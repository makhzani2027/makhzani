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
  menuBtn?.addEventListener('click', () => setMenu(!hdr.classList.contains('is-open')));
  $$('#nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && hdr?.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });

  // ------------------------------------------------------------ الظهور عند التمرير + العدّ
  const countUp = (el) => {
    const end = Number(el.dataset.count);
    if (!end || reduce) return;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 1100);
      el.textContent = ar(Math.round(end * (1 - Math.pow(1 - p, 3))));
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
  const prettyPhone = (p) => {
    const d = digits(p).replace(/^\+/, '');
    // +964 7XX XXX XXXX
    return /^9647\d{9}$/.test(d) ? `+964 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : p;
  };
  const links = {
    whatsapp: (c) => c.whatsapp && `https://wa.me/${digits(c.whatsapp).replace(/^\+/, '')}`,
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
    $$('[data-stat]').forEach((el) => {
      const v = get(c, `stats.${el.dataset.stat}`);
      if (v == null) return;
      if (el.dataset.count) el.dataset.count = v;
      el.textContent = ar(v);
    });
    if (c.online_payment) $$('[data-online-soon]').forEach((el) => el.remove());
    if (c.play_store_url) {
      $$('[data-play]').forEach((el) => { el.href = c.play_store_url; el.removeAttribute('aria-disabled'); el.rel = 'noopener'; });
      $$('[data-play-meta]').forEach((el) => { el.textContent = 'حمّله من المتجر'; });
    }
    document.body.classList.toggle('is-draft', !!c.legal_review_pending);
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
  cfgP.then((cfg) => {
    apply(cfg);
    // بيانات حية من Supabase (إن حُقنت عند البناء). أي خطأ يُتجاهل بصمت ويبقى ما في config.json
    const sb = window.RAQEEM_SUPABASE;
    if (!sb || !sb.url || !sb.anonKey) return;
    const api = (path, extra = {}) => fetch(`${sb.url}/rest/v1/${path}`, {
      headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.anonKey}`, ...extra },
    });
    api('app_settings?key=eq.store&select=value')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const live = rows?.[0]?.value;
        if (!live) return;
        const merged = { ...cfg, socials: { ...cfg.socials } };
        for (const [k, v] of Object.entries(live)) {
          if (k === 'socials' && v) Object.entries(v).forEach(([s, u]) => { if (u) merged.socials[s] = u; });
          else if (v != null && v !== '') merged[k] = v;
        }
        apply(merged);
      })
      .catch(() => {});
    if (document.querySelector('[data-cats]')) {
      api('categories?select=name,slug,icon,description&is_visible=eq.true&parent_id=is.null&order=sort.asc')
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => Array.isArray(rows) && renderCats(rows))
        .catch(() => {});
      api('products?select=id&is_published=eq.true', { Prefer: 'count=exact', Range: '0-0' })
        .then((r) => {
          const n = Number((r.headers.get('content-range') || '').split('/')[1]);
          // نعرض العدد الحقيقي فقط إن كان معبّراً
          if (n >= 50) $$('[data-stat="products"]').forEach((el) => { el.dataset.count = n; el.textContent = ar(n); });
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

  $$('[data-year]').forEach((el) => { el.textContent = ar(new Date().getFullYear()); });
})();
