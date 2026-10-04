'use client'

import React, { forwardRef, useId } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', label, error, id, ...props }, ref) => {
    const autoId = useId();
    const textareaId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? true : undefined}
          className={`block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#7C9A82] focus:ring-[#7C9A82] sm:text-sm px-3 py-2 border outline-none transition-colors ${
            error ? 'border-[#C47C7C] focus:border-[#C47C7C] focus:ring-[#C47C7C]' : ''
          } ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-[#C47C7C]">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
export { Textarea };
