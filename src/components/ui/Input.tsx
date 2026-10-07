'use client'

import React, { forwardRef, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Text rendered inside the field on the left, e.g. a currency symbol. */
  prefix?: string;
  /** Text rendered inside the field on the right, e.g. "%". */
  suffix?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, hint, prefix, suffix, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const hasAdornment = Boolean(prefix || suffix);
    // Wider padding for multi-character adornments such as "HK$" or "AUD".
    const prefixPad = !prefix ? 'px-3' : prefix.length <= 1 ? 'pl-7' : prefix.length === 2 ? 'pl-9' : 'pl-12';
    const suffixPad = !suffix ? (prefix ? 'pr-3' : '') : suffix.length <= 1 ? 'pr-8' : suffix.length === 2 ? 'pr-10' : 'pr-14';

    const input = (
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#7C9A82] focus:ring-[#7C9A82] sm:text-sm py-2 border outline-none transition-colors ${prefixPad} ${suffixPad} ${
          error ? 'border-[#C47C7C] focus:border-[#C47C7C] focus:ring-[#C47C7C]' : ''
        } ${className}`}
        {...props}
      />
    );

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        {hasAdornment ? (
          <div className="relative">
            {prefix && (
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-gray-400">
                {prefix}
              </span>
            )}
            {input}
            {suffix && (
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-gray-400">
                {suffix}
              </span>
            )}
          </div>
        ) : (
          input
        )}
        {error ? (
          <p className="mt-1 text-sm text-[#C47C7C]">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-gray-400">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
export { Input };
