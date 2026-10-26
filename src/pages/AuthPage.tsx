import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { motion } from 'motion/react';
import { AnimatedBackground } from '@/components/motion-primitives/animated-background';
import { TransitionPanel } from '@/components/motion-primitives/transition-panel';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'login', to: '/login', label: 'Login' },
  { id: 'register', to: '/register', label: 'Register' },
] as const;

// Login goes in from the left, Register from the right.
const SLIDE = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -28 }),
};

// The card's height follows the form inside it, so switching tabs grows or shrinks it smoothly.
function useContentHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetHeight includes the padding (contentRect would leave it out and clip the button's bottom).
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

// One card for Login and Register (flowchart page 1, design C-Login, C-Register, C-Phone). The card stays on screen
// when the tab changes: the navy pill slides to the other tab (animated-background) and the form slides and fades
// (transition-panel). It is compact so it fits a laptop, a tablet and a phone without scrolling.
export default function AuthPage() {
  const { pathname } = useLocation();
  const active = pathname.startsWith('/register') ? 'register' : 'login';
  const index = active === 'register' ? 1 : 0;
  const [contentRef, height] = useContentHeight();

  return (
    <main className="flex min-h-svh items-center justify-center bg-page px-4 py-6 short:py-3">
      <div className="flex w-full max-w-[560px] flex-col gap-4 rounded-card-lg bg-card px-8 py-7 max-md:rounded-card max-md:px-5 max-md:py-6 short:gap-3 short:py-5">
        <img src="/santos-logo.png" alt="Santos Boarding House" className="h-16 w-auto self-center max-md:h-14 short:h-11" />
        <nav aria-label="Account" className="grid grid-cols-2 rounded-full bg-page p-1">
          <AnimatedBackground defaultValue={active} className="rounded-full bg-navy" transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}>
            {TABS.map((t) => (
              <Link
                key={t.id}
                data-id={t.id}
                to={t.to}
                replace
                aria-current={active === t.id ? 'page' : undefined}
                className={cn(
                  'justify-center rounded-full py-2.5 text-center text-[15px] no-underline outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-blue short:py-2',
                  active === t.id ? 'font-bold text-white' : 'font-semibold text-muted hover:text-navy',
                )}
              >
                {t.label}
              </Link>
            ))}
          </AnimatedBackground>
        </nav>
        {/* The small side padding keeps the fields' focus rings visible inside the clipped, animating height. */}
        <motion.div className="-mx-1 overflow-hidden px-1" animate={{ height }} transition={{ duration: 0.25, ease: 'easeOut' }} initial={false}>
          <div ref={contentRef} className="py-0.5">
            {/* wait: the old form leaves before the new one comes in, so its fields never appear twice. */}
            <TransitionPanel mode="wait" activeIndex={index} custom={index === 1 ? 1 : -1} variants={SLIDE} transition={{ duration: 0.15, ease: 'easeOut' }}>
              {[<LoginPage key="login" />, <RegisterPage key="register" />]}
            </TransitionPanel>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
