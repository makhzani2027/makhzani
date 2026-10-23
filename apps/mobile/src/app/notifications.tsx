import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Bone, PressScale, Skeleton } from '@/components/motion';
import { AppBar, Empty, ErrorState, Icon, Screen, T, type IconName } from '@/components/ui';
import { api, type Notification } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { notificationRoute } from '@/lib/push';
import { qk, queryClient } from '@/lib/query';
import { useTheme } from '@/lib/theme';

const ICON: Record<Notification['kind'], IconName> = { order: 'package', request: 'request', promo: 'gift', system: 'info' };

export default function Notifications() {
  const { c } = useTheme();
  const f = useFmt();
  const { uid } = useAuth();
  const q = useQuery({ queryKey: qk.notifications(uid ?? '-'), queryFn: () => api.notifications(uid!), enabled: !!uid });
  const list = q.data ?? [];
  const unread = list.filter((n) => !n.read_at).map((n) => n.id);

  // فتح الصفحة يجعل الكل مقروءاً بعد لحظة (تبقى النقطة ظاهرة حتى يراها)
  useEffect(() => {
    if (!unread.length) return;
    const t = setTimeout(() => {
      api.markNotificationsRead(null).then(() => queryClient.invalidateQueries({ queryKey: qk.notifications(uid!) })).catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, [unread.length, uid]);

  return (
    <Screen header={<AppBar title="الإشعارات" />} onRefresh={() => q.refetch()} refreshing={q.isRefetching} gap={10}>
      {!uid ? (
        <Empty icon="bell" title="سجّل الدخول" body="لتصلك تحديثات طلباتك والعروض." action="تسجيل الدخول" onAction={() => router.push('/login')} />
      ) : q.isPending ? (
        <Skeleton style={{ gap: 10 }}>{[0, 1, 2].map((i) => <Bone key={i} h={72} r={16} />)}</Skeleton>
      ) : q.error && !q.data ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty icon="bell" title="لا إشعارات" body="هنا تصلك حالة طلباتك والعروض الجديدة." />
      ) : list.map((n) => (
        <PressScale key={n.id} onPress={() => { const to = notificationRoute(n.data); if (to !== '/notifications') router.push(to as never); }} accessibilityRole="button" scaleTo={0.99}
          style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.card, borderWidth: 1, borderColor: n.read_at ? c.line : c.accent }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: n.read_at ? c.sunken : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={ICON[n.kind] ?? 'bell'} size={20} color={n.read_at ? c.ink2 : c.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight={n.read_at ? 'medium' : 'bold'}>{n.title}</T>
            {n.body ? <T v="small" tone="ink2">{n.body}</T> : null}
            <T v="micro" tone="ink3">{f.ago(n.created_at)}</T>
          </View>
          {!n.read_at ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent, marginTop: 6 }} /> : null}
        </PressScale>
      ))}
    </Screen>
  );
}
