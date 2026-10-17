// اختيار المزوّد: PAYMENT_PROVIDER=wayl|mock، وإلا wayl إن وُجد WAYL_API_KEY، وإلا mock
import type { PaymentProvider } from './provider.ts';
import { wayl } from './wayl.ts';
import { mock } from './mock.ts';

export function provider(): PaymentProvider {
  const p = Deno.env.get('PAYMENT_PROVIDER');
  if (p === 'mock') return mock;
  if (p === 'wayl' || Deno.env.get('WAYL_API_KEY')) return wayl;
  return mock;
}

export type { PaymentProvider } from './provider.ts';
