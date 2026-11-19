import { useState } from 'react';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { SelfAvatar } from '@/components/live/PresenceAvatars';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isLocalAccount } from '@/lib/auth/localAccounts';
import { nameForEmail } from '@/lib/live/presence';
import { ChangePasswordDialog } from './ChangePasswordDialog';

interface AccountMenuProps {
  /** „Abmelden" (the layout logs out and navigates to the login page). */
  onLogout: () => void;
  /** Avatar only, no name or chevron (mobile planner). */
  compact?: boolean;
}

/**
 * The own avatar in the header as a menu: who is logged in, with which kind of account,
 * „Passwort ändern" — only for CuraHub accounts (HSBI accounts have no password in CuraHub;
 * `POST /auth/me/password` refuses them too) — and „Abmelden".
 */
export function AccountMenu({ onLogout, compact = false }: AccountMenuProps) {
  const email = useAuthStore((s) => s.user?.email);
  const [passwordOpen, setPasswordOpen] = useState(false);
  if (!email) return null;
  const local = isLocalAccount(email);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Konto"
          className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-1.5 text-xs text-gray-400 outline-none transition-colors hover:bg-zinc-800 hover:text-white focus-visible:ring-2 focus-visible:ring-zinc-500 data-[state=open]:bg-zinc-800 data-[state=open]:text-white"
        >
          <SelfAvatar />
          {/* The name is in the menu anyway: in the trigger only where the header has room. */}
          {!compact && <span className="hidden max-w-[10rem] truncate 2xl:inline">{nameForEmail(email)}</span>}
          {!compact && <ChevronDown className="hidden h-3 w-3 sm:block" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 border-zinc-800 bg-zinc-950 text-zinc-100">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm text-zinc-100">{nameForEmail(email)}</span>
            <span className="block text-xs text-zinc-400">{local ? 'CuraHub-Konto' : 'HSBI-Konto'}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-800" />
          {local ? (
            <DropdownMenuItem className="cursor-pointer focus:bg-zinc-800" onSelect={() => setPasswordOpen(true)}>
              <KeyRound className="h-4 w-4" /> Passwort ändern
            </DropdownMenuItem>
          ) : (
            <p className="px-2 py-1.5 text-xs text-zinc-400">
              Das Passwort deines HSBI-Kontos änderst du bei der HSBI, nicht in CuraHub.
            </p>
          )}
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem className="cursor-pointer focus:bg-zinc-800" onSelect={onLogout}>
            <LogOut className="h-4 w-4" /> Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {local && <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />}
    </>
  );
}
