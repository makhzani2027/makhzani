import { isValidIraqiPhone, normalizeIraqiPhone, toLatinDigits } from '@raqeem/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { GovernorateField } from '@/components/governorate';
import { toast } from '@/components/toast';
import { AppBar, Button, Input, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { afterAuth } from '@/lib/hooks';

/** بعد أول دخول بـ Google: الاسم والهاتف العراقي والمحافظة (upsert_my_profile). ومن «حسابي» للتعديل */
export default function CompleteProfile() {
  const { profile, refreshProfile, signOut } = useAuth();
  const editing = !!profile?.onboarded;
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ? `0${profile.phone.slice(4)}` : '');
  const [gov, setGov] = useState<string | null>(profile?.governorate ?? null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameErr = name.trim().split(/\s+/).length < 2 || name.trim().length < 4 ? 'اكتب اسمك الثنائي على الأقل' : null;
  const phoneErr = !isValidIraqiPhone(toLatinDigits(phone)) ? 'رقم عراقي يبدأ بـ 07 مثل 07701234567' : null;
  const govErr = !gov ? 'اختر محافظتك' : null;

  const save = async () => {
    setTried(true);
    if (nameErr || phoneErr || govErr) return;
    setBusy(true);
    try {
      await api.upsertProfile({ full_name: name.trim(), phone: normalizeIraqiPhone(toLatinDigits(phone))!, governorate: gov! });
      await refreshProfile();
      toast.show(editing ? 'حُفظت بياناتك' : 'أهلاً بك في رقيم', 'success');
      if (editing) router.back();
      else router.replace(afterAuth.take() as never);
    } catch (e) {
      toast.show(friendlyError(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<AppBar title={editing ? 'بياناتي' : 'أكمل بياناتك'} back={editing} />}
      footer={<Button title={editing ? 'حفظ' : 'متابعة'} loading={busy} onPress={save} />}>
      {!editing ? <T tone="ink2">نحتاج اسمك ورقمك ليتواصل معك المندوب عند التوصيل. لا نشارك رقمك مع أحد.</T> : null}
      <Input label="الاسم الكامل" value={name} onChangeText={setName} placeholder="مثل: علي حسين" autoComplete="name" error={tried ? nameErr : null} icon="user" />
      <Input label="رقم الهاتف" value={phone} onChangeText={setPhone} placeholder="07XX XXX XXXX" keyboardType="phone-pad" autoComplete="tel" ltr icon="phone"
        error={tried ? phoneErr : null} hint="رقم عراقي (زين، آسيا، كورك)" maxLength={14} />
      <GovernorateField value={gov} onChange={setGov} error={tried ? govErr : null} />
      {!editing ? <Button variant="ghost" title="ليس الآن — تسجيل الخروج" onPress={() => { signOut(); router.replace('/'); }} /> : null}
    </Screen>
  );
}
