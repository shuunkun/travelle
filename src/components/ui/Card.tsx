import React, { forwardRef } from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  onClick?: () => void;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', children, onClick, ...props }, ref) => {
    const baseStyles = 'bg-white rounded-xl border border-gray-100 p-6 shadow-sm transition-shadow duration-200';
    const clickableStyles = onClick ? 'cursor-pointer hover:shadow-md' : '';

    return (
      <div
        ref={ref}
        onClick={onClick}
        className={`${baseStyles} ${clickableStyles} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
export { Card };
