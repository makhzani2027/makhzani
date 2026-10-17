import { layout, radius, type Tone } from '@raqeem/shared';
import { router } from 'expo-router';
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFmt } from '@/lib/format';
import { fonts, useTheme } from '@/lib/theme';
import { Icon, type IconName } from './icon';
import { ease, KeyboardView, PressScale, tap } from './motion';
import { T } from './text';

export { T } from './text';
export { Icon, type IconName } from './icon';

export const GUTTER = 20;

// ---------------------------------------------------------------- الشاشة

/** عمود المحتوى: على الأجهزة اللوحية أقصى عرض ٧٢٠ في الوسط */
export const contentColumn: ViewStyle = { width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' };

export function Screen({
  children, scroll = true, padded = true, onRefresh, refreshing, footer, header, style, gap = 16,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** شريط ثابت أسفل الشاشة (أزرار الإجراء) */
  footer?: ReactNode;
  /** شريط ثابت أعلى الشاشة (يبقى عند التمرير) */
  header?: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const inner: StyleProp<ViewStyle> = [contentColumn, padded ? { paddingHorizontal: GUTTER } : null];
  return (
    <KeyboardView style={{ backgroundColor: c.bg }} bottomInset={insets.bottom}>
      <View style={{ paddingTop: insets.top, backgroundColor: c.bg }}>{header}</View>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[inner, { gap, paddingTop: header ? 4 : 12, paddingBottom: footer ? 24 : insets.bottom + 32 }, style]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.card} /> : undefined}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner, style]}>{children}</View>
      )}
      {footer ? <Footer>{footer}</Footer> : null}
    </KeyboardView>
  );
}

/** شريط الإجراءات الثابت أسفل الشاشة */
export function Footer({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 4 }}>
      <View style={[contentColumn, { paddingHorizontal: GUTTER, gap: 10 }]}>{children}</View>
    </View>
  );
}

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** رأس الشاشات الداخلية: رجوع + عنوان + إجراءات */
export function AppBar({ title, subtitle, right, back = true, onBack }: {
  title?: string; subtitle?: string; right?: ReactNode; back?: boolean; onBack?: () => void;
}) {
  return (
    <View style={[contentColumn, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 56 }]}>
      {back ? <IconButton name="back" label="رجوع" onPress={onBack ?? goBack} plain /> : <View style={{ width: 8 }} />}
      <View style={{ flex: 1 }}>
        {title ? <T v="h3" size={19} lines={1} weight="bold">{title}</T> : null}
        {subtitle ? <T v="small" tone="ink2" lines={1} style={{ marginTop: -4 }}>{subtitle}</T> : null}
      </View>
      {right ? <Row gap={6}>{right}</Row> : null}
    </View>
  );
}

/** عنوان كبير لصفحات التبويبات */
export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={[contentColumn, { paddingHorizontal: GUTTER, paddingTop: 8, gap: 0 }]}>
      <Row style={{ justifyContent: 'space-between', minHeight: 52 }}>
        <T v="h1" lines={1} style={{ flexShrink: 1 }}>{title}</T>
        {right ? <Row gap={8}>{right}</Row> : null}
      </Row>
      {subtitle ? <T v="small" tone="ink2" style={{ marginTop: -6 }}>{subtitle}</T> : null}
    </View>
  );
}

// ---------------------------------------------------------------- التخطيط

export function Row({ children, style, gap = 12 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider({ dashed, style }: { dashed?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  // خطوط الدفتر: فاصل متقطع رفيع في الملخصات والإيصالات
  return <View style={[dashed ? { borderTopWidth: 1, borderStyle: 'dashed', borderColor: c.lineStrong } : { height: 1, backgroundColor: c.line }, style]} />;
}

export function Card({ children, style, onPress, padded = true, accessibilityLabel }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean; accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const base: ViewStyle = { backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, padding: padded ? 16 : 0 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[base, style]}>
      {children}
    </PressScale>
  );
}

export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Row style={[{ justifyContent: 'space-between' }, style]}>
      <T v="h2" size={21} style={{ flexShrink: 1 }} lines={1}>{title}</T>
      {action ? (
        <PressScale onPress={onAction} hitSlop={10} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <T v="small" weight="bold" tone="accent">{action}</T>
          <AccentIcon name="forward" size={16} />
        </PressScale>
      ) : null}
    </Row>
  );
}

