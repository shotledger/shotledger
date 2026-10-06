import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDownIcon, SignOutIcon, UserIcon } from './icons';

/** The profile menu, top right: who is signed in, the account page, sign out. */
export function UserMenu({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const items = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return close();
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    list[(at + step + list.length) % list.length]?.focus();
  };

  return (
    <div className="user-menu" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        className="secondary user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <UserIcon />
        <span className="truncate">{email ?? '…'}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div id={menuId} role="menu" className="user-menu-popup">
          <div className="user-menu-who" role="presentation">
            <span className="muted">{t('account.signedInAs')}</span>
            <strong className="truncate">{email}</strong>
          </div>
          <hr />
          <a role="menuitem" href="#account" onClick={() => setOpen(false)}>
            <UserIcon />
            {t('web.account.title')}
          </a>
          <hr />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <SignOutIcon />
            {t('account.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
