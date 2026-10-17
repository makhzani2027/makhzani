import { toLatinDigits } from '@raqeem/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { PressScale } from '@/components/motion';
import { toast } from '@/components/toast';
import { AppBar, Button, Empty, Icon, Input, Row, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { useTheme } from '@/lib/theme';

/** «اطلب منتجاً»: الاسم، التفاصيل، صورة (إلى الحاوية الخاصة requests/<uid>/)، رابط، الكمية، الميزانية */
export default function NewRequest() {
  const { c } = useTheme();
  const f = useFmt();
  const qc = useQueryClient();
  const { uid, onboarded } = useAuth();
  const params = useLocalSearchParams<{ title?: string }>();
  const [title, setTitle] = useState(params.title ?? '');
  const [details, setDetails] = useState('');
  const [link, setLink] = useState('');
  const [qty, setQty] = useState('1');
  const [budget, setBudget] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  if (!uid || !onboarded) {
    return (
      <Screen header={<AppBar title="اطلب منتجاً" />}>
        <Empty icon="request" title="سجّل الدخول لتطلب" body="نحتاج حسابك لنبلغك حين نوفّر طلبك." action="تسجيل الدخول" onAction={() => router.push({ pathname: '/login', params: { next: '/request/new' } })} />
      </Screen>
    );
  }

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.show(camera ? 'اسمح للتطبيق باستعمال الكاميرا من الإعدادات' : 'اسمح للتطبيق بالوصول للصور من الإعدادات', 'warning');
    const r = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]) setImage(r.assets[0].uri);
  };

  const titleErr = title.trim().length < 2 ? 'اكتب اسم المنتج' : null;
  const linkErr = link.trim() && !/^https?:\/\/\S+$/i.test(link.trim()) ? 'الرابط يبدأ بـ https://' : null;
  const n = (s: string) => { const v = Number(toLatinDigits(s).replace(/[^\d.]/g, '')); return s.trim() && Number.isFinite(v) ? v : null; };

  const send = async () => {
    setTried(true);
    if (titleErr || linkErr) return;
    setBusy(true);
    try {
      let key: string | null = null;
      if (image) {
        // صورة مصغّرة بصيغة webp قبل الرفع (أخف على الإنترنت)
        const small = await manipulateAsync(image, [{ resize: { width: 1280 } }], { compress: 0.8, format: SaveFormat.WEBP });
        const bytes = new Uint8Array(await (await fetch(small.uri)).arrayBuffer());
        key = await api.uploadRequestImage(uid, bytes, 'image/webp', 'webp');
      }
      const r = await api.createRequest({ title: title.trim(), details: details.trim() || null, image_key: key, link_url: link.trim() || null, qty: n(qty) ?? 1, budget: n(budget) });
      qc.invalidateQueries({ queryKey: ['requests'] });
      toast.show(`وصلنا طلبك ${f.text(r.number)}. نبلغك قريباً.`, 'success');
      router.replace('/requests');
    } catch (e) {
      toast.show(friendlyError(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<AppBar title="اطلب منتجاً" />} footer={<Button title="أرسل الطلب" icon="next" loading={busy} onPress={send} />}>
      <T tone="ink2">لم تجده في المتجر؟ صف لنا ما تريد ونحاول توفيره ونبلغك بالسعر.</T>
      <Input label="اسم المنتج" value={title} onChangeText={setTitle} placeholder="مثل: سماعة سوني WH-1000XM5" error={tried ? titleErr : null} maxLength={200} />
      <Input label="تفاصيل (اختياري)" value={details} onChangeText={setDetails} placeholder="اللون، المقاس، الموديل…" multiline maxLength={1000} />
      <View style={{ gap: 6 }}>
        <T v="small" weight="bold">صورة (اختياري)</T>
        {image ? (
          <View style={{ width: 140, height: 140 }}>
            <Image source={{ uri: image }} style={{ width: 140, height: 140, borderRadius: 16 }} contentFit="cover" />
            <PressScale onPress={() => setImage(null)} accessibilityLabel="إزالة الصورة" style={{ position: 'absolute', top: 6, end: 6, width: 30, height: 30, borderRadius: 15, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={16} color={c.ink} />
            </PressScale>
          </View>
        ) : (
          <Row gap={10}>
            <Button flex variant="secondary" icon="camera" title="الكاميرا" onPress={() => pick(true)} />
            <Button flex variant="secondary" icon="image" title="المعرض" onPress={() => pick(false)} />
          </Row>
        )}
      </View>
      <Input label="رابط (اختياري)" value={link} onChangeText={setLink} placeholder="https://" keyboardType="url" autoCapitalize="none" ltr icon="link" error={tried ? linkErr : null} />
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Input label="الكمية" value={qty} onChangeText={setQty} keyboardType="number-pad" ltr /></View>
        <View style={{ flex: 1 }}><Input label={`الميزانية (${f.currencyLabel})`} value={budget} onChangeText={setBudget} keyboardType="number-pad" placeholder="اختياري" ltr /></View>
      </Row>
    </Screen>
  );
}
