'use client'

import React from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
  className?: string;
}

/** Underlined tab strip with arrow-key navigation. */
function Tabs<T extends string>({ tabs, value, onChange, className = '', ...rest }: TabsProps<T>) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.value === value);
    if (index === -1) return;
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].value);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      onKeyDown={handleKeyDown}
      className={`flex gap-5 sm:gap-8 border-b border-gray-100 overflow-x-auto no-scrollbar ${className}`}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={`pb-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              selected
                ? 'text-[#7C9A82] border-[#7C9A82]'
                : 'text-gray-500 border-transparent hover:text-gray-900'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`ml-2 inline-flex items-center justify-center rounded-full px-1.5 min-w-5 h-5 text-xs ${
                  selected ? 'bg-[#E8F0EA] text-[#5A7A60]' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
export { Tabs };
