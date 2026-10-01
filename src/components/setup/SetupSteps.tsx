import { useState, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AUTH_BUTTON_STYLE, AUTH_ERROR_STYLE, AUTH_INPUT_CLASS, AUTH_INPUT_STYLE, AUTH_LABEL_CLASS, AUTH_LABEL_STYLE,
  AUTH_SECONDARY_BUTTON_STYLE,
} from '@/components/authStyles';
import { SystemCheckList } from './SystemCheckList';
import type { SetupCheck } from '@/lib/setup/setupApi';
import { normalizePublicUrl, passwordProblem, usernameProblem } from '@/lib/setup/validation';

// One small component per wizard step: values and callbacks come from SetupPage, no fetching here.

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="text-sm font-medium rounded-md px-3 py-2" style={AUTH_ERROR_STYLE}>{children}</div>;
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={AUTH_LABEL_CLASS} style={AUTH_LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

function TextInput(props: ComponentProps<typeof Input>) {
  return <Input {...props} style={AUTH_INPUT_STYLE} className={AUTH_INPUT_CLASS} />;
}

export function PrimaryButton({ busy, children, disabled, ...rest }: ComponentProps<typeof Button> & { busy?: boolean }) {
  return (
    <Button {...rest} disabled={busy || disabled} className="w-full mt-1 font-medium" style={AUTH_BUTTON_STYLE}>
      {children}
    </Button>
  );
}

function SecondaryButton(props: ComponentProps<typeof Button>) {
  return <Button {...props} type="button" variant="outline" className="w-full mt-1" style={AUTH_SECONDARY_BUTTON_STYLE} />;
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-white/50">{children}</p>;
}

export function CodeStep({ onSubmit, error, busy }: { onSubmit: (code: string) => void; error: string | null; busy: boolean }) {
  const [code, setCode] = useState('');
  return (
    <form className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(code); }}>
      <Hint>
        Den Setup-Code findest du im Log der App: <code className="text-white/75">docker compose logs app</code>
      </Hint>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field id="setup-code" label="Setup-Code">
        <TextInput id="setup-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" autoFocus required />
      </Field>
      <PrimaryButton type="submit" busy={busy}>Weiter</PrimaryButton>
    </form>
  );
}

export function ChecksStep({ checks, onRecheck, onNext, error, busy }: {
  checks: SetupCheck[]; onRecheck: () => void; onNext: () => void; error: string | null; busy: boolean;
}) {
  const blocked = checks.some((c) => c.status === 'fail');
  return (
    <div className="grid gap-4">
      {error && <ErrorBox>{error}</ErrorBox>}
      <SystemCheckList checks={checks} />
      {blocked && <ErrorBox>Rot markierte Punkte müssen behoben werden, bevor es weitergeht.</ErrorBox>}
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton onClick={onRecheck} disabled={busy}>Erneut prüfen</SecondaryButton>
        <PrimaryButton type="button" onClick={onNext} disabled={blocked || checks.length === 0} busy={busy}>Weiter</PrimaryButton>
      </div>
    </div>
  );
}

export function UrlStep({ initial, onNext }: { initial: string; onNext: (url: string) => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="grid gap-4" onSubmit={(e: FormEvent) => {
      e.preventDefault();
      const url = normalizePublicUrl(value);
      if (!url) { setError('Bitte eine https-Adresse ohne Pfad angeben, z. B. https://curahub.hsbi.de'); return; }
      onNext(url);
    }}>
      <Hint>Unter dieser Adresse ist CuraHub öffentlich erreichbar. Nur diese Adresse darf die API aus dem Browser aufrufen.</Hint>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field id="public-url" label="Öffentliche Adresse">
        <TextInput id="public-url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://curahub.hsbi.de" required />
      </Field>
      <PrimaryButton type="submit">Weiter</PrimaryButton>
    </form>
  );
}

export function LocalAdminStep({ onNext }: { onNext: (username: string, password: string) => void }) {
  const [username, setUsername] = useState('notfall');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="grid gap-4" onSubmit={(e: FormEvent) => {
      e.preventDefault();
      const problem = usernameProblem(username) ?? passwordProblem(password, repeat);
      if (problem) { setError(problem); return; }
      onNext(username, password);
    }}>
      <Hint>
        Dieses Konto funktioniert auch, wenn der HSBI-Login ausfällt. Bewahre das Passwort sicher auf, z. B. im Passwort-Manager.
      </Hint>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field id="local-user" label="Benutzername">
        <TextInput id="local-user" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" required />
      </Field>
      <Field id="local-pw" label="Passwort (mind. 12 Zeichen)">
        <TextInput id="local-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
      </Field>
      <Field id="local-pw2" label="Passwort wiederholen">
        <TextInput id="local-pw2" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
      </Field>
      <PrimaryButton type="submit">Weiter</PrimaryButton>
    </form>
  );
}

export function HsbiAdminStep({ onCheck, onSkip, onNext, verifiedEmail, error, busy }: {
  onCheck: (username: string, password: string) => void;
  onSkip: () => void;
  onNext: () => void;
  verifiedEmail: string | null;
  error: string | null;
  busy: boolean;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); onCheck(username.trim(), password); }}>
      <Hint>
        Optional: Dein HSBI-Konto wird Admin. Die Prüfung zeigt gleichzeitig, dass der HSBI-Login vom neuen Server aus funktioniert. Das Passwort wird nicht gespeichert.
      </Hint>
      {error && <ErrorBox>{error}</ErrorBox>}
      {verifiedEmail ? (
        <>
          <p className="text-sm text-emerald-400">Geprüft: {verifiedEmail} wird Admin.</p>
          <PrimaryButton type="button" onClick={onNext}>Weiter</PrimaryButton>
        </>
      ) : (
        <>
          <Field id="hsbi-user" label="HSBI-Kennung">
            <TextInput id="hsbi-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="amustermann" autoComplete="username" required />
          </Field>
          <Field id="hsbi-pw" label="HSBI-Passwort">
            <TextInput id="hsbi-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton onClick={onSkip}>Überspringen</SecondaryButton>
            <PrimaryButton type="submit" busy={busy}>Prüfen</PrimaryButton>
          </div>
        </>
      )}
    </form>
  );
}

export function SummaryStep({ publicUrl, localUsername, hsbiEmail, onFinish, error, busy }: {
  publicUrl: string; localUsername: string; hsbiEmail: string | null;
  onFinish: () => void; error: string | null; busy: boolean;
}) {
  return (
    <div className="grid gap-4">
      {error && <ErrorBox>{error}</ErrorBox>}
      <dl className="grid gap-2 text-sm">
        <div><dt className="text-white/40 text-xs">Öffentliche Adresse</dt><dd className="text-white/85">{publicUrl}</dd></div>
        <div><dt className="text-white/40 text-xs">Notfall-Admin</dt><dd className="text-white/85">{localUsername}</dd></div>
        <div><dt className="text-white/40 text-xs">HSBI-Admin</dt><dd className="text-white/85">{hsbiEmail ?? 'übersprungen'}</dd></div>
      </dl>
      <PrimaryButton type="button" onClick={onFinish} busy={busy}>Setup abschließen</PrimaryButton>
    </div>
  );
}
