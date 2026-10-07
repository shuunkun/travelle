import React, { forwardRef } from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual affordance (pointer + hover lift) without making the card a button. */
  interactive?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', children, onClick, interactive = false, onKeyDown, ...props }, ref) => {
    // Callers can set their own padding (`p-0`, `p-5`…); the default must not
    // compete with it, since whichever utility comes later in the CSS would win.
    const hasPadding = /(^|\s)p-[\d.]+(\s|$)/.test(className);
    const baseStyles = `bg-white rounded-xl border border-gray-100 ${hasPadding ? '' : 'p-6'} shadow-sm transition-[box-shadow,border-color,transform] duration-200`;
    const clickable = Boolean(onClick) || interactive;
    const clickableStyles = clickable
      ? 'group cursor-pointer hover:shadow-md hover:border-[#7C9A82]/50 hover:bg-[#F7FAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C9A82] focus-visible:ring-offset-2'
      : '';

    return (
      <div
        ref={ref}
        onClick={onClick}
        onKeyDown={onKeyDown}
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
