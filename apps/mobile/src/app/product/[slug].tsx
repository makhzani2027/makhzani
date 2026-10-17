import { formatPercent } from '@raqeem/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Share, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PriceTag, ProductImage } from '@/components/brand';
import { Stars } from '@/components/stars';
import { useCartTarget, useFly, type ViewRef } from '@/components/fly';
import { Gallery } from '@/components/gallery';
import { appear, Bone, Skeleton, usePop } from '@/components/motion';
import { discountOf, ProductRail } from '@/components/product-card';
import { toast } from '@/components/toast';
import { Badge, Button, Card, Chip, CountBadge, Divider, Empty, ErrorState, Footer, GUTTER, Icon, IconButton, Row, Stepper, T, contentColumn, goBack } from '@/components/ui';
import { api, type PublicVariant } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { env } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { useFavorites } from '@/lib/favorites';
import { useFmt } from '@/lib/format';
import { qk, useSettings } from '@/lib/query';
import { useTheme } from '@/lib/theme';

function HeaderCart() {
  const { count } = useCart();
  const { landed } = useFly();
  const ref = useCartTarget('focus');
  const pop = usePop(`${count}-${landed}`);
  return (
    <Animated.View ref={ref} collapsable={false} style={pop}>
      <IconButton name="bag" label="السلة" onPress={() => router.navigate('/cart')} />
      {count ? <CountBadge n={count} style={{ position: 'absolute', top: -3, end: -3 }} /> : null}
    </Animated.View>
  );
}

const matches = (v: PublicVariant, sel: Record<string, string>) => Object.entries(sel).every(([k, val]) => v.options?.[k] === val);

