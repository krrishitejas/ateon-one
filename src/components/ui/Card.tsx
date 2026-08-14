'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outlined' | 'elevated';
  hover?: boolean;
  onClick?: () => void;
  padding?: 'sm' | 'md' | 'lg';
}

export default function Card({
  children, className = '', variant = 'default', hover = false, onClick, padding = 'md',
}: CardProps) {
  const base = 'rounded-2xl transition-all duration-200';
  const paddings = { sm: 'p-4', md: 'p-5', lg: 'p-6' };
  const variants = {
    default: 'bg-white border border-gray-100 shadow-sm',
    outlined: 'bg-white border border-gray-200',
    elevated: 'bg-white shadow-md border border-gray-50',
  };
  const hoverClass = hover ? 'hover:shadow-md hover:border-gray-200 cursor-pointer' : '';

  return (
    <div
      className={`${base} ${paddings[padding]} ${variants[variant]} ${hoverClass} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
