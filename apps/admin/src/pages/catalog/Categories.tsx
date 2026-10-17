import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Brand, Category, IconName } from '@raqeem/shared';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, Select, Skeleton, Switch, Tabs, Textarea, askConfirm, toast } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { imgUrl, uploadImage } from '../../lib/media';
import { errorMessage } from '../../lib/supabase';
import { catalogCounts, deleteBrand, deleteCategory, reorderBrands, reorderCategories, saveBrand, saveCategory, type CategoryDraft } from './api';
import { useCatalogMeta } from './components/hooks';
import './catalog.css';

const CAT_ICONS: IconName[] = ['box', 'boxes', 'package', 'tag', 'tags', 'gift', 'heart', 'star', 'store', 'bag', 'cart', 'phone', 'camera', 'image', 'zap', 'home', 'truck', 'scale', 'clock', 'calendar', 'globe', 'sun', 'moon', 'shield', 'key', 'card', 'wallet', 'chartBar', 'layers', 'shelf', 'user', 'users', 'percent', 'ticket', 'file', 'note', 'settings'];

export default function Categories() {
  const [tab, setTab] = useState<'cats' | 'brands'>('cats');
  const meta = useCatalogMeta();
  const counts = useLoad(catalogCounts, []);
  return (
    <>
      <PageHeader title="الأقسام والعلامات" description="ترتيب الأقسام هنا هو ترتيبها في التطبيق ونقطة البيع." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'cats', label: 'الأقسام', count: meta.categories.length }, { value: 'brands', label: 'العلامات التجارية', count: meta.brands.length }]} />
      <div style={{ marginTop: 16 }}>
        {meta.error ? <ErrorState message={meta.error} onRetry={meta.reload} />
          : tab === 'cats' ? <CategoryTree cats={meta.categories} loading={meta.loading} counts={counts.data?.byCategory ?? {}} reload={() => { void meta.reloadCategories(); void counts.reload(); }} />
          : <BrandList brands={meta.brands} loading={meta.loading} counts={counts.data?.byBrand ?? {}} reload={() => { void meta.reloadBrands(); void counts.reload(); }} />}
      </div>
    </>
  );
}

