import { roleAtLeast, type AppRole } from '@/store/authStore';

export type TourSide = 'top' | 'bottom' | 'left' | 'right';

export interface TourStep {
  id: string;
  /** Value of a `data-tour` attribute; none = the step is shown centred. */
  target?: string;
  /** Preferred side of the popover, default 'bottom'. */
  placement?: TourSide;
  title: string;
  /** Plain text with `*label*` (UI labels) and `<kbd>X</kbd>` markers, see parseTourBody. */
  body: string;
  /** Default 'curator'. */
  minRole?: AppRole;
}

/** The dashboard tour (spec: docs/superpowers/specs/2026-10-29-onboarding-tour-design.md §3). */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: 'Willkommen bei CuraHub',
    body: 'In zwei Minuten zeigen wir dir, wie du eine Ausstellung planst, prüfst und veröffentlichst.',
  },
  {
    id: 'projects',
    target: 'project-selector',
    placement: 'bottom',
    title: 'Deine Projekte',
    body: 'Jedes Projekt ist eine Ausstellung mit eigenen Medien und Versionen. Hier wechselst du oder legst ein neues an.',
  },
  {
    id: 'assets',
    target: 'nav-assets',
    placement: 'bottom',
    title: 'Medien hochladen',
    body: 'Unter *Assets* lädst du Bilder, Videos, 3D-Modelle, Gaussian Splats und PDFs hoch, auch ganze Ordner per Drag & Drop.',
  },
  {
    id: 'place',
    target: 'asset-sidebar',
    placement: 'right',
    title: 'Werke platzieren',
    body: 'Zieh ein Werk aus der Seitenleiste in den Raum, es rastet an Wand oder Boden ein. Klick wählt aus, <kbd>⇧</kbd> wählt mehrere.',
  },
  {
    id: 'tools',
    target: 'editor-toolbar',
    placement: 'top',
    title: 'Werkzeuge',
    body: '<kbd>G</kbd> <kbd>R</kbd> <kbd>S</kbd> verschieben, drehen, skalieren. <kbd>E</kbd> öffnet den 2D-Wandeditor fürs genaue Hängen, <kbd>V</kbd> die Ego-Perspektive (<kbd>Esc</kbd> zurück).',
  },
  {
    id: 'properties',
    target: 'properties-panel',
    placement: 'left',
    title: 'Eigenschaften',
    body: 'Hier stellst du Maße, Rahmen und Passepartout des ausgewählten Werks ein.',
  },
  {
    id: 'versions',
    target: 'version-panel',
    placement: 'top',
    title: 'Versionen',
    body: 'Änderungen werden automatisch gespeichert. Mit *Version speichern* hältst du einen Stand fest, mit Branches probierst du Varianten aus.',
  },
  {
    id: 'publish',
    target: 'viewer-button',
    placement: 'bottom',
    title: 'Veröffentlichen',
    body: 'Besucher:innen sehen nur die veröffentlichte Version. *Viewer testen* zeigt dir den öffentlichen Rundgang.',
  },
  {
    id: 'settings',
    target: 'project-settings',
    placement: 'bottom',
    title: 'Projekteinstellungen',
    body: 'Hier änderst du Name und Poster der Ausstellung und lädst Kurator:innen ein.',
    minRole: 'prof',
  },
  {
    id: 'users',
    target: 'nav-users',
    placement: 'bottom',
    title: 'Benutzerverwaltung',
    body: 'Hier vergibst du Rollen und hebst Ausstellungen auf der Startseite hervor.',
    minRole: 'admin',
  },
  {
    id: 'wiki',
    target: 'nav-wiki',
    placement: 'bottom',
    title: 'Mehr im Wiki',
    body: 'Rahmen, Zusammenarbeit, Bücher und alle Tastenkürzel findest du hier. Die Tour kannst du dort jederzeit neu starten.',
  },
];

export function stepsForRole(role: AppRole): TourStep[] {
  return TOUR_STEPS.filter((s) => roleAtLeast(role, s.minRole ?? 'curator'));
}

export type TourBodyPart = { kind: 'text' | 'kbd' | 'em'; text: string };

/** Splits a step body into text, `<kbd>` and `*emphasis*` parts. Unclosed markers stay text. */
export function parseTourBody(body: string): TourBodyPart[] {
  const parts: TourBodyPart[] = [];
  let last = 0;
  for (const m of body.matchAll(/\*(.+?)\*/g)) {
    parts.push(...splitKeys(body.slice(last, m.index), 'text'), ...splitKeys(m[1], 'em'));
    last = m.index + m[0].length;
  }
  parts.push(...splitKeys(body.slice(last), 'text'));
  return parts;
}

/** `<kbd>` keys inside a run of text or emphasis; empty runs are dropped. */
function splitKeys(text: string, kind: 'text' | 'em'): TourBodyPart[] {
  const parts: TourBodyPart[] = [];
  let last = 0;
  for (const m of text.matchAll(/<kbd>(.+?)<\/kbd>/g)) {
    if (m.index > last) parts.push({ kind, text: text.slice(last, m.index) });
    parts.push({ kind: 'kbd', text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind, text: text.slice(last) });
  return parts;
}
