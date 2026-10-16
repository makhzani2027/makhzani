/**
 * هوية «رَقيم» — المصدر الوحيد للألوان والمقاسات والحركة.
 * المرجع: system/05-brand.md. لا تكتب لوناً ثابتاً في أي تطبيق: استورده من هنا.
 *
 * الألوان مسمّاة بمواد بلاد الرافدين:
 *   القار (حبر)، الحجر (خلفية)، آجُر بابل — الطين المفخور (المميز)، النخيل (نجاح)، التمر (تنبيه)،
 *   الرمان (خطر)، اللازورد (معلومة).
 */

export const palette = {
  light: {
    bg: '#EDEEEC', // الحجر — خلفية التطبيق (رمادي بارد، لا كريمي)
    card: '#FFFFFF', // البطاقات والجداول
    sunken: '#E4E6E3', // حقول، صفوف متناوبة، خلفيات خفيفة
    ink: '#121513', // القار — النص الأساسي
    ink2: '#50564F', // نص ثانوي
    ink3: '#7F877E', // تلميحات، أيقونات خاملة
    line: '#DCDFDB', // الحدود
    lineStrong: '#C3C8C2',
    accent: '#C2410E', // آجُر بابل — اللون المميز الوحيد
    accentHover: '#A3360A',
    accentInk: '#FFFFFF',
    accentSoft: '#FBE6DA',
    accentSoftInk: '#7A2606',
    hero: '#121513', // كتل العرض الكبيرة
    heroInk: '#EDEEEC',
    heroInk2: '#A9AFA8',
    overlay: 'rgba(18, 21, 19, 0.5)',
    focus: '#C2410E',
  },
  dark: {
    bg: '#0E100F',
    card: '#181B19',
    sunken: '#121412',
    ink: '#EEF0ED',
    ink2: '#A9AFA8',
    ink3: '#7A817A',
    line: '#262A27',
    lineStrong: '#343935',
    accent: '#F2783E',
    accentHover: '#F5915F',
    accentInk: '#1A0B03',
    accentSoft: '#3A1A0C',
    accentSoftInk: '#FFD3BD',
    hero: '#C2410E',
    heroInk: '#FFF7F0',
    heroInk2: '#FBD0B8',
    overlay: 'rgba(0, 0, 0, 0.6)',
    focus: '#F2783E',
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
    neutral: { ink: '#50564F', bg: '#E4E6E3' },
    accent: { ink: '#A3360A', bg: '#FBE6DA' },
  },
  dark: {
    success: { ink: '#5BC48D', bg: '#12301F' },
    warning: { ink: '#E7B04F', bg: '#33260F' },
    danger: { ink: '#F2777A', bg: '#3A1517' },
    info: { ink: '#86A8F0', bg: '#16233D' },
    neutral: { ink: '#A9AFA8', bg: '#1F2320' },
    accent: { ink: '#FFA97E', bg: '#3A1A0C' },
  },
} as const;

export type Tone = keyof typeof tones.light;

/** ألوان الرسوم البيانية بالترتيب (الأول دائماً الآجُر) */
export const chartColors = {
  light: ['#C2410E', '#2453A6', '#1D7A4E', '#C8901A', '#5F675E', '#8E3B5E'],
  dark: ['#F2783E', '#86A8F0', '#5BC48D', '#E7B04F', '#A9AFA8', '#D98AAE'],
} as const;

/** ألوان ثابتة للعلامة (للطباعة، الأيقونات، ملفات SVG) */
export const brand = {
  ink: '#121513', // القار
  stone: '#EDEEEC', // الحجر
  brick: '#C2410E', // آجُر بابل
  brickLight: '#E8622A', // ثقب الرمز على الحبر
  ember: '#F2783E', // الآجُر في الوضع الغامق
  cream: '#FFF7F0', // الرمز على أيقونة الآجُر
  night: '#0E100F',
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
