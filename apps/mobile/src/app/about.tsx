import { telLink, whatsappLink } from '@raqeem/shared';
import * as Linking from 'expo-linking';
import { View } from 'react-native';
import { Logo } from '@/components/brand';
import { AppBar, Button, Card, Divider, ListItem, Screen, T } from '@/components/ui';
import { appVersion, buildNumber } from '@/lib/env';
import { useFmt } from '@/lib/format';
import { useSettings } from '@/lib/query';

export default function About() {
  const f = useFmt();
  const store = useSettings().data?.store;
  const wa = whatsappLink(store?.whatsapp ?? store?.phone);
  const tel = telLink(store?.phone);
  const socials = Object.entries(store?.socials ?? {}).filter(([, v]) => !!v) as [string, string][];
  const NAMES: Record<string, string> = { instagram: 'إنستغرام', facebook: 'فيسبوك', tiktok: 'تيك توك', telegram: 'تيليغرام' };
  return (
    <Screen header={<AppBar title="عن المتجر" />}>
      <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
        <Logo size={34} />
        <T tone="ink2" center>{store?.name ?? 'رقيم'}{store?.legal_name ? ` — ${store.legal_name}` : ''}</T>
      </View>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {store?.address ? <ListItem icon="mapPin" title="العنوان" subtitle={store.address} chevron={!!store.map_url} onPress={store.map_url ? () => Linking.openURL(store.map_url!) : undefined} /> : null}
        {store?.hours ? <><Divider /><ListItem icon="clock" title="أوقات الدوام" subtitle={f.text(store.hours)} chevron={false} /></> : null}
        {tel ? <><Divider /><ListItem icon="phone" title="الهاتف" subtitle={f.phone(store?.phone)} onPress={() => Linking.openURL(tel)} /></> : null}
        {store?.email ? <><Divider /><ListItem icon="mail" title="البريد" subtitle={store.email} onPress={() => Linking.openURL(`mailto:${store.email}`)} /></> : null}
        {socials.map(([k, v]) => <View key={k}><Divider /><ListItem icon="globe" title={NAMES[k] ?? k} onPress={() => Linking.openURL(v)} /></View>)}
      </Card>
      {wa ? <Button title="راسلنا على واتساب" icon="whatsapp" variant="ink" onPress={() => Linking.openURL(wa)} /> : null}
      <T v="micro" tone="ink3" center>النسخة {f.text(appVersion)} ({f.num(buildNumber)}) · صُنع في العراق</T>
    </Screen>
  );
}
