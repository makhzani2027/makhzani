import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { isDemo, isExpoGo } from './env';
import { storage } from './storage';

/**
 * الإشعارات البعيدة (FCM مباشرة، بلا حساب Expo).
 * مكتبة expo-notifications لا تعمل في Expo Go على أندرويد منذ SDK 53 ومجرد استيرادها يوقفه،
 * لذلك تُحمَّل عند الحاجة فقط، ولا شيء يحدث في Expo Go أو الويب أو وضع العرض. تُجرَّب في ملف APK.
 */
let cached: typeof NotificationsModule | null | undefined;
function N(): typeof NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (isExpoGo || Platform.OS === 'web' || isDemo) return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as typeof NotificationsModule;
    cached.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  } catch {
    cached = null;
  }
  return cached;
}

const TOKEN_KEY = 'raqeem.push.token';

/** يطلب الإذن ويسجل رمز الجهاز في push_tokens. يعيد سبب الفشل بدل الرمي */
export async function registerPush(uid: string): Promise<'ok' | 'unsupported' | 'denied' | 'not-configured' | 'error'> {
  const n = N();
  if (!n) return 'unsupported';
  try {
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync('orders', { name: 'حالة الطلبات', importance: n.AndroidImportance.HIGH });
      await n.setNotificationChannelAsync('promo', { name: 'العروض', importance: n.AndroidImportance.DEFAULT });
    }
    let { status } = await n.getPermissionsAsync();
    if (status !== 'granted') status = (await n.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    let token: string;
    try {
      token = String((await n.getDevicePushTokenAsync()).data);
    } catch {
      return 'not-configured'; // لم يُضف google-services.json للبناء
    }
    await api.savePushToken(uid, token, Platform.OS === 'ios' ? 'ios' : 'android');
    await storage.set(TOKEN_KEY, token);
    return 'ok';
  } catch {
    return 'error';
  }
}

/** قبل الخروج: نحذف رمز هذا الجهاز فقط حتى لا تصل إشعارات الحساب لمن يستعمل الهاتف بعده */
export async function unregisterPush(uid: string) {
  const token = await storage.get<string>(TOKEN_KEY);
  if (token) await api.deletePushToken(uid, token).catch(() => {});
  await storage.remove(TOKEN_KEY);
}

/** المسار المناسب لبيانات الإشعار ({order_id} / {request_id} / {product_slug} / {url}) */
export function notificationRoute(d: Record<string, unknown>): string {
  if (typeof d.order_id === 'string') return `/orders/${d.order_id}`;
  if (typeof d.request_id === 'string') return '/requests';
  if (typeof d.product_slug === 'string') return `/product/${d.product_slug}`;
  if (typeof d.product_id === 'string') return `/product/${d.product_id}`;
  if (typeof d.category_slug === 'string') return `/category/${d.category_slug}`;
  if (typeof d.url === 'string' && d.url.startsWith('/')) return d.url;
  return '/notifications';
}

type Resp = NotificationsModule.NotificationResponse;
let lastHandled = '';
function dataOf(res: Resp): Record<string, unknown> | null {
  const id = `${res.notification.request.identifier}|${res.notification.date}`;
  if (id === lastHandled) return null;
  lastHandled = id;
  const req = res.notification.request;
  const remote = (req.trigger as { remoteMessage?: { data?: Record<string, unknown> } } | null)?.remoteMessage?.data;
  return (req.content.data && Object.keys(req.content.data).length ? req.content.data : remote) ?? null;
}

/** الضغط على إشعار (التطبيق مفتوح/بالخلفية، أو الإشعار الذي فتحه وهو مغلق) */
export function onNotificationTap(cb: (data: Record<string, unknown>) => void): () => void {
  const n = N();
  if (!n) return () => {};
  const sub = n.addNotificationResponseReceivedListener((r) => {
    const d = dataOf(r);
    if (d) cb(d);
  });
  n.getLastNotificationResponseAsync().then((r) => {
    const d = r ? dataOf(r) : null;
    if (d) cb(d);
  }).catch(() => {});
  return () => sub.remove();
}
