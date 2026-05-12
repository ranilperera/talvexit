import { clsx } from 'clsx';

/**
 * Standard page wrapper used by every authenticated dashboard page.
 *
 * Replaces the inline `<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 ...">`
 * that was duplicated across 30+ pages. Centralising it means width tweaks
 * (e.g. "make /company/profile wider on 4K monitors") become a one-line edit
 * instead of a project-wide find/replace.
 *
 * Default width is `max-w-7xl` (1280 px) — the modern admin-dashboard sweet
 * spot. Wide enough to use the space on 1920 px+ screens without letting
 * forms stretch so wide that label/value pairs lose visual association.
 *
 * Sizes:
 *   - 'narrow'  (max-w-3xl, ~768 px)  — forms, single-column flows
 *   - 'compact' (max-w-5xl, ~1024 px) — legacy width if a page genuinely
 *                                       looks better narrower
 *   - 'default' (max-w-7xl, ~1280 px) — the standard
 *   - 'wide'    (max-w-7xl + 2xl:1440)— ultra-wide screens get more space
 *   - 'full'    (no cap)              — tables, kanban boards
 */

export type PageContainerSize = 'narrow' | 'compact' | 'default' | 'wide' | 'full';

const SIZE_CLASS: Record<PageContainerSize, string> = {
  narrow:  'max-w-3xl',
  compact: 'max-w-5xl',
  default: 'max-w-7xl',
  wide:    'max-w-7xl 2xl:max-w-[1440px]',
  full:    'max-w-none',
};

export interface PageContainerProps {
  children: React.ReactNode;
  /** Max content width. Defaults to 'default' (1280 px). */
  size?: PageContainerSize;
  /**
   * Extra classes appended to the wrapper. Use this for content spacing
   * (`space-y-6`) or layout overrides (`pb-20`, `text-center`).
   */
  className?: string;
}

export function PageContainer({
  children,
  size = 'default',
  className,
}: PageContainerProps) {
  return (
    <div
      className={clsx(
        SIZE_CLASS[size],
        'mx-auto px-4 sm:px-6 lg:px-8 py-10',
        className,
      )}
    >
      {children}
    </div>
  );
}
