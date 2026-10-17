import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import { qk } from './query';

/** عدد الإشعارات غير المقروءة للمسجّل */
export function useUnread() {
  const { uid } = useAuth();
  const { data } = useQuery({ queryKey: qk.notifications(uid ?? '-'), queryFn: () => api.notifications(uid!), enabled: !!uid });
  return (data ?? []).filter((n) => !n.read_at).length;
}
