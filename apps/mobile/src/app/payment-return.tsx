import { Redirect, useLocalSearchParams } from 'expo-router';

/** رابط العودة من بوابة الدفع إن فُتح التطبيق منه مباشرة */
export default function PaymentReturn() {
  const { order } = useLocalSearchParams<{ order?: string }>();
  return <Redirect href={order ? `/orders/${order}` : '/orders'} />;
}
