import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api } from './api';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** يفتح بوابة الدفع ثم ينتظر تأكيد الخادم (webhook) حتى دقيقة */
export async function payOnline(orderId: string): Promise<boolean> {
  const redirect = Linking.createURL('payment-return', { queryParams: { order: orderId } });
  const r = await api.startPayment(orderId, redirect);
  if (r.paid) return true;
  if (!r.checkout_url) throw new Error('تعذّر فتح بوابة الدفع. جرّب لاحقاً من صفحة الطلب.');
  await WebBrowser.openAuthSessionAsync(r.checkout_url, redirect);
  for (let i = 0; i < 20; i++) {
    const s = await api.paymentStatus(orderId).catch(() => null);
    if (s === 'paid') return true;
    if (s === 'failed') return false;
    await wait(3000);
  }
  return false;
}
