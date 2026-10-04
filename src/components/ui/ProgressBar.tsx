import React from 'react';

export interface ProgressBarProps {
  /** 0–100. Values above 100 are shown as full with the "over" colour. */
  value: number;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Budget-style progress bar: sage under 75%, amber to 100%, rose when over. */
const ProgressBar: React.FC<ProgressBarProps> = ({ value, label, size = 'sm', className = '' }) => {
  const clamped = Math.max(0, Math.min(100, value));
  const colour = value > 100 ? 'bg-[#C47C7C]' : value > 75 ? 'bg-[#D4C5A9]' : 'bg-[#7C9A82]';
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={`w-full bg-gray-100 rounded-full overflow-hidden ${height} ${className}`}
    >
      <div className={`${height} rounded-full transition-all ${colour}`} style={{ width: `${clamped}%` }} />
    </div>
  );
};

export default ProgressBar;
export { ProgressBar };
