'use client';

import React from 'react';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const COLORS = [
  'bg-gray-200 text-gray-600',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
];

export default function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const sizes = {
    xs: 'w-6 h-6 text-[9px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % COLORS.length;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover ring-2 ring-white ${className}`}
      />
    );
  }

  return (
    <div className={`${sizes[size]} ${COLORS[colorIndex]} rounded-full flex items-center justify-center font-semibold ring-2 ring-white ${className}`}>
      {initials}
    </div>
  );
}
