import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mark } from '@/components/brand';
import { toast } from '@/components/toast';
import { Button, IconButton, Notice, T, goBack } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isDemo } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { afterAuth } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';

export default function Login() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { uid, profile, signInWithGoogle, signInDemo } = useAuth();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  // بعد الدخول: إن لم يُكمل بياناته فالبوابة تنقله لإكمالها، وإلا نكمل إلى وجهته
  useEffect(() => {
    if (!waiting || !uid || !profile) return;
    if (profile.onboarded) router.replace(afterAuth.take() as never);
  }, [waiting, uid, profile]);

  const google = async () => {
    setBusy(true);
    afterAuth.set(next ?? null);
    try {
      const ok = await signInWithGoogle();
      if (ok) setWaiting(true);
    } catch (e) {
      toast.show(friendlyError(e, 'تعذّر تسجيل الدخول. أعد المحاولة.'), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }}>
      <View style={{ paddingHorizontal: 12 }}><IconButton name="close" label="إغلاق" plain onPress={goBack} /></View>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 12 }}>
        <Mark size={84} />
        <T v="h1" center>سجّل دخولك</T>
        <T tone="ink2" center style={{ maxWidth: 380 }}>لتتابع طلباتك، وتحفظ عناوينك وسلتك ومفضلتك على كل أجهزتك.</T>
      </View>
      <View style={{ paddingHorizontal: 24, gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        {isDemo ? (
          <>
            <Notice tone="info" icon="info" title="وضع العرض" body="التطبيق غير مربوط بخادم بعد. جرّبه بحساب تجريبي، والبيانات تبقى ما دام مفتوحاً." />
            <Button title="دخول تجريبي" icon="login" onPress={() => { afterAuth.set(next ?? null); signInDemo(); setWaiting(true); }} />
          </>
        ) : (
          <Button title="المتابعة بحساب Google" icon="login" loading={busy || waiting} onPress={google} />
        )}
        <T v="small" tone="ink3" center>
          بالمتابعة توافق على{' '}
          <T v="small" tone="accent" weight="bold" style={{ textDecorationLine: 'underline' }}>الشروط</T> و
          <T v="small" tone="accent" weight="bold" style={{ textDecorationLine: 'underline' }}>سياسة الخصوصية</T>
        </T>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
          <Button small variant="ghost" title="الشروط" onPress={() => router.push('/legal/terms')} />
          <Button small variant="ghost" title="الخصوصية" onPress={() => router.push('/legal/privacy')} />
        </View>
      </View>
    </View>
  );
}
