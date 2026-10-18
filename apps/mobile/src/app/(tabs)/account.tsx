import { telLink, whatsappLink } from '@raqeem/shared';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Mark } from '@/components/brand';
import { dialog } from '@/components/dialog';
import { toast } from '@/components/toast';
import { Button, Card, Divider, ListItem, PageTitle, Screen, Segmented, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { appVersion, isDemo } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { useUnread } from '@/lib/hooks';
import { unregisterPush } from '@/lib/push';
import { useSettings } from '@/lib/query';
import { useTheme, type ThemeMode } from '@/lib/theme';

function Group({ children }: { children: React.ReactNode }) {
  return <Card padded={false} style={{ overflow: 'hidden' }}>{children}</Card>;
}

export default function Account() {
  const { c, mode, setMode } = useTheme();
  const f = useFmt();
  const { uid, profile, email, signOut } = useAuth();
  const store = useSettings().data?.store;
  const unread = useUnread();
  const [busy, setBusy] = useState(false);
  const wa = whatsappLink(store?.whatsapp ?? store?.phone);
  const tel = telLink(store?.phone);

  const doSignOut = async () => {
    if (!(await dialog.confirm({ title: 'تسجيل الخروج؟', message: 'سلتك ومفضلتك محفوظة في حسابك وتعود عند الدخول.', confirm: 'خروج' }))) return;
    if (uid) await unregisterPush(uid).catch(() => {});
    await signOut();
    toast.show('خرجت من حسابك');
  };

  const doDelete = async () => {
    const t = await dialog.prompt({
      title: 'حذف الحساب نهائياً',
      message: 'تُمسح بياناتك الشخصية وعناوينك ومفضلتك. تبقى فواتير الطلبات السابقة بلا اسمك. لا يمكن التراجع.\nاكتب «احذف» للتأكيد.',
      confirm: 'احذف حسابي', danger: true, requireText: 'احذف', placeholder: 'احذف',
    });
    if (t === null) return;
    setBusy(true);
    try {
      await api.deleteAccount();
      await signOut();
      toast.show('حُذف حسابك. شكراً لأنك كنت معنا.', 'success');
    } catch (e) {
      toast.show(friendlyError(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<PageTitle title="حسابي" />}>
      {uid ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <T v="h2" color={c.accentSoftInk}>{(profile?.full_name ?? 'ز').trim().charAt(0)}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T v="h3" lines={1}>{profile?.full_name || 'زبون رقيم'}</T>
            <T v="small" tone="ink2" lines={1} style={{ writingDirection: 'ltr', textAlign: 'right' }}>
              {profile?.phone ? f.phone(profile.phone) : email ?? ''}
            </T>
          </View>
          <Button small variant="secondary" title="تعديل" onPress={() => router.push('/complete-profile')} />
        </Card>
      ) : (
        <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 24 }}>
          <Mark size={52} />
          <T v="h3" center>أهلاً بك في رقيم</T>
          <T v="small" tone="ink2" center>سجّل الدخول لتتابع طلباتك وتحفظ عناوينك وسلتك.</T>
          <Button title="تسجيل الدخول" icon="login" onPress={() => router.push('/login')} style={{ alignSelf: 'stretch' }} />
        </Card>
      )}

      {uid ? (
        <Group>
          <ListItem icon="package" title="طلباتي" onPress={() => router.push('/orders')} />
          <Divider />
          <ListItem icon="request" title="طلبات التوفير" subtitle="منتجات طلبت توفيرها" onPress={() => router.push('/requests')} />
          <Divider />
          <ListItem icon="mapPin" title="عناويني" onPress={() => router.push('/addresses')} />
          <Divider />
          <ListItem icon="bell" title="الإشعارات" subtitle={unread ? `${f.num(unread)} غير مقروء` : null} onPress={() => router.push('/notifications')} />
        </Group>
      ) : null}

      <Card style={{ gap: 10 }}>
        <T weight="bold">المظهر</T>
        <Segmented<ThemeMode>
          options={[{ key: 'system', label: 'تلقائي' }, { key: 'light', label: 'فاتح' }, { key: 'dark', label: 'داكن' }]}
          value={mode}
          onChange={setMode}
        />
      </Card>

      <Group>
        {wa ? <ListItem icon="whatsapp" title="راسلنا على واتساب" onPress={() => Linking.openURL(wa)} /> : null}
        {wa ? <Divider /> : null}
        {tel ? <ListItem icon="phone" title="اتصل بنا" subtitle={f.phone(store?.phone)} onPress={() => Linking.openURL(tel)} /> : null}
        {tel ? <Divider /> : null}
        <ListItem icon="store" title="عن المتجر" onPress={() => router.push('/about')} />
        <Divider />
        <ListItem icon="shield" title="سياسة الخصوصية" onPress={() => router.push('/legal/privacy')} />
        <Divider />
        <ListItem icon="fileText" title="الشروط والأحكام" onPress={() => router.push('/legal/terms')} />
        <Divider />
        <ListItem icon="return" title="سياسة الإرجاع" onPress={() => router.push('/legal/returns')} />
        <Divider />
        <ListItem icon="info" title="التراخيص" onPress={() => router.push('/legal/licenses')} />
      </Group>

      {uid ? (
        <Group>
          <ListItem icon="logout" title="تسجيل الخروج" chevron={false} onPress={doSignOut} />
          <Divider />
          <ListItem icon="trash" title={busy ? 'يحذف…' : 'حذف الحساب'} danger chevron={false} onPress={busy ? undefined : doDelete} />
        </Group>
      ) : null}

      <T v="micro" tone="ink3" center>رقيم · النسخة {f.text(appVersion)}{isDemo ? ' · وضع العرض' : ''}</T>
    </Screen>
  );
}
