import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The theme's own radius tokens (src/index.css), so rounded-card-lg replaces a rounded-lg from a primitive.
const twMerge = extendTailwindMerge({ extend: { theme: { radius: ['card', 'card-lg', 'field'] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Money in pesos with the peso sign and commas: ₱1,830 (centavos only when there are any).
export function peso(amount: number | string) {
  const n = Number(amount);
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}
