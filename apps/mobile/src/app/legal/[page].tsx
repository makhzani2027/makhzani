import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { AppBar, Button, Screen, T } from '@/components/ui';
import { env } from '@/lib/env';

const PAGES: Record<string, { title: string; body: string }> = {
  privacy: { title: 'سياسة الخصوصية', body: 'نجمع فقط ما نحتاجه لإيصال طلبك: الاسم والهاتف والعنوان. لا نبيع بياناتك ولا نشاركها إلا مع المندوب لإيصال الطلب. تستطيع حذف حسابك وبياناتك في أي وقت من «حسابي».' },
  terms: { title: 'الشروط والأحكام', body: 'الأسعار والتوفر كما تظهر عند تأكيد الطلب. يتواصل المتجر معك لتأكيد الطلب قبل تجهيزه، ويمكنك إلغاؤه قبل بدء التجهيز.' },
  returns: { title: 'سياسة الإرجاع', body: 'افحص طلبك عند الاستلام. للإرجاع أو الاستبدال تواصل معنا خلال المدة المذكورة في الفاتورة، والمنتج بحالته الأصلية.' },
  licenses: { title: 'التراخيص', body: 'يستخدم التطبيق خط «ثمانية» بترخيص من مالكه، ومكتبات مفتوحة المصدر بتراخيصها. التفاصيل الكاملة في الموقع.' },
};

/** الصفحات القانونية: ملخص هنا، والنص الكامل من الموقع التعريفي */
export default function Legal() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const p = PAGES[page] ?? PAGES.terms;
  const url = `${env.siteUrl}/${PAGES[page] ? page : 'terms'}`;
  useEffect(() => { WebBrowser.warmUpAsync().catch(() => {}); return () => { WebBrowser.coolDownAsync().catch(() => {}); }; }, []);
  return (
    <Screen header={<AppBar title={p.title} />}>
      <T v="serif" tone="ink2">{p.body}</T>
      <Button title="اقرأ النص الكامل" icon="external" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(url).catch(() => {})} />
    </Screen>
  );
}
