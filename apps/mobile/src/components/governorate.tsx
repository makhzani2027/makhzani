import { GOVERNORATES, governorateName } from '@raqeem/shared';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { PressScale } from './motion';
import { Sheet } from './sheet';
import { Divider, Icon, Radio, T } from './ui';

/** حقل اختيار المحافظة (ورقة سفلية بالقائمة كاملة) */
export function GovernorateField({ value, onChange, label = 'المحافظة', error, note }: {
  value: string | null; onChange: (k: string) => void; label?: string; error?: string | null;
  /** نص صغير بجانب كل محافظة (أجرة التوصيل) — null = غير متاح */
  note?: (k: string) => string | null | undefined;
}) {
  const { c, tone } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T v="small" weight="bold">{label}</T>
      <PressScale onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? governorateName(value) : 'اختر'}`}
        style={{ minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: error ? tone.danger.ink : c.line, backgroundColor: c.card, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="mapPin" size={20} color={c.ink3} />
        <T style={{ flex: 1 }} tone={value ? 'ink' : 'ink3'}>{value ? governorateName(value) : 'اختر المحافظة'}</T>
        <Icon name="chevronDown" size={18} color={c.ink3} />
      </PressScale>
      {error ? <T v="small" color={tone.danger.ink}>{error}</T> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title="اختر المحافظة">
        <ScrollView style={{ maxHeight: 460 }}>
          {GOVERNORATES.map((g, i) => {
            const n = note?.(g.key);
            return (
              <View key={g.key}>
                {i ? <Divider /> : null}
                <PressScale onPress={() => { onChange(g.key); setOpen(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }} accessibilityRole="radio" accessibilityState={{ selected: value === g.key }}>
                  <Radio on={value === g.key} />
                  <T style={{ flex: 1 }} weight={value === g.key ? 'bold' : 'regular'}>{g.name}</T>
                  {n !== undefined ? <T v="small" tone={n ? 'ink2' : 'ink3'}>{n ?? 'غير متاح'}</T> : null}
                </PressScale>
              </View>
            );
          })}
        </ScrollView>
      </Sheet>
    </View>
  );
}
