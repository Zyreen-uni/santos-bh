// Pill buttons (docs/design.md: buttons and chips are pills).
const base = 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border-0 font-bold no-underline disabled:cursor-default disabled:opacity-60';

export const btn = {
  primary: `${base} bg-blue px-[22px] py-[13px] text-[15px] text-white hover:bg-blue-hover`,
  navy: `${base} bg-navy px-[22px] py-[13px] text-[15px] text-white hover:bg-blue-hover`,
  soft: `${base} bg-page px-[22px] py-[13px] text-[15px] text-navy hover:bg-soft-blue`,
  danger: `${base} bg-bad-bg px-[22px] py-[13px] text-[15px] text-bad hover:brightness-95`,
  // Small buttons on cards (View, Edit, Deactivate).
  card: `${base} bg-page px-2 py-2.5 text-sm font-semibold text-navy hover:bg-soft-blue`,
  cardDanger: `${base} bg-bad-bg px-2 py-2.5 text-sm font-semibold text-bad hover:brightness-95`,
};
