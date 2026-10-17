/**
 * بيانات المتجر: البانرات وأقسام الرئيسية، الكوبونات، مناطق التوصيل، الإشعارات (حملات + send_campaign)، التقييمات.
 * الجداول: banners, home_sections, coupons, delivery_zones, notification_campaigns, reviews (أسماء العقد حرفياً).
 */
import type { Banner, Coupon, DeliveryZone, HomeSection, NotificationCampaign, Review } from '@raqeem/shared';
import { IS_DEMO } from '../../lib/env';
import { demoChanged, demoDb, demoDelay, demoId } from '../../lib/demo-db';
import { AppError, rpc, sb } from '../../lib/supabase';
import { demoAudit, ledger } from '../sales/data/ledger';

const nowIso = () => new Date().toISOString();

type Row = { id: string };
/** قراءة/حفظ/حذف عامة على جدول (العرض: مصفوفة في الذاكرة) */
function table<T extends Row>(name: string, demo: () => T[], order: { col: string; asc: boolean }) {
  return {
    async list(): Promise<T[]> {
      if (IS_DEMO) { await demoDelay(); return [...demo()]; }
      const { data, error } = await sb().from(name).select('*').order(order.col, { ascending: order.asc }).limit(1000);
      if (error) throw error;
      return data as T[];
    },
    async save(input: Partial<T>, id?: string): Promise<T> {
      if (IS_DEMO) {
        await demoDelay();
        const arr = demo();
        let row = id ? arr.find((x) => x.id === id) : undefined;
        if (row) Object.assign(row, input);
        else { row = { id: demoId(), created_at: nowIso(), ...input } as unknown as T; arr.push(row); }
        demoAudit(id ? 'update' : 'insert', name, row.id, input as Record<string, unknown>);
        demoChanged();
        return row;
      }
      const body = input as Record<string, unknown>;
      const q = id ? sb().from(name).update(body).eq('id', id) : sb().from(name).insert(body);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data as T;
    },
    async remove(id: string): Promise<void> {
      if (IS_DEMO) {
        await demoDelay();
        const arr = demo();
        const i = arr.findIndex((x) => x.id === id);
        if (i >= 0) arr.splice(i, 1);
        demoAudit('delete', name, id, {});
        demoChanged();
        return;
      }
      const { error } = await sb().from(name).delete().eq('id', id);
      if (error) throw error;
    },
  };
}

export const banners = table<Banner>('banners', () => demoDb.banners, { col: 'sort', asc: true });
export const homeSections = table<HomeSection>('home_sections', () => demoDb.home_sections, { col: 'sort', asc: true });
export const coupons = table<Coupon>('coupons', () => demoDb.coupons, { col: 'created_at', asc: false });
export const zones = table<DeliveryZone>('delivery_zones', () => demoDb.delivery_zones, { col: 'sort', asc: true });
export const campaigns = table<NotificationCampaign>('notification_campaigns', () => ledger.campaigns, { col: 'created_at', asc: false });

/** حفظ ترتيب مجموعة (سحب أو أسهم) */
export async function saveOrder(kind: 'banners' | 'home_sections', ids: string[]): Promise<void> {
  if (IS_DEMO) {
    const arr = kind === 'banners' ? demoDb.banners : demoDb.home_sections;
    ids.forEach((id, i) => { const r = arr.find((x) => x.id === id); if (r) r.sort = i + 1; });
    demoChanged();
    return;
  }
  await Promise.all(ids.map((id, i) => sb().from(kind).update({ sort: i + 1 }).eq('id', id)));
}

export async function saveCoupon(input: Partial<Coupon>, id?: string): Promise<Coupon> {
  const code = (input.code ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) throw new AppError('رمز الكوبون من ٣ إلى ٢٤ حرفاً إنكليزياً أو رقماً.');
  if (IS_DEMO && demoDb.coupons.some((c) => c.code === code && c.id !== id)) throw new AppError('هذا الرمز مستخدم لكوبون آخر.');
  if (input.kind === 'percent' && ((input.value ?? 0) <= 0 || (input.value ?? 0) > 100)) throw new AppError('النسبة بين ١ و١٠٠.');
  return coupons.save({ ...input, code }, id);
}

export async function sendCampaign(id: string): Promise<{ recipients: number }> {
  if (!IS_DEMO) return rpc<NotificationCampaign & { recipients: number }>('send_campaign', { id });
  await demoDelay(400);
  const c = ledger.campaigns.find((x) => x.id === id);
  if (!c) throw new AppError('الحملة غير موجودة.');
  if (c.sent_at) throw new AppError('أُرسلت الحملة سابقاً.');
  c.sent_at = nowIso();
  const recipients = demoDb.customers.filter((x) => x.profile_id).length;
  demoAudit('send', 'notification_campaigns', id, { title: c.title, recipients });
  demoChanged();
  return { recipients };
}

export interface ReviewRow extends Review { product_name: string; customer_name: string | null }

export async function listReviews(): Promise<ReviewRow[]> {
  if (IS_DEMO) {
    await demoDelay();
    return ledger.reviews.map((r) => ({ ...r, product_name: demoDb.products.find((p) => p.id === r.product_id)?.name ?? '—', customer_name: demoDb.customers.find((c) => c.profile_id === r.profile_id)?.name ?? null }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { data, error } = await sb().from('reviews').select('*, products(name), profiles(full_name)').order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  type R = Review & { products: { name: string } | null; profiles: { full_name: string | null } | null };
  return ((data ?? []) as R[]).map(({ products, profiles, ...r }) => ({ ...r, product_name: products?.name ?? '—', customer_name: profiles?.full_name ?? null }));
}

export async function setReviewVisible(id: string, visible: boolean): Promise<void> {
  if (IS_DEMO) { await demoDelay(); const r = ledger.reviews.find((x) => x.id === id); if (r) r.is_visible = visible; demoChanged(); return; }
  const { error } = await sb().from('reviews').update({ is_visible: visible }).eq('id', id);
  if (error) throw error;
}

export interface ProductOption { id: string; name: string }
export async function productOptions(): Promise<ProductOption[]> {
  if (IS_DEMO) return demoDb.products.filter((p) => !p.archived_at).map((p) => ({ id: p.id, name: p.name }));
  const { data } = await sb().from('products').select('id,name').is('archived_at', null).order('name').limit(3000);
  return (data ?? []) as ProductOption[];
}
export async function brandOptions(): Promise<ProductOption[]> {
  if (IS_DEMO) return demoDb.brands.map((b) => ({ id: b.id, name: b.name }));
  const { data } = await sb().from('brands').select('id,name').order('name');
  return (data ?? []) as ProductOption[];
}
