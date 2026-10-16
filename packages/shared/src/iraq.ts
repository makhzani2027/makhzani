/** محافظات العراق — المفتاح لاتيني ثابت يُحفظ في قاعدة البيانات، والاسم للعرض */
export const GOVERNORATES = [
  { key: 'baghdad', name: 'بغداد' },
  { key: 'basra', name: 'البصرة' },
  { key: 'nineveh', name: 'نينوى' },
  { key: 'erbil', name: 'أربيل' },
  { key: 'sulaymaniyah', name: 'السليمانية' },
  { key: 'duhok', name: 'دهوك' },
  { key: 'kirkuk', name: 'كركوك' },
  { key: 'anbar', name: 'الأنبار' },
  { key: 'babil', name: 'بابل' },
  { key: 'karbala', name: 'كربلاء' },
  { key: 'najaf', name: 'النجف' },
  { key: 'wasit', name: 'واسط' },
  { key: 'maysan', name: 'ميسان' },
  { key: 'dhi_qar', name: 'ذي قار' },
  { key: 'muthanna', name: 'المثنى' },
  { key: 'qadisiyah', name: 'القادسية (الديوانية)' },
  { key: 'salahuddin', name: 'صلاح الدين' },
  { key: 'diyala', name: 'ديالى' },
  { key: 'halabja', name: 'حلبجة' },
] as const;

export type GovernorateKey = (typeof GOVERNORATES)[number]['key'];

export function governorateName(key: string | null | undefined): string {
  return GOVERNORATES.find((g) => g.key === key)?.name ?? key ?? '';
}

export const isGovernorate = (k: string): k is GovernorateKey => GOVERNORATES.some((g) => g.key === k);
