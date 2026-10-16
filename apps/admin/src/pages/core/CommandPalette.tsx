import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchScore, normalizeIraqiPhone, formatPhone, type IconName } from '@raqeem/shared';
import type { AppRoute } from '../../routes/types';
import { Icon, Modal, Thumb } from '../../ui';
import { useDebounced } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { IS_DEMO } from '../../lib/env';
import { demoDb } from '../../lib/demo-db';
import { supabase } from '../../lib/supabase';

interface Hit { key: string; icon: IconName; title: string; sub?: string; to: string; image?: string | null }

/**
 * البحث الشامل (Ctrl+K): الصفحات، المنتجات (بالاسم أو SKU أو الباركود)، الزبائن (بالاسم أو الهاتف)، الطلبات والفواتير (بالرقم).
 */
export default function CommandPalette({ open, onClose, routes }: { open: boolean; onClose: () => void; routes: AppRoute[] }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const dq = useDebounced(q, 160);

  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);

  const pageHits = useMemo<Hit[]>(() => {
    const pages = routes.filter((r) => r.nav !== false);
    if (!q.trim()) return pages.slice(0, 8).map((r) => ({ key: r.path, icon: r.icon, title: r.label, to: r.path }));
    return pages.map((r) => ({ r, s: matchScore(q, r.label) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5)
      .map(({ r }) => ({ key: r.path, icon: r.icon, title: r.label, sub: 'صفحة', to: r.path }));
  }, [q, routes]);

  useEffect(() => {
    const term = dq.trim();
    if (!open || term.length < 2) { setHits([]); return; }
    let alive = true;
    (async () => {
      const out: Hit[] = [];
      const phone = normalizeIraqiPhone(term);
      if (IS_DEMO || !supabase) {
        if (can('products.view')) {
          for (const v of demoDb.product_variants) {
            const p = demoDb.products.find((x) => x.id === v.product_id);
            if (p && matchScore(term, `${p.name} ${v.title}`, [v.sku, v.barcode ?? '']) > 0) out.push({ key: v.id, icon: 'box', title: p.name, sub: `${v.title === 'افتراضي' ? '' : `${v.title} · `}${v.sku}`, to: `/products/${p.id}`, image: p.cover_key });
          }
        }
        if (can('customers.view')) for (const c of demoDb.customers) if (matchScore(term, c.name) > 0 || (phone && c.phone === phone)) out.push({ key: c.id, icon: 'user', title: c.name, sub: formatPhone(c.phone), to: `/customers/${c.id}` });
        if (can('orders.view')) for (const o of demoDb.orders) if (o.number.toLowerCase().includes(term.toLowerCase())) out.push({ key: o.id, icon: 'bag', title: `طلب ${o.number}`, to: `/orders/${o.id}` });
      } else {
        const like = `%${term.replace(/[%_]/g, '')}%`;
        const tasks: Promise<void>[] = [];
        if (can('products.view')) tasks.push((async () => {
          const { data } = await supabase!.from('product_variants').select('id,sku,title,product_id,products!inner(name,cover_key)').or(`sku.ilike.${like},barcode.eq.${term}`).limit(5);
          const { data: byName } = await supabase!.from('products').select('id,name,cover_key').ilike('search_text', `%${term}%`).is('archived_at', null).limit(6);
          for (const v of (data ?? []) as unknown as { id: string; sku: string; title: string; product_id: string; products: { name: string; cover_key: string | null } }[]) out.push({ key: v.id, icon: 'box', title: v.products.name, sub: v.sku, to: `/products/${v.product_id}`, image: v.products.cover_key });
          for (const p of byName ?? []) if (!out.some((h) => h.to === `/products/${p.id}`)) out.push({ key: p.id, icon: 'box', title: p.name, to: `/products/${p.id}`, image: p.cover_key });
        })());
        if (can('customers.view')) tasks.push((async () => {
          const query = supabase!.from('customers').select('id,name,phone').limit(5);
          const { data } = phone ? await query.eq('phone', phone) : await query.ilike('name', like);
          for (const c of data ?? []) out.push({ key: c.id, icon: 'user', title: c.name, sub: formatPhone(c.phone), to: `/customers/${c.id}` });
        })());
        if (can('orders.view')) tasks.push((async () => {
          const { data } = await supabase!.from('orders').select('id,number').ilike('number', like).limit(4);
          for (const o of data ?? []) out.push({ key: o.id, icon: 'bag', title: `طلب ${o.number}`, to: `/orders/${o.id}` });
        })());
        if (can('invoices.view')) tasks.push((async () => {
          const { data } = await supabase!.from('invoices').select('id,number').ilike('number', like).limit(4);
          for (const i of data ?? []) out.push({ key: i.id, icon: 'receipt', title: `فاتورة ${i.number}`, to: `/invoices/${i.id}` });
        })());
        await Promise.allSettled(tasks);
      }
      if (alive) { setHits(out.slice(0, 12)); setActive(0); }
    })();
    return () => { alive = false; };
  }, [dq, open, can]);

  const all = [...pageHits, ...hits];
  const go = (h: Hit) => { onClose(); navigate(h.to); };

  return (
    <Modal open={open} onClose={onClose} width={620}>
      <div className="input-wrap">
        <Icon name="search" size={20} />
        <input
          className="input lg" autoFocus value={q} placeholder="ابحث: اسم منتج، SKU، باركود، زبون، هاتف، رقم طلب…" aria-label="بحث شامل"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, all.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && all[active]) go(all[active]);
          }}
        />
      </div>
      <div className="cmdk-results" role="listbox">
        {all.length === 0 ? <p className="dim small" style={{ padding: 12 }}>{q.trim().length < 2 ? 'اكتب حرفين على الأقل' : 'لا نتائج'}</p> : null}
        {all.map((h, i) => (
          <div key={`${h.key}-${i}`} role="option" aria-selected={i === active} className={`cmdk-item ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
            {h.icon === 'box' ? <Thumb imageKey={h.image} size="sm" /> : <span className="thumb sm"><Icon name={h.icon} size={16} /></span>}
            <div className="grow"><div className="truncate" style={{ fontWeight: 700 }}>{h.title}</div>{h.sub ? <div className="small faint truncate code" style={{ direction: 'ltr', textAlign: 'right' }}>{h.sub}</div> : null}</div>
            <Icon name="chevronLeft" size={16} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
