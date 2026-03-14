'use client';

import { useState } from 'react';
import { getHeadshotUrl } from '@/lib/nba';

interface PlayerAvatarProps {
  name: string;
  nbaId?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  sm: 'w-8 h-8 text-xs rounded-lg',
  md: 'w-10 h-10 text-sm rounded-lg',
  lg: 'w-14 h-14 text-xl rounded-xl',
  xl: 'w-20 h-20 text-2xl rounded-xl',
} as const;

export function PlayerAvatar({ name, nbaId, size = 'md', className = '' }: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initials = name.split(' ').map(n => n[0]).join('');
  const headshotUrl = getHeadshotUrl(nbaId, size === 'xl' || size === 'lg' ? '1040x760' : '260x190');

  if (headshotUrl && !imgError) {
    return (
      <div className={`${SIZES[size]} overflow-hidden bg-primary/10 flex-shrink-0 ${className}`}>
        <img
          src={headshotUrl}
          alt={name}
          className="w-full h-full object-cover object-top"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className={`${SIZES[size]} bg-primary/15 flex items-center justify-center font-bold text-primary flex-shrink-0 ${className}`}>
      {initials}
    </div>
  );
}
