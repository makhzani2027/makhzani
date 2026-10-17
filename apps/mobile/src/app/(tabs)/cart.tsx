import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { ProductImage } from '@/components/brand';
import { Bone, PressScale, Skeleton } from '@/components/motion';
import { Badge, Button, Card, Divider, Empty, Icon, Input, KeyValue, Notice, PageTitle, Row, Screen, Stepper, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useFmt } from '@/lib/format';
import { couponStore, useCoupon, useQuote, useVariantInfos } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';

export default function Cart() {
  const { c, tone } = useTheme();
  const f = useFmt();
  const cart = useCart();
  const { uid, onboarded } = useAuth();
  const coupon = useCoupon();
  const [code, setCode] = useState(coupon ?? '');
  const infos = useVariantInfos(cart.lines.map((l) => l.variant_id));
  const quote = useQuote(cart.lines, null, coupon);
  const q = quote.data;

  const header = <PageTitle title="السلة" subtitle={cart.count ? f.items(cart.count) : undefined} />;

  if (cart.ready && !cart.lines.length) {
    return (
      <Screen header={header}>
        <Empty icon="bag" title="سلتك فارغة" body="أضف ما يعجبك من المتجر، ويبقى هنا حتى تكمل الطلب." action="تسوّق الآن" onAction={() => router.navigate('/')} />
      </Screen>
    );
  }

  const blocked = !q || !q.lines.every((l) => l.ok) || q.subtotal < q.min_order_total;
  const checkout = () => {
    if (!uid) router.push({ pathname: '/login', params: { next: '/checkout' } });
    else if (!onboarded) router.push('/complete-profile');
    else router.push('/checkout');
  };

  return (
    <Screen
      header={header}
      onRefresh={() => { infos.refetch(); quote.refetch(); }}
      refreshing={quote.isRefetching}
      footer={
        <Row>
          <View style={{ flex: 1 }}>
            <T v="small" tone="ink2">المجموع</T>
            <T size={19} weight="black" tabular>{q ? f.money(q.subtotal - q.discount) : '—'}</T>
          </View>
          <Button title="إتمام الطلب" icon="next" onPress={checkout} disabled={blocked || quote.isFetching && !q} style={{ minWidth: 180 }} />
        </Row>
      }>
      {cart.lines.map((l) => {
        const info = infos.data?.find((i) => i.variant_id === l.variant_id);
        const ql = q?.lines.find((x) => x.variant_id === l.variant_id);
        const price = ql?.unit_price ?? info?.price ?? 0;
        const changed = l.price_seen !== undefined && info && l.price_seen !== info.price;
        if (!info) {
          return infos.isLoading ? (
            <Skeleton key={l.variant_id} style={{ flexDirection: 'row', gap: 12 }}><Bone w={84} h={84} r={16} /><View style={{ flex: 1, gap: 8 }}><Bone w="70%" /><Bone w="40%" /></View></Skeleton>
          ) : (
            <Card key={l.variant_id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T tone="ink2">منتج لم يعد متوفراً في المتجر</T>
                <Button small variant="ghost" title="احذف" onPress={() => cart.remove(l.variant_id)} />
              </Row>
            </Card>
          );
        }
        return (
          <Animated.View key={l.variant_id} layout={LinearTransition.duration(200).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(140)}>
            <Card style={{ flexDirection: 'row', gap: 12 }} padded={false}>
              <PressScale onPress={() => router.push(`/product/${info.product_slug}`)} style={{ width: 96, padding: 8 }} accessibilityLabel={info.name}>
                <ProductImage imageKey={info.image_key} categoryId={info.category_id} width={80} radiusPx={14} />
              </PressScale>
              <View style={{ flex: 1, paddingVertical: 12, paddingEnd: 12, gap: 4 }}>
                <Row style={{ alignItems: 'flex-start' }} gap={6}>
                  <View style={{ flex: 1 }}>
                    <T size={14.5} weight="medium" lines={2}>{info.name}</T>
                    {info.variant_title ? <T v="small" tone="ink2" lines={1}>{info.variant_title}</T> : null}
                  </View>
                  <PressScale onPress={() => cart.remove(l.variant_id)} hitSlop={10} accessibilityLabel={`احذف ${info.name}`} accessibilityRole="button">
                    <Icon name="trash" size={19} color={c.ink3} />
                  </PressScale>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T weight="black" tabular>{f.money(price * l.qty)}</T>
                  <Stepper small value={l.qty} min={1} max={Math.max(1, Math.min(99, info.available_qty || 1))} onChange={(n) => cart.setQty(l.variant_id, n)} />
                </Row>
                {ql && !ql.ok ? (
                  <Badge tone="danger" icon="alert" label={ql.available_qty > 0 ? `المتوفر ${f.num(ql.available_qty)} فقط` : 'نفد حالياً'} />
                ) : changed ? (
                  <Badge tone="warning" icon="info" label={`تغيّر السعر من ${f.money(l.price_seen!)}`} />
                ) : null}
              </View>
            </Card>
          </Animated.View>
        );
      })}

      <Card style={{ gap: 10 }}>
        <T weight="bold">كوبون الخصم</T>
        <Row gap={8} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Input value={code} onChangeText={setCode} placeholder="اكتب الرمز" autoCapitalize="characters" ltr icon="ticket"
              error={coupon && q?.coupon_error ? q.coupon_error : null} />
          </View>
          {coupon && !q?.coupon_error ? (
            <Button title="إزالة" variant="secondary" onPress={() => { couponStore.set(null); setCode(''); }} />
          ) : (
            <Button title="تطبيق" variant="ink" disabled={!code.trim()} onPress={() => couponStore.set(code)} />
          )}
        </Row>
        {q?.coupon_code ? <T v="small" color={tone.success.ink} weight="bold">طُبّق الكوبون {q.coupon_code}</T> : null}
      </Card>

      {q ? (
        <Card style={{ gap: 8 }}>
          <KeyValue label="المجموع الفرعي" value={f.money(q.subtotal)} />
          {q.discount > 0 ? <KeyValue label="الخصم" value={`− ${f.money(q.discount)}`} accent /> : null}
          <KeyValue label="التوصيل" value="يُحسب حسب المحافظة" />
          <Divider dashed />
          <KeyValue label="الإجمالي قبل التوصيل" value={f.money(q.subtotal - q.discount)} strong />
        </Card>
      ) : null}

      {q && q.subtotal < q.min_order_total ? (
        <Notice tone="warning" icon="info" title={`أقل مبلغ للطلب ${f.money(q.min_order_total)}`} body={`أضف ما قيمته ${f.money(q.min_order_total - q.subtotal)} لتكمل.`} />
      ) : null}
      {!uid ? <Notice tone="info" icon="user" title="سجّل الدخول عند الإتمام" body="سلتك محفوظة على هذا الهاتف وتنتقل لحسابك عند الدخول." /> : null}
    </Screen>
  );
}
