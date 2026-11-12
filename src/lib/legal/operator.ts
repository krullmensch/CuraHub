/**
 * Who runs this CuraHub installation — entered in the setup wizard or later on /users, and turned
 * into Impressum and Datenschutzerklärung by documents.ts. Every field is a string ('' = not given)
 * except `logRetentionDays`.
 *
 * Mirrored in server/src/lib/legalTexts.ts (`legalOperatorSchema`) — keep the fields in sync.
 */
export interface LegalOperator {
  /** 'public': Hochschule or other public body; 'private': person, association, company. */
  kind: 'public' | 'private';
  name: string;
  legalForm: string;
  representative: string;
  street: string;
  postalCode: string;
  city: string;
  email: string;
  phone: string;
  /** Register entry / USt-IdNr. (companies). */
  register: string;
  /** Public bodies: the ministry that supervises them. */
  supervisoryAuthority: string;
  /** § 18 Abs. 2 MStV; empty = the representative, else the operator. */
  contentResponsible: string;
  /** Contact of the data protection officer. */
  dpo: string;
  /** Public bodies: the state law Art. 6 Abs. 1 Buchst. e DSGVO rests on. */
  stateLaw: string;
  /** Where visitors may complain. */
  dataProtectionAuthority: string;
  /** Where the server runs, e.g. „auf einem Server im Rechenzentrum der HSBI". */
  hosting: string;
  /** How long the web server keeps access logs; null = not stated. */
  logRetentionDays: number | null;
  otherRecipients: string;
  /** Set by the server on save (ISO); drives „Stand: …". */
  updatedAt?: string;
}

/** CuraHub was built for the HSBI, so the NRW defaults are filled in. */
export const EMPTY_OPERATOR: LegalOperator = {
  kind: 'public',
  name: '',
  legalForm: '',
  representative: '',
  street: '',
  postalCode: '',
  city: '',
  email: '',
  phone: '',
  register: '',
  supervisoryAuthority: '',
  contentResponsible: '',
  dpo: '',
  stateLaw: '§ 3 DSG NRW',
  dataProtectionAuthority: 'Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, www.ldi.nrw.de',
  hosting: '',
  logRetentionDays: 14,
  otherRecipients: '',
};

export const REQUIRED_OPERATOR_FIELDS = ['name', 'street', 'postalCode', 'city', 'email'] as const;

const FIELD_LABELS: Record<(typeof REQUIRED_OPERATOR_FIELDS)[number], string> = {
  name: 'Name',
  street: 'Straße',
  postalCode: 'PLZ',
  city: 'Ort',
  email: 'E-Mail',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

export function operatorComplete(op: LegalOperator | null | undefined): op is LegalOperator {
  return !!op && REQUIRED_OPERATOR_FIELDS.every((f) => op[f].trim() !== '');
}

/** What keeps the form from being saved, in German; null when it is fine. */
export function operatorProblem(op: LegalOperator): string | null {
  const missing = REQUIRED_OPERATOR_FIELDS.filter((f) => !op[f].trim()).map((f) => FIELD_LABELS[f]);
  if (missing.length) return `Pflichtangaben fehlen: ${missing.join(', ')}.`;
  if (!EMAIL_RE.test(op.email.trim())) return 'Die E-Mail-Adresse ist ungültig.';
  return null;
}

/** Fills fields an older or partial record lacks, so the form always has every key. */
export function withOperatorDefaults(op: Partial<LegalOperator> | null | undefined): LegalOperator {
  return { ...EMPTY_OPERATOR, ...(op ?? {}) };
}
