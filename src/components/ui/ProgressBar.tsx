'use client';

import React from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
}

export default function ProgressBar({
  value, max = 100, size = 'md', color, className = '',
}: ProgressBarProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' };
  const barColor = color || (pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500');

  return (
    <div className={`w-full ${heights[size]} bg-gray-100 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full ${barColor} rounded-full transition-all duration-500 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
