'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, User, Settings, LogOut } from 'lucide-react';

interface ProfileMenuProps {
  email?: string;
  label: string;
  onSignOut: () => void;
}

export function ProfileMenu({ email, label, onSignOut }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <User className="h-4 w-4 shrink-0 sm:hidden" aria-hidden />
        <span className="hidden max-w-[140px] truncate sm:inline">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-[60] mt-1 min-w-[220px] rounded-xl border border-white/[0.08] bg-card py-1 shadow-xl shadow-black/50"
        >
          {email && (
            <div className="border-b border-white/[0.06] px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Signed in</p>
              <p className="mt-0.5 truncate text-xs text-foreground">{email}</p>
            </div>
          )}
          <Link
            href="/settings"
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-white/[0.05]"
            onClick={() => setOpen(false)}
          >
            <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
            Profile settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