export default function ProductScreen() {
  const { c } = useTheme();
  const f = useFmt();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const q = useQuery({ queryKey: qk.product(slug), queryFn: () => api.product(slug) });
  const checkout = useSettings().data?.checkout;
  const cart = useCart();
  const fav = useFavorites();
  const { fly } = useFly();
  const imgRef = useRef<ViewRef>(null);
  const d = q.data;
  const [sel, setSel] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const colW = Math.min(width, 720);

  const names = useMemo(() => (d && d.product.has_variants ? d.product.option_names.filter((n) => d.variants.some((v) => v.options?.[n])) : []), [d]);
  useEffect(() => {
    if (!d || !names.length) return;
    const first = d.variants.find((v) => v.available_qty > 0) ?? d.variants[0];
    if (first) setSel(Object.fromEntries(names.map((n) => [n, first.options[n]])));
  }, [d, names]);

  const variant: PublicVariant | null = d
    ? (names.length ? d.variants.find((v) => matches(v, sel)) ?? null : d.variants[0] ?? null)
    : null;

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <Skeleton style={[contentColumn, { gap: 14, padding: GUTTER }]}><Bone h={colW - GUTTER * 2} r={20} /><Bone w="70%" h={22} /><Bone w="40%" h={28} /><Bone h={80} /></Skeleton>
      </View>
    );
  }
  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <View style={{ padding: 12 }}><IconButton name="back" label="رجوع" plain onPress={goBack} /></View>
        {q.error ? <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} /> : <Empty icon="box" title="المنتج غير متوفر" body="ربما أُزيل من المتجر." action="العودة للمتجر" onAction={() => router.navigate('/')} />}
      </View>
    );
  }

  const p = d.product;
  const keys = [...new Set([variant?.image_key, ...d.images.map((i) => i.key), p.cover_key].filter((k): k is string => !!k))];
  const price = variant?.price ?? Math.min(...d.variants.map((v) => v.price));
  const compare = variant?.compare_at_price ?? null;
  const off = discountOf(price, compare);
  const avail = variant?.available_qty ?? 0;
  const out = !variant || avail <= 0;
  const inCart = variant ? cart.qtyOf(variant.id) : 0;
  const maxQty = Math.max(1, Math.min(99, avail - inCart));
  const faved = fav.has(p.id);

  const optionState = (name: string, value: string) => {
    const others = { ...sel, [name]: value };
    const exists = d.variants.filter((v) => matches(v, others));
    return { exists: exists.length > 0, available: exists.some((v) => v.available_qty > 0) };
  };

  const add = (buy?: boolean) => {
    if (!variant) return toast.show('اختر الخيارات أولاً', 'warning');
    if (inCart + qty > avail) return toast.show(`المتوفر ${f.num(avail)} فقط`, 'warning');
    cart.add(variant.id, qty, variant.price);
    if (buy) router.navigate('/cart');
    else {
      fly(imgRef, <View style={{ width: 72, height: 72 }}><ProductImage imageKey={keys[0]} categoryId={p.category_id} width={72} radiusPx={18} /></View>);
      setQty(1);
    }
  };

  const share = () => {
    const url = `${env.siteUrl}/p/${p.slug}`;
    Share.share({ message: `${p.name} — ${f.money(price)}\n${url}`, url }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: c.bg }}>
        <View style={[contentColumn, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 56 }]}>
          <IconButton name="back" label="رجوع" onPress={goBack} />
          <View style={{ flex: 1 }} />
          <IconButton name="share" label="مشاركة" onPress={share} />
          <IconButton name="heart" label={faved ? 'إزالة من المفضلة' : 'أضف للمفضلة'} color={faved ? c.accent : undefined} iconFill={faved ? c.accent : undefined} onPress={() => fav.toggle(p.id)} />
          <HeaderCart />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Animated.View entering={appear} style={[contentColumn, { gap: 18 }]}>
          <View ref={imgRef} collapsable={false}>
            <Gallery keys={keys} categoryId={p.category_id} width={colW} />
          </View>

          <View style={{ paddingHorizontal: GUTTER, gap: 18 }}>
            <View style={{ gap: 4 }}>
              {d.brand ? <T v="small" tone="accent" weight="bold" style={{ alignSelf: 'flex-start' }}>{d.brand.name}</T> : null}
              <T v="h2" size={24}>{p.name}</T>
              {p.rating_count > 0 ? (
                <Row gap={6}><Stars value={p.rating_avg} /><T v="small" weight="bold">{f.num(Math.round(p.rating_avg * 10) / 10)}</T><T v="small" tone="ink2">({f.count(p.rating_count, { one: 'تقييم واحد', two: 'تقييمان', few: 'تقييمات', many: 'تقييماً' })})</T></Row>
              ) : null}
            </View>

            {/* بطاقة السعر */}
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T size={28} weight="black" family="display" tabular>{f.money(price)}</T>
                {off > 0 && compare ? (
                  <Row gap={8}>
                    <T tone="ink3" style={{ textDecorationLine: 'line-through' }}>{f.money(compare)}</T>
                    <T v="small" tone="accent" weight="bold">وفّرت {f.money(compare - price)}</T>
                  </Row>
                ) : null}
              </View>
              {off >= 0.01 ? <PriceTag label={formatPercent(off, f.digits, 0)} /> : null}
            </Card>

            {names.map((n) => (
              <View key={n} style={{ gap: 8 }}>
                <T weight="bold">{n}: <T tone="ink2">{sel[n] ?? ''}</T></T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[...new Set(d.variants.map((v) => v.options?.[n]).filter(Boolean))].map((val) => {
                    const st = optionState(n, val);
                    return <Chip key={val} label={val} active={sel[n] === val} struck={!st.available} disabled={!st.exists} onPress={() => { setSel({ ...sel, [n]: val }); setQty(1); }} />;
                  })}
                </View>
              </View>
            ))}

            <Row style={{ justifyContent: 'space-between' }}>
              {out ? (
                <Badge tone="danger" icon="xCircle" label={variant ? 'نفد هذا الخيار' : 'هذا الاختيار غير متوفر'} />
              ) : avail <= 5 ? (
                <Badge tone="warning" icon="clock" label={`بقي ${f.num(avail)} فقط`} />
              ) : (
                <Badge tone="success" icon="checkCircle" label="متوفر" />
              )}
              {!out ? <Stepper value={qty} onChange={setQty} min={1} max={maxQty} /> : null}
            </Row>

            {out && p.allow_request ? (
              <Card style={{ gap: 10, backgroundColor: c.accentSoft, borderColor: c.accentSoft }}>
                <T weight="bold" color={c.accentSoftInk}>نفد حالياً؟ نوفّره لك</T>
                <T v="small" color={c.accentSoftInk}>أرسل طلب توفير ونبلغك فور وصوله.</T>
                <Button title="اطلب توفيره" icon="request" variant="ink" onPress={() => router.push({ pathname: '/request/new', params: { title: `${p.name}${variant && variant.title !== 'افتراضي' ? ` — ${variant.title}` : ''}` } })} />
              </Card>
            ) : null}

            <Card padded={false} style={{ overflow: 'hidden' }}>
              <Row style={{ padding: 14 }} gap={10}>
                <Icon name="truck" size={22} color={c.accent} />
                <View style={{ flex: 1 }}>
                  <T weight="bold" size={14}>توصيل لكل المحافظات</T>
                  <T v="small" tone="ink2">{checkout?.free_delivery_over ? `مجاني فوق ${f.money(checkout.free_delivery_over)}` : 'الأجرة حسب المحافظة عند الإتمام'}</T>
                </View>
              </Row>
              {checkout?.cod_enabled ? <><Divider /><Row style={{ padding: 14 }} gap={10}><Icon name="cash" size={22} color={c.accent} /><T weight="bold" size={14}>الدفع عند الاستلام</T></Row></> : null}
              {p.warranty ? <><Divider /><Row style={{ padding: 14 }} gap={10}><Icon name="shield" size={22} color={c.accent} /><T weight="bold" size={14} style={{ flex: 1 }}>الضمان: {p.warranty}</T></Row></> : null}
            </Card>

            {p.description ? (
              <View style={{ gap: 6 }}>
                <T v="h3">الوصف</T>
                <T v="serif" tone="ink2" selectable>{p.description}</T>
              </View>
            ) : null}

            {p.specs?.length ? (
              <View style={{ gap: 8 }}>
                <T v="h3">المواصفات</T>
                <Card padded={false} style={{ overflow: 'hidden' }}>
                  {p.specs.map((s, i) => (
                    <View key={`${s.label}-${i}`} style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: i % 2 ? c.sunken : c.card, gap: 12 }}>
                      <T v="small" tone="ink2" style={{ width: 110 }}>{s.label}</T>
                      <T v="small" weight="medium" style={{ flex: 1 }}>{s.value}</T>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              <T v="h3">التقييمات</T>
              {d.reviews.length ? d.reviews.map((r) => (
                <Card key={r.id} style={{ gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T weight="bold" size={14}>{r.author}</T>
                    <Stars value={r.rating} size={13} />
                  </Row>
                  {r.comment ? <T v="small" tone="ink2">{r.comment}</T> : null}
                  <T v="micro" tone="ink3">{f.ago(r.created_at)}</T>
                </Card>
              )) : <T v="small" tone="ink2">لا تقييمات بعد. بعد استلام طلبك تستطيع تقييم المنتج من صفحة الطلب.</T>}
            </View>
          </View>

          {d.similar.length ? <ProductRail title="قد يعجبك أيضاً" items={d.similar} /> : null}
        </Animated.View>
      </ScrollView>

      <Footer>
        {out ? (
          p.allow_request ? <Button title="اطلب توفيره" icon="request" onPress={() => router.push({ pathname: '/request/new', params: { title: p.name } })} /> : <Button title="غير متوفر حالياً" disabled />
        ) : (
          <Row gap={10}>
            <Button flex title={inCart ? `أضف (${f.num(inCart)} في السلة)` : 'أضف للسلة'} icon="cartPlus" onPress={() => add(false)} />
            <Button title="اشترِ الآن" variant="ink" onPress={() => add(true)} />
          </Row>
        )}
      </Footer>
    </View>
  );
}