function AccentIcon({ name, size }: { name: IconName; size: number }) {
  const { c } = useTheme();
  return <Icon name={name} size={size} color={c.accent} strokeWidth={2} />;
}

// ---------------------------------------------------------------- الأزرار

export function IconButton({ name, label, onPress, size = 44, badge, plain, filled, color, iconFill }: {
  name: IconName; label: string; onPress?: () => void; size?: number; badge?: number; plain?: boolean; filled?: boolean; color?: string; iconFill?: string;
}) {
  const { c } = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      scaleTo={0.9}
      style={{
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: filled ? c.accent : plain ? 'transparent' : c.card,
        borderWidth: plain || filled ? 0 : 1, borderColor: c.line,
      }}>
      <Icon name={name} size={Math.round(size * 0.5)} color={filled ? c.accentInk : color ?? c.ink} fill={iconFill} />
      {badge ? <CountBadge n={badge} style={{ position: 'absolute', top: -3, end: -3 }} /> : null}
    </PressScale>
  );
}

export function CountBadge({ n, style }: { n: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const { num } = useFmt();
  return (
    <View style={[{
      minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 5, backgroundColor: c.accent,
      alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.bg,
    }, style]}>
      <T size={10.5} weight="bold" color={c.accentInk} style={{ lineHeight: 14, paddingBottom: 0 }}>{n > 99 ? `+${num(99)}` : num(n)}</T>
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink' | 'soft';

export function Button({
  title, onPress, variant = 'primary', icon, loading, disabled, style, small, flex,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  flex?: boolean;
}) {
  const { c, tone } = useTheme();
  const bg = { primary: c.accent, secondary: c.card, ghost: 'transparent', danger: tone.danger.bg, ink: c.ink, soft: c.accentSoft }[variant];
  const fg = { primary: c.accentInk, secondary: c.ink, ghost: c.accent, danger: tone.danger.ink, ink: c.bg, soft: c.accentSoftInk }[variant];
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      onPress={onPress}
      haptic
      disabled={disabled || loading}
      style={[{
        height: small ? 40 : 52,
        paddingHorizontal: small ? 14 : 20,
        borderRadius: radius.pill,
        backgroundColor: bg,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: c.lineStrong,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: disabled ? 0.45 : 1,
      }, flex ? { flex: 1 } : null, style]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon} size={small ? 18 : 20} color={fg} strokeWidth={2} /> : null}
          <T weight="bold" size={small ? 14 : 16} color={fg} lines={1}>{title}</T>
        </>
      )}
    </PressScale>
  );
}

// ---------------------------------------------------------------- الإدخال

export const Input = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & { label?: string; hint?: string; error?: string | null; icon?: IconName; ltr?: boolean; prefix?: string }>(
  function Input({ label, hint, error, icon, ltr, prefix, style, ...props }, ref) {
    const { c, tone } = useTheme();
    return (
      <View style={{ gap: 6 }}>
        {label ? <T v="small" weight="bold">{label}</T> : null}
        <View style={{
          flexDirection: 'row', alignItems: props.multiline ? 'flex-start' : 'center', gap: 8,
          minHeight: 52, borderRadius: radius.sm, borderWidth: 1, borderColor: error ? tone.danger.ink : c.line,
          backgroundColor: c.card, paddingHorizontal: 14,
        }}>
          {icon ? <Icon name={icon} size={20} color={c.ink3} /> : null}
          {prefix ? <T tone="ink2" weight="medium" style={{ writingDirection: 'ltr' }}>{prefix}</T> : null}
          <TextInput
            ref={ref}
            placeholderTextColor={c.ink3}
            maxFontSizeMultiplier={1.3}
            selectionColor={c.accent}
            {...props}
            style={[{
              flex: 1, minHeight: 50, paddingVertical: props.multiline ? 14 : 0,
              fontFamily: fonts.regular, fontSize: 16, color: c.ink,
              writingDirection: ltr ? 'ltr' : 'rtl', textAlign: ltr ? 'left' : 'right',
              textAlignVertical: props.multiline ? 'top' : 'center',
              ...({ outlineStyle: 'none' } as object),
            }, style]}
          />
        </View>
        {error ? (
          <Row gap={6}><Icon name="alert" size={15} color={tone.danger.ink} /><T v="small" color={tone.danger.ink}>{error}</T></Row>
        ) : hint ? <T v="small" tone="ink3">{hint}</T> : null}
      </View>
    );
  },
);

