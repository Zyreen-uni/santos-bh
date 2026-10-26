'use client';
import {
  AnimatePresence,
  Transition,
  Variant,
  motion,
  MotionProps,
} from 'motion/react';
import { cn } from '@/lib/utils';

export type TransitionPanelProps = {
  children: React.ReactNode[];
  className?: string;
  transition?: Transition;
  activeIndex: number;
  variants?: { enter: Variant; center: Variant; exit: Variant };
  // Local change: 'wait' lets the old panel leave before the new one comes in (two forms never exist at once).
  mode?: 'popLayout' | 'wait' | 'sync';
} & MotionProps;

export function TransitionPanel({
  children,
  className,
  transition,
  variants,
  activeIndex,
  mode = 'popLayout',
  ...motionProps
}: TransitionPanelProps) {
  return (
    <div className={cn('relative', className)}>
      <AnimatePresence
        initial={false}
        mode={mode}
        custom={motionProps.custom}
      >
        <motion.div
          key={activeIndex}
          variants={variants}
          transition={transition}
          initial='enter'
          animate='center'
          exit='exit'
          {...motionProps}
        >
          {children[activeIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
