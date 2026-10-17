/** واجهة المتجر: البانرات (صورة أو نصية بألوان الهوية) وأقسام الرئيسية، مع ترتيب ومعاينة على شاشة هاتف */
import { useEffect, useState } from 'react';
import { BANNER_LINK_KIND, HOME_SECTION_KIND, type Banner, type BannerLinkKind, type BannerPlacement, type HomeSection, type HomeSectionKind } from '@raqeem/shared';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, NumberInput, PageHeader, Select, Skeleton, Switch, Thumb, askConfirm } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { imgUrl, uploadImage } from '../../lib/media';
import { listCategories } from '../sales/data/lookups';
import { banners, brandOptions, homeSections, productOptions, saveOrder } from './api';
import '../sales/sales.css';

const PLACEMENT: Record<BannerPlacement, string> = { home_hero: 'أعلى الرئيسية', home_strip: 'شريط وسط الرئيسية', category_top: 'أعلى صفحة القسم' };

export default function Storefront() {
  const { store } = useSettings();
  const fmt = useFmt();
  const bl = useLoad(banners.list, []);
  const sl = useLoad(homeSections.list, []);
  const [editB, setEditB] = useState<Banner | 'new' | null>(null);
  const [editS, setEditS] = useState<HomeSection | 'new' | null>(null);
  const move = async (kind: 'banners' | 'home_sections', list: { id: string }[], i: number, d: -1 | 1) => {
    const ids = list.map((x) => x.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await saveOrder(kind, ids);
    void (kind === 'banners' ? bl.reload() : sl.reload());
  };
  const toggle = async (kind: 'b' | 's', id: string, v: boolean) => { await (kind === 'b' ? banners.save({ is_active: v }, id) : homeSections.save({ is_active: v }, id)); void (kind === 'b' ? bl.reload() : sl.reload()); };
  const bs = [...(bl.data ?? [])].sort((a, b) => a.sort - b.sort);
  const ss = [...(sl.data ?? [])].sort((a, b) => a.sort - b.sort);
  return (
    <>
      <PageHeader title="واجهة المتجر" description="ما يراه الزبون أول ما يفتح التطبيق: البانرات ثم الأقسام بالترتيب." />
      <div className="sx-split">
        <div className="sx-stack">
          <Card title="البانرات" icon="banner" actions={<Button size="sm" variant="primary" icon="plus" onClick={() => setEditB('new')}>بانر جديد</Button>}>
            {bl.loading && !bl.data ? <Skeleton h={120} /> : !bs.length ? <EmptyState icon="banner" title="لا بانرات" text="بانر بصورة أو بانر نصي بألوان الهوية — لا تحتاج مصمماً." /> : (
              <div className="list">
                {bs.map((b, i) => (
                  <div key={b.id} className="list-item">
                    {b.image_key ? <Thumb imageKey={b.image_key} size="md" /> : <span className="thumb placeholder-art" style={{ background: b.placement === 'home_strip' ? 'var(--hero)' : 'var(--accent)' }} />}
                    <span className="grow" style={{ minWidth: 0 }}><b className="truncate" style={{ display: 'block' }}>{b.title ?? 'بانر بلا عنوان'}</b><span className="meta">{PLACEMENT[b.placement]} · {BANNER_LINK_KIND[b.link_kind].label}{b.ends_at ? ` · ينتهي ${new Date(b.ends_at).toLocaleDateString('ar-IQ')}` : ''}</span></span>
                    {!b.image_key ? <Badge plain>نصي</Badge> : null}
                    <Switch checked={b.is_active} onChange={(v) => void toggle('b', b.id, v)} label="" />
                    <IconButton icon="arrowUp" size="sm" label="أعلى" disabled={i === 0} onClick={() => void move('banners', bs, i, -1)} />
                    <IconButton icon="arrowDown" size="sm" label="أسفل" disabled={i === bs.length - 1} onClick={() => void move('banners', bs, i, 1)} />
                    <IconButton icon="edit" size="sm" label="تعديل" onClick={() => setEditB(b)} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="أقسام الرئيسية" icon="layout" actions={<Button size="sm" variant="primary" icon="plus" onClick={() => setEditS('new')}>قسم جديد</Button>}>
            {sl.loading && !sl.data ? <Skeleton h={120} /> : !ss.length ? <EmptyState icon="layout" title="لا أقسام" /> : (
              <div className="list">
                {ss.map((s, i) => (
                  <div key={s.id} className="list-item">
                    <span className="grow"><b>{s.title}</b><span className="meta"> · {HOME_SECTION_KIND[s.kind].label} · حتى {fmt.num(s.max_items)} منتج</span></span>
                    <Switch checked={s.is_active} onChange={(v) => void toggle('s', s.id, v)} label="" />
                    <IconButton icon="arrowUp" size="sm" label="أعلى" disabled={i === 0} onClick={() => void move('home_sections', ss, i, -1)} />
                    <IconButton icon="arrowDown" size="sm" label="أسفل" disabled={i === ss.length - 1} onClick={() => void move('home_sections', ss, i, 1)} />
                    <IconButton icon="edit" size="sm" label="تعديل" onClick={() => setEditS(s)} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="sx-stack">
          <h2 className="section-title">معاينة على الهاتف</h2>
          <div className="phone" aria-label="معاينة التطبيق">
            <div style={{ padding: '10px 14px', fontWeight: 900, fontFamily: 'Display, serif', fontSize: 18 }}>{store.name}</div>
            <div className="phone-body">
              {bs.filter((b) => b.is_active && b.placement === 'home_hero').map((b) => <BannerPreview key={b.id} b={b} />)}
              {ss.filter((s) => s.is_active).map((s, i) => (
                <div key={s.id} className="sec">
                  <h5>{s.title}</h5>
                  <div className="items">{Array.from({ length: 4 }, (_, k) => <span key={k} />)}</div>
                  {i === 0 ? bs.filter((b) => b.is_active && b.placement === 'home_strip').map((b) => <div key={b.id} style={{ marginTop: 10 }}><BannerPreview b={b} /></div>) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {editB ? <BannerModal b={editB === 'new' ? null : editB} onClose={() => setEditB(null)} onDone={() => { setEditB(null); void bl.reload(); }} nextSort={bs.length + 1} /> : null}
      {editS ? <SectionModal s={editS === 'new' ? null : editS} onClose={() => setEditS(null)} onDone={() => { setEditS(null); void sl.reload(); }} nextSort={ss.length + 1} /> : null}
    </>
  );
}

/** بانر نصي بلا صورة: كتلة الطين أعلى الرئيسية، وكتلة الحبر في الشريط الأوسط (نفس القاعدة في التطبيق) */
function BannerPreview({ b }: { b: Pick<Banner, 'title' | 'subtitle' | 'image_key' | 'placement'> }) {
  const ink = b.placement === 'home_strip';
  const sub = b.subtitle;
  const url = imgUrl(b.image_key, 'md');
  return (
    <div className={`bn ${ink ? 'ink' : ''}`} style={url ? { backgroundImage: `linear-gradient(transparent 40%, rgba(0,0,0,.55)), url(${url})`, color: '#fff' } : undefined}>
      {b.title ? <b>{b.title}</b> : null}
      {sub ? <span style={{ fontSize: 12.5 }}>{sub}</span> : null}
    </div>
  );
}

function BannerModal({ b, onClose, onDone, nextSort }: { b: Banner | null; onClose: () => void; onDone: () => void; nextSort: number }) {
  const [f, setF] = useState({ title: b?.title ?? '', subtitle: b?.subtitle ?? '', image_key: b?.image_key ?? null as string | null, link_kind: b?.link_kind ?? ('none' as BannerLinkKind), link_value: b?.link_value ?? '', placement: b?.placement ?? ('home_hero' as BannerPlacement), is_active: b?.is_active ?? true, ends_at: b?.ends_at?.slice(0, 10) ?? '' });
  const [busyUp, setBusyUp] = useState(false);
  const opts = useLinkOptions(f.link_kind);
  const save = useAction(() => banners.save({
    title: f.title || null, subtitle: f.subtitle || null, image_key: f.image_key, link_kind: f.link_kind, link_value: f.link_kind === 'none' ? null : f.link_value || null,
    placement: f.placement, is_active: f.is_active, ends_at: f.ends_at ? new Date(`${f.ends_at}T23:59:00`).toISOString() : null, ...(b ? {} : { sort: nextSort, starts_at: null }),
  }, b?.id), { success: 'حُفظ البانر' });
  const del = useAction(() => banners.remove(b!.id), { success: 'حُذف البانر' });
  return (
    <Modal open onClose={onClose} title={b ? 'تعديل البانر' : 'بانر جديد'} width={680}
      footer={<>
        {b ? <Button variant="danger" icon="trash" onClick={async () => { if (await askConfirm({ title: 'حذف البانر؟', danger: true, confirm: 'حذف' })) { await del.run(); onDone(); } }}>حذف</Button> : null}
        <span className="grow" />
        <Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} onClick={async () => { if (await save.run()) onDone(); }}>حفظ البانر</Button>
      </>}>
      <div className="grid-2">
        <div className="stack">
          <Field label="الصورة" hint="بلا صورة = بانر نصي بألوان الهوية">
            <div className="sx-row">
              <label className="btn"><input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusyUp(true); try { setF({ ...f, image_key: await uploadImage(file, 'banners', 'home') }); } finally { setBusyUp(false); } }} />{busyUp ? 'جارٍ الرفع…' : f.image_key ? 'تغيير الصورة' : 'رفع صورة'}</label>
              {f.image_key ? <Button variant="ghost" onClick={() => setF({ ...f, image_key: null })}>بانر نصي</Button> : null}
            </div>
          </Field>
          <Field label="العنوان"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="خصم ٢٠٪ على السماعات" /></Field>
          <Field label="الوصف"><Input value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} placeholder="حتى نهاية الشهر" /></Field>
          <Field label="المكان"><Select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value as BannerPlacement })} options={(Object.keys(PLACEMENT) as BannerPlacement[]).map((p) => ({ value: p, label: PLACEMENT[p] }))} /></Field>
          <div className="form-grid">
            <Field label="يفتح"><Select value={f.link_kind} onChange={(e) => setF({ ...f, link_kind: e.target.value as BannerLinkKind, link_value: '' })} options={(Object.keys(BANNER_LINK_KIND) as BannerLinkKind[]).map((k) => ({ value: k, label: BANNER_LINK_KIND[k].label }))} /></Field>
            {f.link_kind === 'none' ? null : opts ? <Field label="الوجهة"><Select value={f.link_value} onChange={(e) => setF({ ...f, link_value: e.target.value })} placeholder="اختر" options={opts} /></Field>
              : <Field label={f.link_kind === 'url' ? 'الرابط' : 'كلمة البحث'}><Input dir={f.link_kind === 'url' ? 'ltr' : undefined} value={f.link_value} onChange={(e) => setF({ ...f, link_value: e.target.value })} /></Field>}
          </div>
          <Field label="ينتهي في (اختياري)"><Input type="date" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></Field>
          <Switch label="ظاهر في التطبيق" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
        </div>
        <div><span className="section-title">المعاينة</span><BannerPreview b={{ title: f.title, subtitle: f.subtitle, image_key: f.image_key, placement: f.placement }} /></div>
      </div>
    </Modal>
  );
}

function useLinkOptions(kind: BannerLinkKind | HomeSectionKind) {
  const [opts, setOpts] = useState<{ value: string; label: string }[] | null>(null);
  useEffect(() => {
    setOpts(null);
    if (kind === 'category') void listCategories().then((c) => setOpts(c.map((x) => ({ value: x.id, label: x.name }))));
    else if (kind === 'brand') void brandOptions().then((b) => setOpts(b.map((x) => ({ value: x.id, label: x.name }))));
    else if (kind === 'product') void productOptions().then((p) => setOpts(p.map((x) => ({ value: x.id, label: x.name }))));
  }, [kind]);
  return opts;
}

function SectionModal({ s, onClose, onDone, nextSort }: { s: HomeSection | null; onClose: () => void; onDone: () => void; nextSort: number }) {
  const [f, setF] = useState({ title: s?.title ?? '', kind: s?.kind ?? ('featured' as HomeSectionKind), category_id: s?.category_id ?? '', brand_id: s?.brand_id ?? '', product_ids: s?.product_ids ?? [], max_items: s?.max_items ?? 10, is_active: s?.is_active ?? true });
  const opts = useLinkOptions(f.kind === 'manual' ? 'product' : f.kind);
  const save = useAction(() => homeSections.save({ title: f.title.trim() || HOME_SECTION_KIND[f.kind].label, kind: f.kind, category_id: f.kind === 'category' ? f.category_id || null : null, brand_id: f.kind === 'brand' ? f.brand_id || null : null, product_ids: f.kind === 'manual' ? f.product_ids : [], max_items: f.max_items, is_active: f.is_active, ...(s ? {} : { sort: nextSort }) }, s?.id), { success: 'حُفظ القسم' });
  const del = useAction(() => homeSections.remove(s!.id), { success: 'حُذف القسم' });
  return (
    <Modal open onClose={onClose} title={s ? 'تعديل القسم' : 'قسم جديد في الرئيسية'} width={520}
      footer={<>{s ? <Button variant="danger" icon="trash" onClick={async () => { if (await askConfirm({ title: 'حذف القسم؟', danger: true, confirm: 'حذف' })) { await del.run(); onDone(); } }}>حذف</Button> : null}<span className="grow" /><Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} onClick={async () => { if (await save.run()) onDone(); }}>حفظ القسم</Button></>}>
      <div className="stack">
        <Field label="النوع"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as HomeSectionKind })} options={(Object.keys(HOME_SECTION_KIND) as HomeSectionKind[]).map((k) => ({ value: k, label: HOME_SECTION_KIND[k].label }))} /></Field>
        <Field label="العنوان"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={HOME_SECTION_KIND[f.kind].label} /></Field>
        {f.kind === 'category' && opts ? <Field label="القسم"><Select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} placeholder="اختر" options={opts} /></Field> : null}
        {f.kind === 'brand' && opts ? <Field label="العلامة"><Select value={f.brand_id} onChange={(e) => setF({ ...f, brand_id: e.target.value })} placeholder="اختر" options={opts} /></Field> : null}
        {f.kind === 'manual' && opts ? (
          <Field label={`المنتجات (${f.product_ids.length})`}>
            <Select value="" onChange={(e) => e.target.value && !f.product_ids.includes(e.target.value) && setF({ ...f, product_ids: [...f.product_ids, e.target.value] })} placeholder="أضف منتجاً" options={opts.filter((o) => !f.product_ids.includes(o.value))} />
            <div className="sx-row" style={{ marginTop: 6 }}>{f.product_ids.map((id) => <Badge key={id}>{opts.find((o) => o.value === id)?.label ?? 'منتج'} <button type="button" className="sx-link" onClick={() => setF({ ...f, product_ids: f.product_ids.filter((x) => x !== id) })} aria-label="إزالة">×</button></Badge>)}</div>
          </Field>
        ) : null}
        <Field label="أقصى عدد للمنتجات"><NumberInput value={f.max_items} onChange={(v) => setF({ ...f, max_items: Math.max(2, Math.min(30, v ?? 10)) })} /></Field>
        <Switch label="ظاهر في التطبيق" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
      </div>
    </Modal>
  );
}
