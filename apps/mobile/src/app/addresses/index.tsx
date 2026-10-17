import { governorateName } from '@raqeem/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { dialog } from '@/components/dialog';
import { Bone, Skeleton } from '@/components/motion';
import { toast } from '@/components/toast';
import { AppBar, Badge, Button, Card, Empty, ErrorState, Row, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { qk } from '@/lib/query';

export default function Addresses() {
  const f = useFmt();
  const { uid } = useAuth();
  const q = useQuery({ queryKey: qk.addresses(uid ?? '-'), queryFn: () => api.addresses(uid!), enabled: !!uid });
  const list = q.data ?? [];
  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast.show(ok, 'success'); q.refetch(); } catch (e) { toast.show(friendlyError(e), 'danger'); }
  };
  return (
    <Screen header={<AppBar title="عناويني" />} onRefresh={() => q.refetch()} refreshing={q.isRefetching}
      footer={<Button title="أضف عنواناً" icon="plus" onPress={() => router.push('/addresses/edit')} />}>
      {q.isLoading ? (
        <Skeleton style={{ gap: 12 }}>{[0, 1].map((i) => <Bone key={i} h={120} r={20} />)}</Skeleton>
      ) : q.error && !q.data ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty icon="mapPin" title="لا عناوين بعد" body="أضف عنوانك مرة واحدة، ويُختار تلقائياً عند كل طلب." />
      ) : list.map((a) => (
        <Card key={a.id} style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="bold">{a.label || governorateName(a.governorate)}</T>
            {a.is_default ? <Badge tone="accent" label="الافتراضي" /> : null}
          </Row>
          <T v="small" tone="ink2">{[governorateName(a.governorate), a.city, a.area, a.street].filter(Boolean).join('، ')}</T>
          {a.landmark ? <T v="small" tone="ink2">أقرب نقطة دالة: {a.landmark}</T> : null}
          <T v="small" tone="ink2">{a.recipient_name} · {f.phone(a.phone)}</T>
          <Row gap={8} style={{ marginTop: 4, flexWrap: 'wrap' }}>
            <Button small variant="secondary" icon="edit" title="تعديل" onPress={() => router.push({ pathname: '/addresses/edit', params: { id: a.id } })} />
            {!a.is_default ? <Button small variant="ghost" title="اجعله الافتراضي" onPress={() => run(() => api.setDefaultAddress(uid!, a.id), 'صار العنوان الافتراضي')} /> : null}
            <View style={{ flex: 1 }} />
            <Button small variant="ghost" icon="trash" title="حذف" onPress={async () => {
              if (await dialog.confirm({ title: 'حذف العنوان؟', confirm: 'حذف', danger: true })) run(() => api.deleteAddress(uid!, a.id), 'حُذف العنوان');
            }} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
