import React, { forwardRef } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex flex-col items-center justify-center text-center p-8 ${className}`}
        {...props}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 mb-4">
          {icon ?? <Inbox className="w-6 h-6" aria-hidden="true" />}
        </div>
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>
        {action && (
          <div className="mt-6">
            {action}
          </div>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

export default EmptyState;
export { EmptyState };
