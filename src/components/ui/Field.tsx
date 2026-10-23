import { useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const inputClass = 'rounded-field border border-line-strong bg-soft px-4 py-3.5 text-base text-ink max-md:px-3.5 max-md:py-[13px]';

type FieldProps = { label: string; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

export function TextField({ label, className, id, ...input }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-label">
        {label}
      </label>
      <input id={inputId} className={cn(inputClass, 'min-w-0')} {...input} />
    </div>
  );
}

export function PasswordField({ label, className, id, ...input }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [show, setShow] = useState(false);
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-label">
        {label}
      </label>
      <div className="flex overflow-hidden rounded-field border border-line-strong bg-soft">
        <input
          id={inputId}
          type={show ? 'text' : 'password'}
          className="min-w-0 grow border-0 bg-transparent px-4 py-3.5 text-base text-ink max-md:px-3.5 max-md:py-[13px]"
          {...input}
        />
        <button
          type="button"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={() => setShow((s) => !s)}
          className="flex w-[50px] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-muted"
        >
          {show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
