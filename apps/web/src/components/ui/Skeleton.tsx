import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  height?: number | string;
  width?: number | string;
  rounded?: string;
}

export function Skeleton({ height, width, rounded = 'rounded-lg', className, style, ...props }: SkeletonProps) {
  return (
    <div
      className={clsx('skeleton', rounded, className)}
      style={{ height, width, ...style }}
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? '65%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={clsx('rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4', className)}>
      <div className="flex items-center gap-3">
        <Skeleton height={40} width={40} rounded="rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton height={14} width="60%" />
          <Skeleton height={12} width="40%" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}