export function Chip({ label, active, onPress, icon, disabled, struck, small }: {
  label: string; active?: boolean; onPress?: () => void; icon?: IconName; disabled?: boolean; struck?: boolean; small?: boolean;
}) {
  const { c } = useTheme();
  return (
    <PressScale
      onPress={onPress ? () => { tap('select'); onPress(); } : undefined}
      disabled={!onPress || disabled}
      scaleTo={0.94}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: !!active, disabled: !!disabled } : undefined}
      style={{
        height: small ? 32 : 40, paddingHorizontal: small ? 12 : 16, borderRadius: radius.pill,
        backgroundColor: active ? c.ink : c.card, borderWidth: 1, borderColor: active ? c.ink : c.line,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: disabled && !struck ? 0.45 : 1,
      }}>
      {icon ? <Icon name={icon} size={16} color={active ? c.bg : c.ink2} /> : null}
      <T size={small ? 13 : 14} weight={active ? 'bold' : 'medium'} color={active ? c.bg : struck ? c.ink3 : c.ink}
        style={struck ? { textDecorationLine: 'line-through' } : undefined} lines={1}>{label}</T>
    </PressScale>
  );
}

export function Segmented<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string }[]; value: K; onChange: (k: K) => void;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.sunken, borderRadius: radius.pill, padding: 4 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PressScale key={o.key} onPress={() => { if (!on) { tap('select'); onChange(o.key); } }} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.card : 'transparent', borderWidth: on ? 1 : 0, borderColor: c.line }}>
            <T size={14} weight={on ? 'bold' : 'medium'} tone={on ? 'ink' : 'ink2'}>{o.label}</T>
          </PressScale>
        );
      })}
    </View>
  );
}

/** عدّاد الكمية + / − */
export function Stepper({ value, onChange, min = 1, max = 99, small }: { value: number; onChange: (n: number) => void; min?: number; max?: number; small?: boolean }) {
  const { c } = useTheme();
  const { num } = useFmt();
  const h = small ? 36 : 44;
  const btn = (icon: IconName, next: number, label: string, disabled: boolean) => (
    <PressScale onPress={() => { tap('select'); onChange(next); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={{ width: h, height: h, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
      <Icon name={icon} size={small ? 16 : 18} color={c.ink} strokeWidth={2.2} />
    </PressScale>
  );
  return (
    <View accessibilityRole="adjustable" accessibilityValue={{ now: value, min, max }}
      style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, height: h }}>
      {btn('plus', Math.min(max, value + 1), 'زيادة', value >= max)}
      <T weight="bold" size={small ? 15 : 16} tabular style={{ minWidth: 24, textAlign: 'center', paddingBottom: 0 }}>{num(value)}</T>
      {btn('minus', Math.max(min, value - 1), 'إنقاص', value <= min)}
    </View>
  );
}

/** مفتاح تشغيل/إيقاف */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: withTiming(value ? -18 : 0, { duration: 160, easing: ease }) }] }), [value]);
  return (
    <PressScale onPress={() => { tap('select'); onChange(!value); }} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
      <T weight="medium" style={{ flex: 1 }}>{label}</T>
      {/* المسار ثابت الاتجاه (ltr) حتى يتحرك المقبض بنفس الاتجاه في كل المنصات */}
      <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? c.accent : c.lineStrong, direction: 'ltr', alignItems: 'flex-end' }}>
        <Animated.View style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.card }, knob]} />
      </View>
    </PressScale>
  );
}

