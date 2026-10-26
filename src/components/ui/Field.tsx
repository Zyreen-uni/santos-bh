import { useId, useState, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const inputClass = 'rounded-field border border-line-strong bg-soft text-base text-ink';
// compact: the Login and Register card, which must fit the screen without scrolling.
const box = (compact?: boolean) => (compact ? 'px-3.5 py-2.5 short:py-2' : 'px-4 py-3.5 max-md:px-3.5 max-md:py-[13px]');
const wrap = (compact?: boolean) => cn('flex min-w-0 flex-col', compact ? 'gap-1' : 'gap-2');
const labelClass = (compact?: boolean) => cn('font-semibold text-label', compact ? 'text-[13px]' : 'text-sm');

type FieldProps = { label: string; className?: string; compact?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

export function TextField({ label, className, id, compact, ...input }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn(wrap(compact), className)}>
      <label htmlFor={inputId} className={labelClass(compact)}>
        {label}
      </label>
      <input id={inputId} className={cn(inputClass, box(compact), 'min-w-0')} {...input} />
    </div>
  );
}

type SelectProps = { label: string; className?: string; options: { value: string; label: string }[] } & Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'className'
>;

export function SelectField({ label, className, id, options, ...select }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={selectId} className="text-sm font-semibold text-label">
        {label}
      </label>
      <select id={selectId} className={cn(inputClass, box(), 'min-w-0 cursor-pointer')} {...select}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PasswordField({ label, className, id, compact, ...input }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [show, setShow] = useState(false);
  return (
    <div className={cn(wrap(compact), className)}>
      <label htmlFor={inputId} className={labelClass(compact)}>
        {label}
      </label>
      <div className="flex overflow-hidden rounded-field border border-line-strong bg-soft">
        <input
          id={inputId}
          type={show ? 'text' : 'password'}
          className={cn('min-w-0 grow border-0 bg-transparent text-base text-ink', box(compact))}
          {...input}
        />
        <button
          type="button"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={() => setShow((s) => !s)}
          className="flex w-[46px] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-muted"
        >
          {show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
