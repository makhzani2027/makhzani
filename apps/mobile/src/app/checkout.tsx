import { governorateName, ORDER_PAYMENT_METHOD, type Fulfillment, type OrderPaymentMethod } from '@raqeem/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { PressScale } from '@/components/motion';
import { toast } from '@/components/toast';
import { AppBar, Badge, Button, Card, Divider, Empty, Icon, Input, KeyValue, Notice, Radio, Row, Screen, T, type IconName } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { friendlyError } from '@/lib/errors';
import { landmarkText, useFmt } from '@/lib/format';
import { addressPick, couponStore, useCoupon, useQuote } from '@/lib/hooks';
import { payOnline } from '@/lib/pay';
import { qk, useSettings, useZones } from '@/lib/query';
import { useTheme } from '@/lib/theme';

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  const f = useFmt();
  return (
    <View style={{ gap: 10 }}>
      <Row gap={10}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
          <T size={13} weight="bold" color={c.bg} style={{ paddingBottom: 0 }}>{f.num(n)}</T>
        </View>
        <T v="h3">{title}</T>
      </Row>
      {children}
    </View>
  );
}

function Option({ on, onPress, icon, title, body, right, disabled }: { on: boolean; onPress: () => void; icon: IconName; title: string; body?: string | null; right?: React.ReactNode; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <PressScale onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected: on, disabled }} scaleTo={0.99}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? c.accent : c.line, backgroundColor: c.card, opacity: disabled ? 0.5 : 1 }}>
      <Icon name={icon} size={24} color={on ? c.accent : c.ink2} />
      <View style={{ flex: 1 }}>
        <T weight="bold">{title}</T>
        {body ? <T v="small" tone="ink2">{body}</T> : null}
      </View>
      {right}
      <Radio on={on} />
    </PressScale>
  );
}