/** خيار بدائرة (طرق الدفع، العناوين) */
export function Radio({ on }: { on: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.accent : c.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
      {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- الحالات

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { tone: t } = useTheme();
  const col = t[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 9, height: 26, borderRadius: radius.xs, backgroundColor: col.bg }}>
      {icon ? <Icon name={icon} size={14} color={col.ink} strokeWidth={2} /> : null}
      <T size={12} weight="bold" color={col.ink} style={{ paddingBottom: 0, lineHeight: 18 }} lines={1}>{label}</T>
    </View>
  );
}

/** تنبيه داخل الصفحة (نص بلون الحالة على خلفيتها، مع أيقونة) */
export function Notice({ tone = 'info', icon, title, body, children }: { tone?: Tone; icon?: IconName; title: string; body?: string | null; children?: ReactNode }) {
  const { tone: t } = useTheme();
  const col = t[tone];
  const ic: IconName = icon ?? (tone === 'danger' ? 'xCircle' : tone === 'warning' ? 'alert' : tone === 'success' ? 'checkCircle' : 'info');
  return (
    <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: col.bg }}>
      <Icon name={ic} size={20} color={col.ink} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="small" weight="bold" color={col.ink}>{title}</T>
        {body ? <T v="small" color={col.ink}>{body}</T> : null}
        {children}
      </View>
    </View>
  );
}

export function Empty({ icon = 'box', title, body, action, onAction, compact }: {
  icon?: IconName; title: string; body?: string; action?: string; onAction?: () => void; compact?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 24 : 48, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 76, height: 76, borderRadius: 24, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={34} color={c.accent} strokeWidth={1.6} />
      </View>
      <T v="h3" center>{title}</T>
      {body ? <T tone="ink2" center style={{ maxWidth: 320 }}>{body}</T> : null}
      {action ? <Button title={action} onPress={onAction} small style={{ marginTop: 6, minWidth: 160 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Empty icon="refresh" title="تعذّر التحميل" body={message} action={onRetry ? 'أعد المحاولة' : undefined} onAction={onRetry} />;
}

export function ListItem({ title, subtitle, icon, onPress, right, danger, chevron = true }: {
  title: string; subtitle?: string | null; icon?: IconName; onPress?: () => void; right?: ReactNode; danger?: boolean; chevron?: boolean;
}) {
  const { c, tone } = useTheme();
  const color = danger ? tone.danger.ink : c.ink;
  return (
    <PressScale onPress={onPress} disabled={!onPress} scaleTo={0.985} accessibilityRole={onPress ? 'button' : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, minHeight: 56 }}>
      {icon ? (
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: danger ? tone.danger.bg : c.sunken, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={danger ? color : c.ink2} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T weight="bold" color={color}>{title}</T>
        {subtitle ? <T v="small" tone="ink2" style={{ marginTop: -4 }}>{subtitle}</T> : null}
      </View>
      {right ?? (onPress && chevron ? <Icon name="forward" size={18} color={c.ink3} /> : null)}
    </PressScale>
  );
}

/** صف «عنوان ← قيمة» (المواصفات، ملخص الطلب) */
export function KeyValue({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <T tone={strong ? 'ink' : 'ink2'} weight={strong ? 'bold' : 'regular'} style={{ flexShrink: 1 }}>{label}</T>
      <T weight={strong ? 'black' : 'medium'} tone={accent ? 'accent' : 'ink'} tabular size={strong ? 18 : 16} style={{ flexShrink: 1 }}>{value}</T>
    </Row>
  );
}
