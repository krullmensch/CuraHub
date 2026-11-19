// Shared look of the login, setup and password cards — the dashboard's panels and form fields
// (zinc-900 card, zinc-950 inputs with a blue focus, blue primary button), so signing in looks
// like the app it leads into.

export const AUTH_CARD_CLASS = 'w-full rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-xl';
export const AUTH_TITLE_CLASS = 'font-display text-xl font-light text-white';
export const AUTH_DESCRIPTION_CLASS = 'text-zinc-400';

export const AUTH_INPUT_CLASS =
  'border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/40';

export const AUTH_LABEL_CLASS = 'text-xs font-medium text-zinc-300';
export const AUTH_HINT_CLASS = 'text-xs leading-snug text-zinc-400';

export const AUTH_ERROR_CLASS = 'rounded-md border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-300';

export const AUTH_BUTTON_CLASS = 'bg-blue-600 text-white shadow-none hover:bg-blue-500';
export const AUTH_SECONDARY_BUTTON_CLASS = 'border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white';
