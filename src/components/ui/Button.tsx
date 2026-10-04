'use client'

import React, { forwardRef } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', icon, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none rounded-lg';
    
    const variants = {
      primary: 'bg-[#7C9A82] text-white hover:bg-[#6b8570] focus:ring-[#7C9A82]',
      secondary: 'bg-[#D4C5A9] text-gray-800 hover:bg-[#c2b499] focus:ring-[#D4C5A9]',
      outline: 'border-2 border-[#7C9A82] text-[#7C9A82] hover:bg-gray-50 focus:ring-[#7C9A82]',
      ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-200',
      danger: 'bg-[#C47C7C] text-white hover:bg-[#a86a6a] focus:ring-[#C47C7C]',
    };

    const sizes = {
      sm: 'h-9 px-3 text-sm',
      md: 'h-10 px-4 py-2 text-sm',
      lg: 'h-12 px-6 text-base',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {icon && <span className="mr-2">{icon}</span>}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
export { Button };
