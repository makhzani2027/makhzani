import {
  customerCanCancel, customerTimeline, FULFILLMENT, governorateName, ORDER_PAYMENT_METHOD, ORDER_PAYMENT_STATUS,
  ORDER_STATUS, whatsappLink,
} from '@raqeem/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { ProductImage } from '@/components/brand';
import { dialog } from '@/components/dialog';
import { Bone, PressScale, Skeleton } from '@/components/motion';
import { Sheet } from '@/components/sheet';
import { Stars } from '@/components/stars';
import { toast } from '@/components/toast';
import { AppBar, Badge, Button, Card, Divider, Empty, Icon, Input, KeyValue, Notice, Row, Screen, T } from '@/components/ui';
import { api, type OrderItem } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { payOnline } from '@/lib/pay';
import { qk, useSettings } from '@/lib/query';
import { useTheme } from '@/lib/theme';

/** الخط الزمني بخمس خطوات (customerTimeline) */
function Timeline({ status, fulfillment, times }: { status: Parameters<typeof customerTimeline>[0]; fulfillment: Parameters<typeof customerTimeline>[1]; times: Record<string, string | undefined> }) {
  const { c } = useTheme();
  const f = useFmt();
  const steps = customerTimeline(status, fulfillment);
  return (
    <View>
      {steps.map((s, i) => {
        const done = s.state === 'done';
        const cur = s.state === 'current';
        const at = times[s.key];
        return (
          <View key={s.key} style={{ flexDirection: 'row', gap: 12, minHeight: 52 }}>
            <View style={{ alignItems: 'center', width: 26 }}>
              <Animated.View key={s.state} entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}
                style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.accent : cur ? c.accentSoft : c.sunken, borderWidth: cur ? 2 : 0, borderColor: c.accent }}>
                {done ? <Icon name="check" size={15} color={c.accentInk} strokeWidth={2.6} /> : cur ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /> : null}
              </Animated.View>
              {i < steps.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: done ? c.accent : c.line, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 14 }}>
              <T weight={cur || done ? 'bold' : 'regular'} tone={done || cur ? 'ink' : 'ink3'}>{s.label}</T>
              {at && (done || cur) ? <T v="small" tone="ink2">{f.date(at, true)}</T> : cur ? <T v="small" tone="accent">الآن</T> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ReviewSheet({ item, onClose }: { item: OrderItem | null; onClose: () => void }) {
  const { c } = useTheme();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRating(5); setComment(''); }, [item]);
  const send = async () => {
    if (!item?.product_id) return;
    setBusy(true);
    try {
      await api.submitReview(item.product_id, rating, comment.trim() || null);
      toast.show('شكراً لتقييمك', 'success');
      onClose();
    } catch (e) {
      toast.show(friendlyError(e), 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={!!item} onClose={onClose} title="قيّم المنتج" footer={<Button title="أرسل التقييم" loading={busy} onPress={send} />}>
      <View style={{ gap: 14 }}>
        <T weight="bold" lines={2}>{item?.name}</T>
        <Row gap={6} style={{ justifyContent: 'center' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <PressScale key={n} onPress={() => setRating(n)} haptic="select" hitSlop={4} accessibilityLabel={`${n} من ٥`}>
              <Icon name="star" size={36} color={c.accent} fill={rating >= n ? c.accent : undefined} />
            </PressScale>
          ))}
        </Row>
        <Input value={comment} onChangeText={setComment} placeholder="اكتب رأيك (اختياري)" multiline maxLength={600} />
      </View>
    </Sheet>
  );
}

export default function OrderDetail() {
  const { c } = useTheme();
  const f = useFmt();
  const qc = useQueryClient();
  const cart = useCart();
  const store = useSettings().data?.store;
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: qk.order(id), queryFn: () => api.order(id) });
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<OrderItem | null>(null);

  // لحظياً: أي تغيير في الطلب أو أحداثه يعيد التحميل
  useEffect(() => api.subscribeOrder(id, () => {
    q.refetch();
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }), [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = q.data;
  if (q.isLoading) {
    return <Screen header={<AppBar title="الطلب" />}><Skeleton style={{ gap: 12 }}><Bone h={260} r={20} /><Bone h={120} r={20} /></Skeleton></Screen>;
  }
  if (!d) {
    return <Screen header={<AppBar title="الطلب" />}><Empty icon="package" title="الطلب غير موجود" body={q.error ? friendlyError(q.error) : undefined} action="طلباتي" onAction={() => router.replace('/orders')} /></Screen>;
  }
  const o = d.order;
  const st = ORDER_STATUS[o.status];
  const times: Record<string, string | undefined> = {};
  const keyOf: Record<string, string> = { pending: 'placed', confirmed: 'confirmed', preparing: 'preparing', ready: o.fulfillment === 'pickup' ? 'shipping' : 'preparing', out_for_delivery: 'shipping', delivered: 'delivered' };
  for (const e of d.events) if (e.status && keyOf[e.status] && !times[keyOf[e.status]]) times[keyOf[e.status]] = e.created_at;
  times.placed ??= o.created_at;
  const wa = whatsappLink(store?.whatsapp ?? store?.phone, `مرحباً، استفسار عن الطلب ${o.number}`);
  const payable = o.payment_method === 'online' && ['unpaid', 'pending', 'failed'].includes(o.payment_status) && o.status !== 'cancelled';

  const cancel = async () => {
    const reason = await dialog.prompt({ title: 'إلغاء الطلب؟', message: 'يُلغى الطلب وتعود المنتجات للمتجر. اكتب السبب إن أحببت.', confirm: 'إلغاء الطلب', danger: true, placeholder: 'السبب (اختياري)' });
    if (reason === null) return;
    setBusy('cancel');
    try {
      await api.cancelOrder(o.id, reason.trim() || null);
      toast.show('أُلغي الطلب', 'success');
      q.refetch();
      qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (e) {
      toast.show(friendlyError(e), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const reorder = () => {
    d.items.forEach((it) => { if (it.variant_id) cart.add(it.variant_id, it.qty); });
    toast.show('أُضيفت المنتجات للسلة', 'success');
    router.navigate('/cart');
  };

  const pay = async () => {
    setBusy('pay');
    try {
      const ok = await payOnline(o.id);
      toast.show(ok ? 'تم الدفع بنجاح' : 'لم يكتمل الدفع بعد', ok ? 'success' : 'warning');
      q.refetch();
    } catch (e) {
      toast.show(friendlyError(e), 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen header={<AppBar title={`الطلب ${f.doc(o.number)}`} subtitle={f.date(o.created_at, true)} />} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Card style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="h3">حالة الطلب</T>
          <Badge tone={st.tone} label={st.label} />
        </Row>
        {o.status === 'cancelled' ? (
          <Notice tone="danger" icon="xCircle" title="أُلغي هذا الطلب" body={o.cancel_reason} />
        ) : o.status === 'returned' ? (
          <Notice tone="neutral" icon="return" title="أُرجع هذا الطلب" />
        ) : (
          <Timeline status={o.status} fulfillment={o.fulfillment} times={times} />
        )}
      </Card>

      {payable ? (
        <Notice tone="warning" icon="card" title={ORDER_PAYMENT_STATUS[o.payment_status].label} body="أكمل الدفع الإلكتروني ليبدأ تجهيز طلبك.">
          <Button title="ادفع الآن" icon="card" loading={busy === 'pay'} onPress={pay} />
        </Notice>
      ) : null}

      <Card style={{ gap: 12 }}>
        <T v="h3">المنتجات</T>
        {d.items.map((it, i) => (
          <View key={it.id} style={{ gap: 12 }}>
            {i ? <Divider /> : null}
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden' }}>
                <ProductImage imageKey={it.image_key} width={56} radiusPx={12} iconSize={22} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={14.5} weight="medium" lines={2}>{it.name}</T>
                {it.variant_title && it.variant_title !== 'افتراضي' ? <T v="small" tone="ink2">{it.variant_title}</T> : null}
                <T v="small" tone="ink2">{f.num(it.qty)} × {f.money(it.unit_price)}</T>
                {o.status === 'delivered' && it.product_id ? (
                  <PressScale onPress={() => setReview(it)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 2 }} hitSlop={6}>
                    <Stars value={0} size={13} /><T v="small" tone="accent" weight="bold">قيّم</T>
                  </PressScale>
                ) : null}
              </View>
              <T weight="bold" tabular>{f.money(it.line_total)}</T>
            </Row>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 8 }}>
        <KeyValue label="المجموع الفرعي" value={f.money(o.subtotal)} />
        {o.discount > 0 ? <KeyValue label={`الخصم${o.coupon_code ? ` (${o.coupon_code})` : ''}`} value={`− ${f.money(o.discount)}`} accent /> : null}
        <KeyValue label="التوصيل" value={o.delivery_fee ? f.money(o.delivery_fee) : 'مجاني'} />
        <Divider dashed />
        <KeyValue label="الإجمالي" value={f.money(o.total)} strong />
        <KeyValue label="الدفع" value={`${ORDER_PAYMENT_METHOD[o.payment_method].label} · ${ORDER_PAYMENT_STATUS[o.payment_status].label}`} />
      </Card>

      <Card style={{ gap: 6 }}>
        <Row gap={8}><Icon name={o.fulfillment === 'pickup' ? 'store' : 'mapPin'} size={20} color={c.accent} /><T v="h3">{FULFILLMENT[o.fulfillment].label}</T></Row>
        {o.address ? (
          <>
            <T>{governorateName(o.address.governorate)}{o.address.city ? ` — ${o.address.city}` : ''}{o.address.area ? `، ${o.address.area}` : ''}</T>
            {o.address.street ? <T v="small" tone="ink2">{o.address.street}</T> : null}
            {o.address.landmark ? <T v="small" tone="ink2">قرب {o.address.landmark}</T> : null}
            <T v="small" tone="ink2">{o.address.recipient_name} · {f.phone(o.address.phone)}</T>
          </>
        ) : <T v="small" tone="ink2">{store?.address ?? 'نبلغك حين يجهز طلبك للاستلام.'}</T>}
        {o.customer_note ? <T v="small" tone="ink2">ملاحظتك: {o.customer_note}</T> : null}
      </Card>

      <View style={{ gap: 10 }}>
        {wa ? <Button title="تواصل معنا على واتساب" icon="whatsapp" variant="secondary" onPress={() => Linking.openURL(wa)} /> : null}
        {['delivered', 'cancelled', 'returned'].includes(o.status) ? <Button title="أعد الطلب" icon="refresh" variant="ink" onPress={reorder} /> : null}
        {customerCanCancel(o.status) ? <Button title="إلغاء الطلب" variant="danger" loading={busy === 'cancel'} onPress={cancel} /> : null}
      </View>
      <ReviewSheet item={review} onClose={() => setReview(null)} />
    </Screen>
  );
}
