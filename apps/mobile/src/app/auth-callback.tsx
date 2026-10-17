import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, T } from '@/components/ui';
import { exchangeCode } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/lib/theme';

/** عودة Google عبر الرابط raqeem://auth-callback?code=… (إن فُتح التطبيق من الرابط مباشرة) */
export default function AuthCallback() {
  const { c } = useTheme();
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [err, setErr] = useState<string | null>(error_description ?? null);
  useEffect(() => {
    if (!code) { if (!error_description) router.replace('/'); return; }
    exchangeCode(code).then(() => router.replace('/')).catch((e) => setErr(friendlyError(e, 'تعذّر إكمال تسجيل الدخول.')));
  }, [code, error_description]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 }}>
      {err ? (
        <>
          <T v="h2" center>تعذّر تسجيل الدخول</T>
          <T tone="ink2" center>{err}</T>
          <Button title="حاول مرة أخرى" onPress={() => router.replace('/login')} />
        </>
      ) : <ActivityIndicator color={c.accent} size="large" />}
    </View>
  );
}
