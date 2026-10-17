import { REQUEST_STATUS } from '@raqeem/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Bone, Skeleton } from '@/components/motion';
import { AppBar, Badge, Button, Card, Empty, ErrorState, Row, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { qk } from '@/lib/query';
import { useTheme } from '@/lib/theme';

export default function Requests() {
  const { c } = useTheme();
  const f = useFmt();
  const { uid } = useAuth();
  const q = useQuery({ queryKey: qk.requests(uid ?? '-'), queryFn: () => api.requests(uid!), enabled: !!uid });
  const list = q.data ?? [];
  return (
    <Screen header={<AppBar title="طلبات التوفير" />} onRefresh={() => q.refetch()} refreshing={q.isRefetching}
      footer={uid ? <Button title="اطلب منتجاً جديداً" icon="plus" onPress={() => router.push('/request/new')} /> : undefined}>
      {!uid ? (
        <Empty icon="user" title="سجّل الدخول" action="تسجيل الدخول" onAction={() => router.push('/login')} />
      ) : q.isLoading ? (
        <Skeleton style={{ gap: 12 }}>{[0, 1].map((i) => <Bone key={i} h={100} r={20} />)}</Skeleton>
      ) : q.error && !q.data ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty icon="request" title="لم تطلب شيئاً بعد" body="إن لم تجد منتجاً في المتجر اطلبه، ونبلغك هنا حين نوفّره." />
      ) : list.map((r) => {
        const st = REQUEST_STATUS[r.status];
        return (
          <Card key={r.id} style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T weight="bold" lines={2}>{r.title}</T>
                <T v="small" tone="ink2">{f.text(r.number)} · {f.ago(r.created_at)}</T>
              </View>
              <Badge tone={st.tone} label={st.label} />
            </Row>
            {r.details ? <T v="small" tone="ink2" lines={3}>{r.details}</T> : null}
            {r.staff_reply ? (
              <View style={{ backgroundColor: c.sunken, borderRadius: 12, padding: 10, gap: 2 }}>
                <T v="micro" tone="accent">رد المتجر</T>
                <T v="small">{r.staff_reply}</T>
              </View>
            ) : null}
            {r.product_id && (r.status === 'available' || r.status === 'fulfilled') ? (
              <Button small title="افتح المنتج" icon="forward" onPress={() => router.push(`/product/${r.product_id}`)} />
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
