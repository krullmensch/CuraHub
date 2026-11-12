import type { CSSProperties, ReactNode } from 'react';
import { AUTH_INPUT_CLASS, AUTH_INPUT_STYLE, AUTH_LABEL_CLASS, AUTH_LABEL_STYLE } from '@/components/authStyles';
import { cn } from '@/lib/utils';
import type { LegalOperator } from '@/lib/legal/operator';

type Appearance = 'setup' | 'admin';

const LOOK: Record<Appearance, { input: string; inputStyle?: CSSProperties; label: string; labelStyle?: CSSProperties; hint: string; legend: string }> = {
  setup: {
    input: cn('flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1', AUTH_INPUT_CLASS),
    inputStyle: AUTH_INPUT_STYLE,
    label: AUTH_LABEL_CLASS,
    labelStyle: AUTH_LABEL_STYLE,
    hint: 'text-[11px] text-white/40',
    legend: 'text-xs font-medium text-white/70',
  },
  admin: {
    input: 'w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-zinc-500',
    label: 'text-xs text-zinc-400',
    hint: 'text-[11px] text-zinc-500',
    legend: 'text-xs font-medium text-zinc-200',
  },
};

interface OperatorFieldsProps {
  value: LegalOperator;
  onChange: (next: LegalOperator) => void;
  appearance: Appearance;
}

/**
 * The operator's details for Impressum and Datenschutzerklärung — the setup wizard's step and the
 * admin page use the same form. Required: name, address, e-mail.
 */
export function OperatorFields({ value, onChange, appearance }: OperatorFieldsProps) {
  const look = LOOK[appearance];
  const set = <K extends keyof LegalOperator>(key: K, v: LegalOperator[K]) => onChange({ ...value, [key]: v });
  const isPublic = value.kind === 'public';

  const field = (key: Exclude<keyof LegalOperator, 'kind' | 'logRetentionDays' | 'updatedAt'>, label: string, opts: { required?: boolean; placeholder?: string; hint?: ReactNode; multiline?: boolean; type?: string; className?: string } = {}) => {
    const id = `operator-${appearance}-${key}`;
    const common = {
      id,
      value: value[key],
      placeholder: opts.placeholder,
      required: opts.required,
      className: look.input,
      style: look.inputStyle,
    };
    return (
      <div className={cn('grid gap-1.5 content-start', opts.className)}>
        <label htmlFor={id} className={look.label} style={look.labelStyle}>{label}{opts.required && ' *'}</label>
        {opts.multiline
          ? <textarea {...common} rows={2} onChange={(e) => set(key, e.target.value)} />
          : <input {...common} type={opts.type ?? 'text'} onChange={(e) => set(key, e.target.value)} />}
        {opts.hint && <p className={look.hint}>{opts.hint}</p>}
      </div>
    );
  };

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-3">
        <legend className={cn(look.legend, 'mb-2')}>Betreiber</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" role="radiogroup" aria-label="Art des Betreibers">
          {([['public', 'Hochschule oder andere öffentliche Stelle'], ['private', 'Privatperson, Verein oder Unternehmen']] as const).map(([kind, label]) => (
            <label key={kind} className={cn('flex items-center gap-2 cursor-pointer', appearance === 'setup' ? 'text-white/70' : 'text-zinc-300')}>
              <input type="radio" name={`operator-kind-${appearance}`} checked={value.kind === kind} onChange={() => set('kind', kind)} />
              {label}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('name', 'Name der Einrichtung oder Person', { required: true, placeholder: 'Hochschule Bielefeld', className: 'sm:col-span-2' })}
          {field('legalForm', 'Rechtsform', { placeholder: isPublic ? 'Körperschaft des öffentlichen Rechts' : 'z. B. e. V., GmbH' })}
          {field('representative', 'Vertreten durch', { placeholder: isPublic ? 'die Präsidentin / den Präsidenten' : 'Geschäftsführung, Vorstand' })}
          {field('street', 'Straße und Hausnummer', { required: true, className: 'sm:col-span-2' })}
          {field('postalCode', 'PLZ', { required: true })}
          {field('city', 'Ort', { required: true })}
          {field('email', 'E-Mail', { required: true, type: 'email' })}
          {field('phone', 'Telefon')}
          {isPublic
            ? field('supervisoryAuthority', 'Aufsichtsbehörde', { placeholder: 'Ministerium für Kultur und Wissenschaft NRW', className: 'sm:col-span-2' })
            : field('register', 'Register und USt-IdNr.', { placeholder: 'Amtsgericht …, HRB …; USt-IdNr. DE…', className: 'sm:col-span-2' })}
          {field('contentResponsible', 'Verantwortlich für den Inhalt (§ 18 MStV)', { hint: 'Leer: die vertretende Person, sonst der Betreiber.', className: 'sm:col-span-2' })}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className={cn(look.legend, 'mb-2')}>Datenschutz</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('dpo', 'Datenschutzbeauftragte(r)', {
            placeholder: 'Name, E-Mail',
            hint: isPublic ? 'Für öffentliche Stellen Pflicht (Art. 37 DSGVO).' : undefined,
            className: 'sm:col-span-2',
          })}
          {isPublic && field('stateLaw', 'Landesrechtliche Grundlage', { hint: 'Für Art. 6 Abs. 1 Buchst. e DSGVO.' })}
          {field('dataProtectionAuthority', 'Datenschutz-Aufsichtsbehörde', { className: isPublic ? undefined : 'sm:col-span-2' })}
          {field('hosting', 'Wo läuft CuraHub?', { placeholder: 'auf einem Server im Rechenzentrum der HSBI', hint: 'Ergänzt den Satz „CuraHub läuft …".' })}
          <div className="grid gap-1.5 content-start">
            <label htmlFor={`operator-${appearance}-logs`} className={look.label} style={look.labelStyle}>Webserver-Protokolle löschen nach (Tagen)</label>
            <input
              id={`operator-${appearance}-logs`}
              type="number"
              min={0}
              max={3650}
              value={value.logRetentionDays ?? ''}
              onChange={(e) => set('logRetentionDays', e.target.value === '' ? null : Math.max(0, Math.min(3650, Math.round(Number(e.target.value)))))}
              className={look.input}
              style={look.inputStyle}
            />
            <p className={look.hint}>Wie lange Apache Zugriffe mit IP-Adresse aufbewahrt. Leer: nicht angegeben.</p>
          </div>
          {field('otherRecipients', 'Weitere Empfänger', {
            multiline: true,
            placeholder: 'z. B. ein Hosting-Dienstleister als Auftragsverarbeiter',
            hint: 'Leer: keine. Cloudflare nennt CuraHub von selbst, wenn BEHIND_CLOUDFLARE gesetzt ist.',
            className: 'sm:col-span-2',
          })}
        </div>
      </fieldset>
    </div>
  );
}
