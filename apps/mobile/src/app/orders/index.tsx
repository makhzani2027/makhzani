import { isOpen, ORDER_STATUS } from '@raqeem/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ProductImage } from '@/components/brand';
import { Bone, Skeleton } from '@/components/motion';
import { AppBar, Badge, Card, Empty, ErrorState, Row, Screen, Segmented, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { qk } from '@/lib/query';
import { useTheme } from '@/lib/theme';

export default function Orders() {
  const { c } = useTheme();
  const f = useFmt();
  const { uid } = useAuth();
  const [tab, setTab] = useState<'open' | 'past'>('open');
  const q = useQuery({ queryKey: qk.orders(uid ?? '-'), queryFn: () => api.orders(uid!), enabled: !!uid });
  const all = q.data ?? [];
  const list = all.filter((o) => (tab === 'open' ? isOpen(o.status) : !isOpen(o.status)));

  return (
    <Screen header={<AppBar title="طلباتي" />} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Segmented options={[{ key: 'open', label: 'الحالية' }, { key: 'past', label: 'السابقة' }]} value={tab} onChange={setTab} />
      {!uid ? (
        <Empty icon="user" title="سجّل الدخول" body="لترى طلباتك وتتابعها." action="تسجيل الدخول" onAction={() => router.push('/login')} />
      ) : q.isLoading ? (
        <Skeleton style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Bone key={i} h={110} r={20} />)}</Skeleton>
      ) : q.error && !q.data ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty icon="package" title={tab === 'open' ? 'لا طلبات جارية' : 'لا طلبات سابقة'} body="عندما تطلب من المتجر تجد طلبك هنا وتتابع حالته." action="تسوّق الآن" onAction={() => router.navigate('/')} />
      ) : list.map((o) => {
        const st = ORDER_STATUS[o.status];
        return (
          <Card key={o.id} onPress={() => router.push(`/orders/${o.id}`)} accessibilityLabel={`الطلب ${o.number}`} style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <T weight="bold">{f.doc(o.number)}</T>
                <T v="small" tone="ink2">{f.date(o.created_at, true)}</T>
              </View>
              <Badge tone={st.tone} label={o.status === 'pending' ? 'بانتظار التأكيد' : st.label} />
            </Row>
            <Row gap={8}>
              {o.items.slice(0, 4).map((it) => (
                <View key={it.id} style={{ width: 48, height: 48, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
                  <ProductImage imageKey={it.image_key} width={48} radiusPx={12} iconSize={20} />
                </View>
              ))}
              {o.items.length > 4 ? <T v="small" tone="ink2">+{f.num(o.items.length - 4)}</T> : null}
              <View style={{ flex: 1 }} />
              <T weight="black" tabular>{f.money(o.total)}</T>
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
