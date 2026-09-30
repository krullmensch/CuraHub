// Shared look of the login and setup cards (dark glass on the gallery grid).
export const AUTH_CARD_STYLE = {
  background: 'rgba(255,255,255,0.035)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderColor: 'rgba(255,255,255,0.09)',
  boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
} as const;

export const AUTH_TITLE_STYLE = { fontFamily: '"Funnel Display", sans-serif', color: 'rgba(255,255,255,0.88)' } as const;
export const AUTH_DESCRIPTION_STYLE = { color: 'rgba(255,255,255,0.38)' } as const;

export const AUTH_INPUT_STYLE = {
  background: 'rgba(255,255,255,0.05)',
  borderColor: 'rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.88)',
} as const;
export const AUTH_INPUT_CLASS = 'placeholder:text-white/25 focus-visible:ring-white/20 focus-visible:border-white/25';

export const AUTH_LABEL_CLASS = 'text-[11px] font-medium uppercase';
export const AUTH_LABEL_STYLE = { letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' } as const;

export const AUTH_ERROR_STYLE = {
  color: 'rgba(248,113,113,0.9)',
  background: 'rgba(127,29,29,0.2)',
  border: '1px solid rgba(239,68,68,0.2)',
} as const;

export const AUTH_BUTTON_STYLE = { background: 'rgba(255,255,255,0.92)', color: '#0a0a0c', letterSpacing: '0.02em' } as const;
export const AUTH_SECONDARY_BUTTON_STYLE = {
  background: 'transparent',
  color: 'rgba(255,255,255,0.7)',
  borderColor: 'rgba(255,255,255,0.15)',
} as const;
