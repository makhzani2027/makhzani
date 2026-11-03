/**
 * المبلغ بالحروف للفواتير وعروض الأسعار: «فقط ثلاثة ملايين وسبعمائة وسبعون ألف دينار عراقي لا غير».
 * قواعد العدد مع المعدود (المذكّر: دينار/دولار/سنت):
 *  - ٣–١٠: العدد بالتاء والمعدود جمع مجرور (ثلاثة آلاف، سبعة دنانير).
 *  - ١١–٩٩: المعدود مفرد منصوب (أحد عشر ديناراً)، إلا إذا أُضيف لما بعده (سبعون ألفَ دينار).
 *  - المئات والألف والمليون: مفرد مجرور (مائة دينار، ثلاثمائة ألف).
 *  - المثنى يحذف نونه عند الإضافة: مائتا دينار، ألفا دينار، مليونا دينار.
 * الإملاء: «مائة» كما يُكتب في العراق.
 */

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

interface Noun { one: string; two: string; twoConstruct: string; few: string; acc: string; gen: string }

const SCALES: { value: number; noun: Noun }[] = [
  { value: 1e9, noun: { one: 'مليار', two: 'ملياران', twoConstruct: 'مليارا', few: 'مليارات', acc: 'ملياراً', gen: 'مليار' } },
  { value: 1e6, noun: { one: 'مليون', two: 'مليونان', twoConstruct: 'مليونا', few: 'ملايين', acc: 'مليوناً', gen: 'مليون' } },
  { value: 1e3, noun: { one: 'ألف', two: 'ألفان', twoConstruct: 'ألفا', few: 'آلاف', acc: 'ألفاً', gen: 'ألف' } },
];

const CURRENCY: Record<'IQD' | 'USD', Noun & { oneFull: string; twoFull: string }> = {
  IQD: { one: 'دينار', two: 'ديناران', twoConstruct: 'دينارا', few: 'دنانير عراقية', acc: 'ديناراً عراقياً', gen: 'دينار عراقي', oneFull: 'دينار عراقي واحد', twoFull: 'ديناران عراقيان' },
  USD: { one: 'دولار', two: 'دولاران', twoConstruct: 'دولارا', few: 'دولارات أمريكية', acc: 'دولاراً أمريكياً', gen: 'دولار أمريكي', oneFull: 'دولار أمريكي واحد', twoFull: 'دولاران أمريكيان' },
};
const CENT = { few: 'سنتات', acc: 'سنتاً', gen: 'سنت', oneFull: 'سنت واحد', twoFull: 'سنتان' };

/** ١–٩٩٩ بالحروف. المائتان تصير «مائتا» لأنها تُضاف دائماً لما بعدها (ألف/مليون/المعدود) */
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(h === 2 && r === 0 ? 'مائتا' : HUNDREDS[h]);
  if (r) {
    if (r < 10) parts.push(ONES[r]);
    else if (r < 20) parts.push(TEENS[r - 10]);
    else parts.push(r % 10 ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]);
  }
  return parts.join(' و');
}

/** عدد صحيح مع معدوده (المعدود يُعطى بصيغه الخمس). n > 0 */
function countWithNoun(n: number, noun: { few: string; acc: string; gen: string; oneFull: string; twoFull: string }): string {
  const parts: string[] = [];
  let rest = n;
  for (let i = 0; i < SCALES.length; i++) {
    const { value, noun: s } = SCALES[i];
    const g = Math.floor(rest / value);
    rest %= value;
    if (!g) continue;
    const last = rest === 0; // لا أعداد بعده: يُضاف مباشرة للمعدود
    const r = g % 100;
    if (g === 1) parts.push(s.one);
    else if (g === 2) parts.push(last ? s.twoConstruct : s.two);
    else if (r >= 3 && r <= 10) parts.push(`${below1000(g)} ${s.few}`);
    else if (r >= 11) parts.push(`${below1000(g)} ${last ? s.gen : s.acc}`);
    else parts.push(`${below1000(g)} ${s.gen}`);
  }
  const u = rest;
  if (u === 0) return `${parts.join(' و')} ${noun.gen}`; // «ألف دينار»، «سبعون ألف دينار»
  if (u === 1) return [...parts, noun.oneFull].join(' و'); // «ألف ودينار عراقي واحد»
  if (u === 2) return [...parts, noun.twoFull].join(' و');
  const r = u % 100;
  const nn = r >= 3 && r <= 10 ? noun.few : r >= 11 ? noun.acc : noun.gen;
  return `${[...parts, below1000(u)].join(' و')} ${nn}`;
}

/**
 * «فقط … لا غير». الدينار بلا كسور (يُقرّب)، والدولار بالسنتات.
 * أقصى قيمة مدعومة ٩٩٩ ملياراً.
 */
export function amountInWords(amount: number, currency: 'IQD' | 'USD' = 'IQD'): string {
  if (!Number.isFinite(amount) || amount < 0) return '';
  const cur = CURRENCY[currency];
  if (currency === 'IQD') {
    const n = Math.round(amount);
    if (n === 0) return `صفر ${cur.gen}`;
    return `فقط ${countWithNoun(n, cur)} لا غير`;
  }
  const cents = Math.round(amount * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  if (!whole && !frac) return `صفر ${cur.gen}`;
  const parts: string[] = [];
  if (whole) parts.push(countWithNoun(whole, cur));
  if (frac) parts.push(countWithNoun(frac, CENT));
  return `فقط ${parts.join(' و')} لا غير`;
}
