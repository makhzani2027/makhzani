import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'default' | 'primary' | 'ink' | 'soft' | 'ghost' | 'danger' | 'danger-solid';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconEnd?: IconName;
  loading?: boolean;
  block?: boolean;
  kbd?: string;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', icon, iconEnd, loading, block, kbd, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    variant === 'danger-solid' ? 'danger solid' : variant !== 'default' ? variant : '',
    size !== 'md' ? size : '',
    block ? 'block' : '',
    loading ? 'loading' : '',
    !children && icon ? 'icon' : '',
    className ?? '',
  ].filter(Boolean).join(' ');
  const iconSize = size === 'sm' ? 16 : size === 'xl' ? 22 : 18;
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={iconSize} /> : null}
      {kbd ? <span className="kbd">{kbd}</span> : null}
    </button>
  );
});

/** زر أيقونة فقط — label إلزامي لقارئ الشاشة */
export function IconButton({ icon, label, size = 'md', variant = 'ghost', ...rest }: Omit<ButtonProps, 'children' | 'icon'> & { icon: IconName; label: string }) {
  return <Button icon={icon} size={size} variant={variant} aria-label={label} title={label} {...rest} />;
}
