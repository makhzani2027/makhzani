/**
 * هوية «رَقيم» — المصدر الوحيد للألوان والمقاسات والحركة.
 * المرجع: system/05-brand.md. لا تكتب لوناً ثابتاً في أي تطبيق: استورده من هنا.
 *
 * الألوان مسمّاة بمواد بلاد الرافدين:
 *   القار (حبر)، البردي (ورق)، طين أوروك (المميز)، النخيل (نجاح)، الزعفران/التمر (تنبيه)،
 *   الرمان (خطر)، اللازورد (معلومة).
 */

export const palette = {
  light: {
    bg: '#F6F3EC', // البردي — خلفية التطبيق
    card: '#FFFFFF', // البطاقات والجداول
    sunken: '#EFEBE2', // حقول، صفوف متناوبة، خلفيات خفيفة
    ink: '#17140F', // القار — النص الأساسي
    ink2: '#5E574C', // نص ثانوي
    ink3: '#8C8477', // تلميحات، أيقونات خاملة
    line: '#E4DED2', // الحدود
    lineStrong: '#CFC7B8',
    accent: '#B4461B', // طين أوروك — اللون المميز الوحيد
    accentHover: '#9C3B15',
    accentInk: '#FFFFFF',
    accentSoft: '#F7E7DD',
    accentSoftInk: '#6E2A0E',
    hero: '#17140F', // كتل العرض الكبيرة (بطاقة البطل، الشريط الجانبي النشط)
    heroInk: '#F6F3EC',
    heroInk2: '#B9B0A1',
    overlay: 'rgba(23, 20, 15, 0.48)',
    focus: '#B4461B',
  },
  dark: {
    bg: '#0F0D0A',
    card: '#1A1714',
    sunken: '#14110E',
    ink: '#F4EFE6',
    ink2: '#B3AA9C',
    ink3: '#7F776B',
    line: '#2C2722',
    lineStrong: '#3D362F',
    accent: '#F2875A',
    accentHover: '#F59C76',
    accentInk: '#1A0E07',
    accentSoft: '#3A1E12',
    accentSoftInk: '#FFD7C4',
    hero: '#B4461B',
    heroInk: '#FFF8F1',
    heroInk2: '#F6D3C2',
    overlay: 'rgba(0, 0, 0, 0.6)',
    focus: '#F2875A',
  },
} as const;

export type ThemeName = keyof typeof palette;
export type ThemeColors = { [K in keyof typeof palette.light]: string };

/** ألوان الحالات (نجاح/تنبيه/خطر/معلومة/محايد) — كل حالة: لون نص + خلفية خفيفة */
export const tones = {
  light: {
    success: { ink: '#1D7A4E', bg: '#E3F1E8' }, // النخيل
    warning: { ink: '#9A6206', bg: '#FBF0D9' }, // التمر
    danger: { ink: '#B8262E', bg: '#FBE4E2' }, // الرمان
    info: { ink: '#2453A6', bg: '#E5ECF8' }, // اللازورد
    neutral: { ink: '#5E574C', bg: '#EFEBE2' },
    accent: { ink: '#9C3B15', bg: '#F7E7DD' },
  },
  dark: {
    success: { ink: '#5BC48D', bg: '#12301F' },
    warning: { ink: '#E7B04F', bg: '#33260F' },
    danger: { ink: '#F2777A', bg: '#3A1517' },
    info: { ink: '#86A8F0', bg: '#16233D' },
    neutral: { ink: '#B3AA9C', bg: '#24201B' },
    accent: { ink: '#FFB08C', bg: '#3A1E12' },
  },
} as const;

export type Tone = keyof typeof tones.light;

/** ألوان الرسوم البيانية بالترتيب (الأول دائماً الطين) */
export const chartColors = {
  light: ['#B4461B', '#2453A6', '#1D7A4E', '#C8901A', '#6E6457', '#8E3B5E'],
  dark: ['#F2875A', '#86A8F0', '#5BC48D', '#E7B04F', '#B3AA9C', '#D98AAE'],
} as const;

/** ألوان ثابتة للعلامة (للطباعة، الأيقونات، ملفات SVG) */
export const brand = {
  ink: '#17140F',
  paper: '#F6F3EC',
  clay: '#B4461B',
  clayLight: '#E0703F',
  ember: '#F2875A',
  cream: '#FFF8F1',
  night: '#0F0D0A',
} as const;

export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

/** سلّم الخط (بكسل). العناوين بخط ثمانية Serif Display، والباقي Sans */
export const type = {
  display: { size: 44, line: 1.45, weight: 900, family: 'display' },
  h1: { size: 30, line: 1.45, weight: 900, family: 'display' },
  h2: { size: 23, line: 1.5, weight: 900, family: 'display' },
  h3: { size: 18, line: 1.55, weight: 700, family: 'sans' },
  body: { size: 15, line: 1.7, weight: 400, family: 'sans' },
  bodyStrong: { size: 15, line: 1.7, weight: 700, family: 'sans' },
  small: { size: 13, line: 1.6, weight: 400, family: 'sans' },
  micro: { size: 11.5, line: 1.5, weight: 700, family: 'sans' },
  number: { size: 28, line: 1.3, weight: 900, family: 'display' },
} as const;

/** أسماء ملفات خط ثمانية (نفس الأسماء في التطبيق والويب) */
export const fonts = {
  sans: { 400: 'thmanyahsans-Regular', 500: 'thmanyahsans-Medium', 700: 'thmanyahsans-Bold', 900: 'thmanyahsans-Black' },
  display: { 700: 'thmanyahserifdisplay-Bold', 900: 'thmanyahserifdisplay-Black' },
  text: { 400: 'thmanyahseriftext-Regular', 700: 'thmanyahseriftext-Bold' },
} as const;

/**
 * خط ثمانية: الياء الأخيرة والنقاط تنزل تحت السطر أكثر مما يعلنه الخط (درس من مشروع سعي).
 * أضف padding سفلي بهذه النسبة من حجم الخط للعناوين، ولا تضع كلمة داخل overflow:hidden بلا هامش.
 */
export const descentPad = { display: 0.3, sans: 0.22 } as const;

/** الحركة: سريعة وهادئة، بلا نوابض متأرجحة. تحترم «تقليل الحركة» دائماً */
export const motion = {
  instant: 90,
  fast: 140,
  base: 200,
  slow: 320,
  intro: 1600,
  easing: [0.2, 0.8, 0.2, 1] as const, // قياسي: خروج سريع ونهاية ناعمة
  emphasized: [0.3, 0, 0, 1] as const, // للظهور المهم (اللوحات، المقدمة)
  css: {
    easing: 'cubic-bezier(.2,.8,.2,1)',
    emphasized: 'cubic-bezier(.3,0,0,1)',
  },
} as const;

export const layout = {
  /** أقصى عرض للمحتوى على الأجهزة اللوحية في تطبيق المتجر */
  maxContent: 720,
  /** عرض الشريط الجانبي في لوحة التحكم */
  sidebar: 264,
  /** أقل هدف لمس */
  touch: 44,
} as const;
