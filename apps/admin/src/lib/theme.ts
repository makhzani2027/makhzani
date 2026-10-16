import { useEffect, useState } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';

/** المظهر: تلقائي (يتبع النظام) أو فاتح أو غامق — يُحفظ في المتصفح */
export function useThemePref(): [ThemePref, (t: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => {
    try { return (localStorage.getItem('rq.theme') as ThemePref) || 'auto'; } catch { return 'auto'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'auto') delete root.dataset.theme; else root.dataset.theme = pref;
    try { if (pref === 'auto') localStorage.removeItem('rq.theme'); else localStorage.setItem('rq.theme', pref); } catch { /* */ }
  }, [pref]);
  return [pref, setPref];
}
