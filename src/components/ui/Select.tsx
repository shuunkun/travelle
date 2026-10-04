'use client'

import React, { forwardRef, useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, placeholder, className = '', id, ...props }, ref) => {
    const autoId = useId();
    const selectId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          className={`block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#7C9A82] focus:ring-[#7C9A82] sm:text-sm px-3 py-2 border outline-none transition-colors bg-white ${
            error ? 'border-[#C47C7C] focus:border-[#C47C7C] focus:ring-[#C47C7C]' : ''
          } ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1 text-sm text-[#C47C7C]">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
export { Select };