export default function Checkout() {
  const { c, tone } = useTheme();
  const f = useFmt();
  const qc = useQueryClient();
  const { uid, onboarded } = useAuth();
  const cart = useCart();
  const coupon = useCoupon();
  const ck = useSettings().data?.checkout;
  const zones = useZones().data ?? [];
  const addresses = useQuery({ queryKey: qk.addresses(uid ?? '-'), queryFn: () => api.addresses(uid!), enabled: !!uid });
  const [fulfillment, setFulfillment] = useState<Fulfillment>('delivery');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState<OrderPaymentMethod>('cod');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // عائد من إضافة عنوان: نختار العنوان الجديد («حفظ واستعمال العنوان»)
  useFocusEffect(useCallback(() => {
    const picked = addressPick.take();
    if (picked) setAddressId(picked);
    addresses.refetch();
  }, [addresses.refetch]));
  const list = addresses.data ?? [];
  useEffect(() => {
    if (!list.length) return;
    if (!addressId || !list.some((a) => a.id === addressId)) setAddressId((list.find((a) => a.is_default) ?? list[0]).id);
  }, [list, addressId]);

  const address = list.find((a) => a.id === addressId) ?? null;
  const delivery = fulfillment === 'delivery';
  const quote = useQuote(cart.lines, delivery ? address?.governorate ?? null : null, coupon);
  const q = quote.data;

  // طرق الدفع المتاحة: عند الاستلام للتوصيل فقط، والإلكتروني يختفي حتى يُضبط Wayl
  const methods: { key: OrderPaymentMethod; icon: IconName; show: boolean }[] = [
    { key: 'cod', icon: 'cash', show: !!ck?.cod_enabled && delivery },
    { key: 'office', icon: 'store', show: !!ck?.office_enabled },
    { key: 'online', icon: 'card', show: !!ck?.online_enabled },
  ];
  const available = methods.filter((m) => m.show);
  useEffect(() => {
    if (available.length && !available.some((m) => m.key === payment)) setPayment(available[0].key);
  }, [available, payment]);
  useEffect(() => { if (ck && !ck.pickup_enabled && fulfillment === 'pickup') setFulfillment('delivery'); }, [ck, fulfillment]);

  if (!uid || !onboarded) {
    return (
      <Screen header={<AppBar title="إتمام الطلب" />}>
        <Empty icon="user" title="سجّل الدخول أولاً" body="نحتاج حسابك لنرسل الطلب ونتابعه معك." action="تسجيل الدخول" onAction={() => router.replace({ pathname: '/login', params: { next: '/checkout' } })} />
      </Screen>
    );
  }
  if (!cart.lines.length && !busy) {
    return (
      <Screen header={<AppBar title="إتمام الطلب" />}>
        <Empty icon="bag" title="سلتك فارغة" action="تسوّق الآن" onAction={() => router.navigate('/')} />
      </Screen>
    );
  }

  const problems = [
    delivery && !address ? 'اختر عنوان التوصيل أو أضف عنواناً' : null,
    q?.delivery_error ?? null,
    q && !q.lines.every((l) => l.ok) ? 'بعض المنتجات لم تعد متوفرة بالكمية المطلوبة. عدّل السلة.' : null,
    q && q.subtotal < q.min_order_total ? `أقل مبلغ للطلب ${f.money(q.min_order_total)}` : null,
    // place_order يرفض الطلب إن كان الكوبون المكتوب غير صالح
    coupon && q?.coupon_error ? `الكوبون: ${q.coupon_error}. أزله من السلة أو صحّحه.` : null,
    !available.length ? 'لا طريقة دفع متاحة حالياً. تواصل مع المتجر.' : null,
  ].filter(Boolean) as string[];

  const place = async () => {
    if (problems.length || !q) return;
    setBusy('يرسل الطلب…');
    try {
      const r = await api.placeOrder({
        items: cart.lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty })),
        address_id: delivery ? address!.id : null, fulfillment, payment_method: payment,
        coupon_code: coupon, note: note.trim() || null,
      });
      cart.clearLocal();
      couponStore.set(null);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['variants'] });
      if (payment === 'online') {
        setBusy('ننتظر تأكيد الدفع…');
        const paid = await payOnline(r.order_id).catch((e) => { toast.show(friendlyError(e), 'warning'); return false; });
        if (!paid) toast.show('لم يكتمل الدفع بعد. طلبك محفوظ، وتستطيع الدفع من صفحته.', 'warning');
      }
      router.replace({ pathname: '/order-success/[id]', params: { id: r.order_id, number: r.number } });
    } catch (e) {
      toast.show(friendlyError(e), 'danger');
      quote.refetch();
    } finally {
      setBusy(null);
    }
  };

  const zoneFee = (gov: string) => zones.find((z) => z.governorate === gov);

  return (
    <Screen
      header={<AppBar title="إتمام الطلب" subtitle={f.items(cart.count)} />}
      gap={22}
      footer={
        <View style={{ gap: 8 }}>
          {problems[0] ? <T v="small" color={tone.danger.ink} center>{problems[0]}</T> : null}
          <Button title={busy ?? (q ? `تأكيد الطلب · ${f.money(q.total)}` : 'تأكيد الطلب')} icon="check" loading={!!busy} disabled={!!problems.length || !q || quote.isFetching} onPress={place} />
        </View>
      }>
      <Section n={1} title="طريقة الاستلام">
        <Option on={delivery} onPress={() => setFulfillment('delivery')} icon="truck" title="توصيل للبيت" body="لكل المحافظات، الأجرة حسب محافظتك" />
        {ck?.pickup_enabled ? <Option on={!delivery} onPress={() => setFulfillment('pickup')} icon="store" title="استلام من المكتب" body="بلا أجرة توصيل — نبلغك حين يجهز" /> : null}
      </Section>

      {delivery ? (
        <Section n={2} title="عنوان التوصيل">
          {list.map((a) => {
            const z = zoneFee(a.governorate);
            return (
              <Option key={a.id} on={a.id === addressId} onPress={() => setAddressId(a.id)} icon="mapPin"
                title={`${a.label ? `${a.label} · ` : ''}${governorateName(a.governorate)}${a.city ? ` — ${a.city}` : ''}`}
                body={[a.area, a.street, landmarkText(a.landmark) || null].filter(Boolean).join('، ') + `\n${a.recipient_name} · ${f.phone(a.phone)}`}
                right={z ? <T v="small" tone="ink2">{z.fee ? f.money(z.fee) : 'مجاني'}</T> : <Badge tone="danger" label="غير متاح" />} />
            );
          })}
          <Button variant="secondary" icon="plus" title={list.length ? 'عنوان جديد' : 'أضف عنوان التوصيل'} onPress={() => router.push({ pathname: '/addresses/edit', params: { pick: '1' } })} />
        </Section>
      ) : null}

      <Section n={delivery ? 3 : 2} title="طريقة الدفع">
        {available.map((m) => (
          <Option key={m.key} on={payment === m.key} onPress={() => setPayment(m.key)} icon={m.icon} title={ORDER_PAYMENT_METHOD[m.key].label} body={ORDER_PAYMENT_METHOD[m.key].hint} />
        ))}
        {payment === 'office' && ck?.office_instructions ? <Notice tone="info" icon="info" title="الدفع في المكتب" body={ck.office_instructions} /> : null}
      </Section>

      <Input label="ملاحظة للمتجر (اختياري)" value={note} onChangeText={setNote} placeholder="وقت مناسب للتوصيل، تفاصيل إضافية…" multiline maxLength={500} />

      <Card style={{ gap: 8 }}>
        <T v="h3">الملخص</T>
        {q ? (
          <>
            <KeyValue label={`المنتجات (${f.items(q.items_count)})`} value={f.money(q.subtotal)} />
            {q.discount > 0 ? <KeyValue label={`الخصم${q.coupon_code ? ` (${q.coupon_code})` : ''}`} value={`− ${f.money(q.discount)}`} accent /> : null}
            {coupon && q.coupon_error ? <T v="small" color={tone.warning.ink}>الكوبون: {q.coupon_error}</T> : null}
            <KeyValue label="التوصيل" value={!delivery ? 'استلام — مجاني' : !address ? '—' : q.delivery_fee ? f.money(q.delivery_fee) : 'مجاني'} />
            <Divider dashed />
            <KeyValue label="الإجمالي" value={f.money(q.total)} strong />
            {payment === 'cod' ? <T v="small" tone="ink2">تدفع المبلغ نقداً للمندوب عند الاستلام.</T> : null}
          </>
        ) : quote.error ? (
          <T v="small" color={c.accent}>{friendlyError(quote.error)}</T>
        ) : <T v="small" tone="ink2">يحسب…</T>}
      </Card>
    </Screen>
  );
}
