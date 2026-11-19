import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AUTH_BUTTON_CLASS, AUTH_ERROR_CLASS, AUTH_INPUT_CLASS, AUTH_LABEL_CLASS,
} from '@/components/authStyles';
import { changePassword, newPasswordError } from '@/lib/auth/localAccounts';
import { MIN_PASSWORD_LENGTH } from '@/lib/setup/validation';

interface PasswordChangeFormProps {
  token: string;
  /** The account's username, for password managers. */
  username?: string;
  /** Prefills the current password (the start password just typed on the login page) and hides its field. */
  knownCurrent?: string;
  /** 'auth' = the glass look of the login card, 'dialog' = the editor's dark dialogs. */
  variant: 'auth' | 'dialog';
  submitLabel: string;
  onDone: () => void;
}

/** Current + new + repeated password for a local account; POSTs /auth/me/password. */
export function PasswordChangeForm({ token, username, knownCurrent, variant, submitLabel, onDone }: PasswordChangeFormProps) {
  const [current, setCurrent] = useState(knownCurrent ?? '');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const auth = variant === 'auth';
  const inputProps = auth ? { className: AUTH_INPUT_CLASS } : {};
  const labelProps = { className: auth ? AUTH_LABEL_CLASS : 'text-xs font-medium text-zinc-400' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = newPasswordError(current, next, repeat);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    setSaving(true);
    const failed = await changePassword(token, current, next);
    setSaving(false);
    if (failed) setError(failed);
    else onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {error && (
        <div
          className={auth ? AUTH_ERROR_CLASS : 'text-sm rounded-md px-3 py-2 bg-red-950/40 border border-red-900 text-red-300'}
        >
          {error}
        </div>
      )}
      {/* Lets password managers attach the new password to the right account. */}
      <input type="text" autoComplete="username" value={username ?? ''} hidden readOnly />
      {knownCurrent === undefined && (
        <div className="grid gap-2">
          <label htmlFor="pw-current" {...labelProps}>Aktuelles Passwort</label>
          <Input id="pw-current" type="password" autoComplete="current-password" required
            value={current} onChange={(e) => setCurrent(e.target.value)} {...inputProps} />
        </div>
      )}
      <div className="grid gap-2">
        <label htmlFor="pw-next" {...labelProps}>Neues Passwort</label>
        <Input id="pw-next" type="password" autoComplete="new-password" required autoFocus
          placeholder={`mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
          value={next} onChange={(e) => setNext(e.target.value)} {...inputProps} />
      </div>
      <div className="grid gap-2">
        <label htmlFor="pw-repeat" {...labelProps}>Neues Passwort wiederholen</label>
        <Input id="pw-repeat" type="password" autoComplete="new-password" required
          value={repeat} onChange={(e) => setRepeat(e.target.value)} {...inputProps} />
      </div>
      <Button type="submit" loading={saving} className={auth ? `w-full mt-1 font-medium ${AUTH_BUTTON_CLASS}` : 'w-full mt-1 font-medium'}>
        {saving ? 'Wird gespeichert…' : submitLabel}
      </Button>
    </form>
  );
}
