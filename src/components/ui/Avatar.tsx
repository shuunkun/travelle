import React, { forwardRef } from 'react';
import { Friend } from '@/lib/types';
import { getInitials } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const sizes = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ name, color, size = 'md', className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex items-center justify-center rounded-full text-white font-medium shrink-0 ${sizes[size]} ${className}`}
        style={{ backgroundColor: color }}
        title={name}
        aria-label={name}
        {...props}
      >
        {getInitials(name)}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export interface AvatarGroupProps {
  people: Friend[];
  max?: number;
  size?: AvatarProps['size'];
  className?: string;
}

/** Overlapping stack of avatars with a "+N" overflow bubble. */
const AvatarGroup: React.FC<AvatarGroupProps> = ({ people, max = 4, size = 'sm', className = '' }) => {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  return (
    <div className={`flex -space-x-2 ${className}`}>
      {shown.map((person, i) => (
        <Avatar
          key={person.id}
          name={person.name}
          color={person.color}
          size={size}
          className="ring-2 ring-white"
          style={{ backgroundColor: person.color, zIndex: shown.length - i }}
        />
      ))}
      {overflow > 0 && (
        <div
          className={`flex items-center justify-center rounded-full bg-gray-100 text-gray-600 font-medium ring-2 ring-white ${sizes[size]}`}
          title={people.slice(max).map((p) => p.name).join(', ')}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};

export default Avatar;
export { Avatar, AvatarGroup };
