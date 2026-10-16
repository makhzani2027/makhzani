import { forwardRef, useId, useState, useEffect, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { formatNumber, parseNumber } from '@raqeem/shared';
import { Icon, type IconName } from './Icon';

/** حقل بعنوان وتلميح وخطأ. يمرّر id للعنصر الداخلي تلقائياً */
export function Field({ label, hint, error, required, children, className }: {
  label?: ReactNode; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <label className={`field ${className ?? ''}`}>
      {label ? <span className="label">{label}{required ? <span className="req">*</span> : null}</span> : null}
      {children}
      {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: IconName; suffix?: ReactNode; size_?: 'sm' | 'md' | 'lg' }>(
  function Input({ icon, suffix, size_ = 'md', className, ...rest }, ref) {
    const input = <input ref={ref} className={`input ${size_ !== 'md' ? size_ : ''} ${className ?? ''}`} {...rest} />;
    if (!icon && !suffix) return input;
    return (
      <span className="input-wrap">
        {icon ? <Icon name={icon} size={18} /> : null}
        {input}
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </span>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={`textarea ${className ?? ''}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { options?: { value: string; label: string }[]; placeholder?: string; size_?: 'sm' | 'md' }>(
  function Select({ options, placeholder, children, className, size_ = 'md', ...rest }, ref) {
    return (
      <select ref={ref} className={`select ${size_ === 'sm' ? 'sm' : ''} ${className ?? ''}`} {...rest}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {children}
      </select>
    );
  },
);

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Switch({ label, checked, onChange, disabled, hint }: { label?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label ? <span className="col" style={{ gap: 0 }}><span style={{ fontWeight: 500 }}>{label}</span>{hint ? <span className="small faint">{hint}</span> : null}</span> : null}
    </label>
  );
}

/**
 * حقل رقم يقبل الأرقام العربية والإنكليزية والفواصل، ويعرض القيمة منسقة عند الخروج منه.
 * value رقم أو null. allowDecimal للكميات بالوزن والدولار.
 */
export function NumberInput({ value, onChange, allowDecimal = false, min, max, suffix, placeholder, size_, autoFocus, disabled, id, onEnter, ariaLabel }: {
  value: number | null; onChange: (v: number | null) => void; allowDecimal?: boolean; min?: number; max?: number;
  suffix?: ReactNode; placeholder?: string; size_?: 'sm' | 'md' | 'lg'; autoFocus?: boolean; disabled?: boolean; id?: string; onEnter?: () => void; ariaLabel?: string;
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value === null || value === undefined ? '' : formatNumber(value, { digits: 'latn', maxDecimals: allowDecimal ? 3 : 0 }));
  }, [value, focused, allowDecimal]);
  const commit = (t: string) => {
    let n = parseNumber(t);
    if (n !== null && !allowDecimal) n = Math.round(n);
    if (n !== null && min !== undefined) n = Math.max(min, n);
    if (n !== null && max !== undefined) n = Math.min(max, n);
    onChange(n);
  };
  return (
    <Input
      id={id} aria-label={ariaLabel} inputMode={allowDecimal ? 'decimal' : 'numeric'} className="num" value={text} placeholder={placeholder}
      suffix={suffix} size_={size_} autoFocus={autoFocus} disabled={disabled}
      onFocus={(e) => { setFocused(true); setText(value === null || value === undefined ? '' : String(value)); requestAnimationFrame(() => e.target.select()); }}
      onBlur={() => { setFocused(false); commit(text); }}
      onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { commit(text); onEnter?.(); } }}
    />
  );
}

/** حقل مبلغ بالعملة */
export function MoneyInput(props: Omit<Parameters<typeof NumberInput>[0], 'suffix'> & { currency?: 'IQD' | 'USD' }) {
  const { currency = 'IQD', ...rest } = props;
  return <NumberInput {...rest} allowDecimal={currency === 'USD'} min={0} suffix={currency === 'USD' ? '$' : 'د.ع'} />;
}

export function SearchInput({ value, onChange, placeholder = 'بحث…', autoFocus, size_ }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; size_?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="input-wrap" style={{ minWidth: 220, flex: '1 1 260px' }}>
      <Icon name="search" size={18} />
      <input className={`input ${size_ && size_ !== 'md' ? size_ : ''}`} type="search" value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="مسح البحث" style={{ position: 'absolute', insetInlineEnd: 8, border: 0, background: 'transparent', color: 'var(--ink3)', cursor: 'pointer', display: 'flex' }}>
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label?: string }) {
  const id = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label={label} id={id}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
