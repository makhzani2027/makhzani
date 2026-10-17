// واجهة مزوّد الدفع الإلكتروني. المبلغ يأتي دائماً من قاعدة البيانات (orders.total) لا من التطبيق.

export interface CreateLinkInput {
  /** معرّف محاولة الدفع عندنا (payment_transactions.id) — يُرسل للمزوّد كمرجع */
  transactionId: string;
  orderNumber: string;
  amount: number; // بالدينار
  currency: 'IQD';
  customerName: string | null;
  customerPhone: string | null;
  /** يعود إليه الزبون بعد الدفع */
  redirectUrl: string;
  /** يستدعيه المزوّد بنتيجة الدفع */
  webhookUrl: string;
}

export interface CreatedLink {
  providerRef: string;
  checkoutUrl: string;
  raw: Record<string, unknown>;
}

export type WebhookStatus = 'paid' | 'failed' | 'pending' | 'cancelled';

export interface WebhookEvent {
  /** مرجعنا (transactionId) إن أعاده المزوّد */
  transactionId: string | null;
  providerRef: string | null;
  status: WebhookStatus;
  amount: number | null;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  name: 'wayl' | 'mock';
  createLink(input: CreateLinkInput): Promise<CreatedLink>;
  /** يتحقق من توقيع الطلب الوارد ويحلّله؛ يرمي إن كان التوقيع غير صحيح */
  parseWebhook(req: Request, rawBody: string): Promise<WebhookEvent>;
}
