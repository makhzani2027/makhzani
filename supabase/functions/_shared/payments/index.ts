// اختيار المزوّد: mock فقط عند PAYMENT_PROVIDER=mock صراحةً، وإلا wayl دائماً.
// (لا نرجع إلى mock عند غياب أسرار Wayl: صفحته وسرّه الافتراضي يسمحان لأي أحد بتعليم طلبه «مدفوعاً» مجاناً)
import type { PaymentProvider } from './provider.ts';
import { wayl } from './wayl.ts';
import { mock } from './mock.ts';

export function provider(): PaymentProvider {
  return Deno.env.get('PAYMENT_PROVIDER') === 'mock' ? mock : wayl;
}

export type { PaymentProvider } from './provider.ts';