function CategoryTree({ cats, loading, counts, reload }: { cats: Category[]; loading: boolean; counts: Record<string, number>; reload: () => void }) {
  const fmt = useFmt();
  const { can } = useAuth();
  const write = can('products.write');
  const [edit, setEdit] = useState<CategoryDraft | null>(null);
  const roots = cats.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort);
  const kids = (id: string) => cats.filter((c) => c.parent_id === id).sort((a, b) => a.sort - b.sort);
  const move = async (c: Category, dir: -1 | 1) => {
    const sib = (c.parent_id ? kids(c.parent_id) : roots);
    const i = sib.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= sib.length) return;
    const arr = [...sib];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    try { await reorderCategories(arr.map((x, k) => ({ id: x.id, sort: k, parent_id: x.parent_id }))); reload(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const remove = async (c: Category) => {
    if (!(await askConfirm({ title: `حذف قسم «${c.name}»؟`, body: 'المنتجات فيه تبقى بلا قسم، والأقسام الفرعية تصير رئيسية.', danger: true, confirm: 'حذف القسم' }))) return;
    try { await deleteCategory(c.id); toast.success('حُذف القسم'); reload(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const row = (c: Category, child: boolean, idx: number, len: number) => (
    <div key={c.id} className={`tree-row ${child ? 'child' : ''} ${c.is_visible ? '' : 'hidden-cat'}`}>
      <span className="logo-box" style={{ width: 36, height: 36 }}>{c.image_key ? <img src={imgUrl(c.image_key, 'sm') ?? ''} alt="" /> : <Icon name={(c.icon as IconName) || 'tag'} size={18} />}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <span className="name">{c.name}</span>{!c.is_visible ? <> <Badge tone="neutral">مخفي في المتجر</Badge></> : null}
        <div className="small faint"><Link to={`/products?cat=${c.id}`}>{fmt.count(counts[c.id] ?? 0, { one: 'منتج واحد', two: 'منتجان', few: 'منتجات', many: 'منتجاً', zero: 'لا منتجات' })}</Link></div>
      </div>
      {write ? (
        <span className="inline-btns">
          <IconButton size="sm" icon="arrowUp" label="أعلى" disabled={idx === 0} onClick={() => move(c, -1)} />
          <IconButton size="sm" icon="arrowDown" label="أسفل" disabled={idx === len - 1} onClick={() => move(c, 1)} />
          {!child ? <IconButton size="sm" icon="plus" label="قسم فرعي" onClick={() => setEdit({ name: '', parent_id: c.id, description: null, image_key: null, icon: null, is_visible: true })} /> : null}
          <IconButton size="sm" icon="edit" label="تعديل" onClick={() => setEdit({ ...c })} />
          <IconButton size="sm" icon="trash" label="حذف" onClick={() => remove(c)} />
        </span>
      ) : null}
    </div>
  );
  return (
    <Card flush title="شجرة الأقسام" actions={write ? <Button size="sm" variant="primary" icon="plus" onClick={() => setEdit({ name: '', parent_id: null, description: null, image_key: null, icon: 'tag', is_visible: true })}>قسم جديد</Button> : null}>
      {loading && !cats.length ? <div style={{ padding: 16 }}><Skeleton h={180} /></div> : !cats.length ? (
        <EmptyState icon="tags" title="لا أقسام بعد" text="الأقسام ترتب المنتجات في التطبيق وفي نقطة البيع." action={write ? <Button variant="primary" onClick={() => setEdit({ name: '', parent_id: null, description: null, image_key: null, icon: 'tag', is_visible: true })}>أضف أول قسم</Button> : undefined} />
      ) : (
        <div className="tree">{roots.map((r, i) => [row(r, false, i, roots.length), ...kids(r.id).map((k, j, a) => row(k, true, j, a.length))])}</div>
      )}
      {edit ? <CategoryModal draft={edit} cats={cats} onClose={() => setEdit(null)} onSaved={reload} /> : null}
    </Card>
  );
}

function CategoryModal({ draft, cats, onClose, onSaved }: { draft: CategoryDraft; cats: Category[]; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState<CategoryDraft>(draft);
  const [tried, setTried] = useState(false);
  const [up, setUp] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = useAction(saveCategory, { success: draft.id ? 'حُفظ القسم' : 'أُضيف القسم' });
  const submit = async () => {
    setTried(true);
    if (!c.name.trim()) return;
    if ((await save.run({ ...c, name: c.name.trim() })) !== undefined) { onSaved(); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title={draft.id ? 'تعديل القسم' : 'قسم جديد'} width={560}
      footer={<><Button variant="primary" loading={save.busy} onClick={submit}>{draft.id ? 'حفظ القسم' : 'إضافة القسم'}</Button><Button onClick={onClose}>إلغاء</Button></>}>
      <Field label="الاسم" required error={tried && !c.name.trim() ? 'اسم القسم إلزامي' : null}><Input value={c.name} autoFocus onChange={(e) => setC({ ...c, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
      <Field label="القسم الأب">
        <Select value={c.parent_id ?? ''} onChange={(e) => setC({ ...c, parent_id: e.target.value || null })} placeholder="قسم رئيسي" options={cats.filter((x) => !x.parent_id && x.id !== draft.id).map((x) => ({ value: x.id, label: x.name }))} />
      </Field>
      <Field label="الأيقونة">
        <div className="icon-grid">{CAT_ICONS.map((n) => <button key={n} type="button" className={c.icon === n ? 'on' : ''} aria-label={n} onClick={() => setC({ ...c, icon: n })}><Icon name={n} size={20} /></button>)}</div>
      </Field>
      <Field label="صورة (اختيارية)" hint="تظهر بدل الأيقونة في التطبيق">
        <div className="row" style={{ gap: 10 }}>
          <span className="logo-box">{c.image_key ? <img src={imgUrl(c.image_key, 'sm') ?? ''} alt="" /> : <Icon name="image" size={18} />}</span>
          <Button size="sm" icon="upload" loading={up} onClick={() => file.current?.click()}>رفع صورة</Button>
          {c.image_key ? <Button size="sm" variant="ghost" onClick={() => setC({ ...c, image_key: null })}>إزالة</Button> : null}
          <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            setUp(true);
            try { setC({ ...c, image_key: await uploadImage(f, 'categories', draft.id ?? 'new') }); } catch (er) { toast.error(errorMessage(er)); } finally { setUp(false); }
          }} />
        </div>
      </Field>
      <Field label="وصف قصير"><Textarea rows={2} value={c.description ?? ''} onChange={(e) => setC({ ...c, description: e.target.value || null })} /></Field>
      <Switch label="ظاهر في المتجر" checked={c.is_visible} onChange={(v) => setC({ ...c, is_visible: v })} />
    </Modal>
  );
}

function BrandList({ brands, loading, counts, reload }: { brands: Brand[]; loading: boolean; counts: Record<string, number>; reload: () => void }) {
  const fmt = useFmt();
  const { can } = useAuth();
  const write = can('products.write');
  const [edit, setEdit] = useState<{ id?: string; name: string; logo_key: string | null } | null>(null);
  const [up, setUp] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = useAction(saveBrand, { success: 'حُفظت العلامة' });
  const sorted = [...brands].sort((a, b) => a.sort - b.sort);
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= sorted.length) return;
    const arr = [...sorted]; [arr[i], arr[j]] = [arr[j], arr[i]];
    try { await reorderBrands(arr.map((b, k) => ({ id: b.id, sort: k }))); reload(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Card flush title="العلامات التجارية" actions={write ? <Button size="sm" variant="primary" icon="plus" onClick={() => setEdit({ name: '', logo_key: null })}>علامة جديدة</Button> : null}>
      {loading && !brands.length ? <div style={{ padding: 16 }}><Skeleton h={140} /></div> : !brands.length ? <EmptyState icon="star" title="لا علامات بعد" text="Samsung، Anker، JBL… تساعد الزبون على التصفية." /> : (
        <div className="tree">{sorted.map((b, i) => (
          <div key={b.id} className="tree-row">
            <span className="logo-box">{b.logo_key ? <img src={imgUrl(b.logo_key, 'sm') ?? ''} alt="" /> : b.name.slice(0, 2)}</span>
            <div className="grow"><span className="name">{b.name}</span><div className="small faint"><Link to={`/products?brand=${b.id}`}>{fmt.count(counts[b.id] ?? 0, { one: 'منتج واحد', two: 'منتجان', few: 'منتجات', many: 'منتجاً', zero: 'لا منتجات' })}</Link></div></div>
            {write ? <span className="inline-btns">
              <IconButton size="sm" icon="arrowUp" label="أعلى" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton size="sm" icon="arrowDown" label="أسفل" disabled={i === sorted.length - 1} onClick={() => move(i, 1)} />
              <IconButton size="sm" icon="edit" label="تعديل" onClick={() => setEdit({ id: b.id, name: b.name, logo_key: b.logo_key })} />
              <IconButton size="sm" icon="trash" label="حذف" onClick={async () => {
                if (!(await askConfirm({ title: `حذف «${b.name}»؟`, body: 'المنتجات تبقى بلا علامة.', danger: true, confirm: 'حذف' }))) return;
                try { await deleteBrand(b.id); reload(); } catch (e) { toast.error(errorMessage(e)); }
              }} />
            </span> : null}
          </div>
        ))}</div>
      )}
      {edit ? (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'تعديل العلامة' : 'علامة جديدة'} width={460}
          footer={<><Button variant="primary" loading={save.busy} disabled={!edit.name.trim()} onClick={async () => { if ((await save.run({ ...edit, name: edit.name.trim() })) !== undefined) { reload(); setEdit(null); } }}>حفظ العلامة</Button><Button onClick={() => setEdit(null)}>إلغاء</Button></>}>
          <Field label="الاسم" required><Input value={edit.name} autoFocus onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="الشعار">
            <div className="row" style={{ gap: 10 }}>
              <span className="logo-box">{edit.logo_key ? <img src={imgUrl(edit.logo_key, 'sm') ?? ''} alt="" /> : <Icon name="image" size={18} />}</span>
              <Button size="sm" icon="upload" loading={up} onClick={() => file.current?.click()}>رفع شعار</Button>
              <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                setUp(true);
                try { setEdit({ ...edit, logo_key: await uploadImage(f, 'brands', edit.id ?? 'new') }); } catch (er) { toast.error(errorMessage(er)); } finally { setUp(false); }
              }} />
            </div>
          </Field>
        </Modal>
      ) : null}
    </Card>
  );
}
