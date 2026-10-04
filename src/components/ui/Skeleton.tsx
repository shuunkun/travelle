import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '', ...props }) => (
  <div aria-hidden="true" className={`animate-pulse rounded-md bg-gray-200/80 ${className}`} {...props} />
);

/** Generic page-level placeholder shown before localStorage has hydrated. */
const PageSkeleton: React.FC<{ cards?: number }> = ({ cards = 3 }) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="status" aria-live="polite">
    <span className="sr-only">Loading…</span>
    <Skeleton className="h-9 w-56 mb-8" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <Skeleton className="h-40 rounded-none" />
          <div className="p-5 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default Skeleton;
export { Skeleton, PageSkeleton };
