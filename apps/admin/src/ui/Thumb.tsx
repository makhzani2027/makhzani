import { useState } from 'react';
import type { IconName } from '@raqeem/shared';
import { imgUrl } from '../lib/media';
import { Icon } from './Icon';

/** صورة مصغرة لمنتج/قسم. بلا صورة: أيقونة بخلفية الطين الخفيفة (بديل بهوية رقيم) */
export function Thumb({ imageKey, alt = '', size = 'md', icon = 'box' }: { imageKey?: string | null; alt?: string; size?: 'sm' | 'md' | 'lg'; icon?: IconName }) {
  const [failed, setFailed] = useState(false);
  const url = imgUrl(imageKey, size === 'lg' ? 'md' : 'sm');
  const cls = `thumb ${size !== 'md' ? size : ''}`;
  if (!url || failed) return <span className={`${cls} placeholder-art`} aria-hidden="true"><Icon name={icon} size={size === 'lg' ? 26 : size === 'sm' ? 15 : 20} /></span>;
  return <span className={cls}><img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} /></span>;
}

export function Avatar({ name, imageKey, size = 34 }: { name?: string | null; imageKey?: string | null; size?: number }) {
  const url = imgUrl(imageKey, 'sm');
  const initials = (name ?? '؟').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('');
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{url ? <img src={url} alt="" /> : initials}</span>;
}
