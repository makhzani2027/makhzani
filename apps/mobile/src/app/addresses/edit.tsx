import { isValidIraqiPhone, normalizeIraqiPhone, toLatinDigits } from '@raqeem/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GovernorateField } from '@/components/governorate';
import { toast } from '@/components/toast';
import { AppBar, Button, Chip, Input, Row, Screen, T, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { addressPick } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { qk, useZones } from '@/lib/query';

const LABELS = ['البيت', 'العمل', 'بيت الأهل'];

/** عنوان عراقي: المحافظة، المدينة، المنطقة، الشارع، وأقرب نقطة دالة (أساسية للمندوب) */
export default function EditAddress() {
  const f = useFmt();
  const qc = useQueryClient();
  const { uid, profile } = useAuth();
  const { id, pick } = useLocalSearchParams<{ id?: string; pick?: string }>();
  const zones = useZones().data ?? [];
  const list = useQuery({ queryKey: qk.addresses(uid ?? '-'), queryFn: () => api.addresses(uid!), enabled: !!uid });
  const existing = list.data?.find((a) => a.id === id);
  const [label, setLabel] = useState<string>('البيت');
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ? `0${profile.phone.slice(4)}` : '');
  const [gov, setGov] = useState<string | null>(profile?.governorate ?? null);
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setLabel(existing.label ?? ''); setName(existing.recipient_name); setPhone(`0${existing.phone.replace(/^\+964/, '')}`);
    setGov(existing.governorate); setCity(existing.city ?? ''); setArea(existing.area ?? ''); setStreet(existing.street ?? '');
    setLandmark(existing.landmark ?? ''); setIsDefault(existing.is_default);
  }, [existing]);

  const errs = {
    name: name.trim().length < 3 ? 'اكتب اسم المستلم' : null,
    phone: !isValidIraqiPhone(toLatinDigits(phone)) ? 'رقم عراقي يبدأ بـ 07' : null,
    gov: !gov ? 'اختر المحافظة' : !zones.some((z) => z.governorate === gov) && zones.length ? 'التوصيل غير متاح لهذه المحافظة حالياً' : null,
    area: !area.trim() ? 'اكتب المنطقة أو الحي' : null,
    landmark: landmark.trim().length < 3 ? 'أقرب نقطة دالة تساعد المندوب كثيراً' : null,
  };

  const save = async () => {
    setTried(true);
    if (Object.values(errs).some(Boolean) || !uid) return;
    setBusy(true);
    try {
      const saved = await api.saveAddress(uid, existing?.id ?? null, {
        label: label.trim() || null, recipient_name: name.trim(), phone: normalizeIraqiPhone(toLatinDigits(phone))!, governorate: gov!,
        city: city.trim() || null, area: area.trim() || null, street: street.trim() || null, landmark: landmark.trim() || null,
        is_default: isDefault || !list.data?.length,
      });
      await qc.invalidateQueries({ queryKey: ['addresses'] });
      if (pick) addressPick.set(saved.id);
      toast.show('حُفظ العنوان', 'success');
      router.back();
    } catch (e) {
      toast.show(friendlyError(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<AppBar title={existing ? 'تعديل العنوان' : 'عنوان جديد'} />} footer={<Button title={pick ? 'حفظ واستعمال العنوان' : 'حفظ العنوان'} loading={busy} onPress={save} />}>
      <View style={{ gap: 8 }}>
        <T v="small" weight="bold">اسم العنوان</T>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>{LABELS.map((l) => <Chip key={l} small label={l} active={label === l} onPress={() => setLabel(l)} />)}</Row>
      </View>
      <GovernorateField value={gov} onChange={setGov} error={tried ? errs.gov : null}
        note={zones.length ? (k) => { const z = zones.find((x) => x.governorate === k); return z ? (z.fee ? f.money(z.fee) : 'مجاني') : null; } : undefined} />
      <Input label="المدينة أو القضاء" value={city} onChangeText={setCity} placeholder="مثل: الكرادة" />
      <Input label="المنطقة / الحي" value={area} onChangeText={setArea} placeholder="مثل: حي الوحدة، محلة ٩٠٥" error={tried ? errs.area : null} />
      <Input label="الشارع والزقاق والدار (اختياري)" value={street} onChangeText={setStreet} placeholder="زقاق ١٢، دار ٧" />
      <Input label="أقرب نقطة دالة" value={landmark} onChangeText={setLandmark} placeholder="مثل: قرب جامع الرحمن، مقابل صيدلية الشفاء" icon="mapPin" error={tried ? errs.landmark : null} />
      <Input label="اسم المستلم" value={name} onChangeText={setName} icon="user" error={tried ? errs.name : null} />
      <Input label="هاتف المستلم" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XX XXX XXXX" ltr icon="phone" error={tried ? errs.phone : null} maxLength={14} />
      <Toggle label="اجعله العنوان الافتراضي" value={isDefault} onChange={setIsDefault} />
    </Screen>
  );
}
