import type { ReactNode } from 'react';

/** Dark gallery-grid background with the CuraHub mark — shared by login and setup. */
export function AuthBackdrop({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10 relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 90% 70% at 50% 45%, #17171f 0%, #0c0c10 55%, #07070a 100%)',
      }}
    >
      {/* Architectural grid — gallery floor plan aesthetic */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '72px 72px',
        }}
      />

      {/* Soft central radial glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '700px',
          height: '700px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 65%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      <div className={`relative z-10 w-full ${wide ? 'max-w-lg' : 'max-w-sm'} flex flex-col items-center gap-7`}>
        {/* Brand mark */}
        <div className="text-center select-none">
          <p
            className="text-xs uppercase mb-2"
            style={{ letterSpacing: '0.35em', color: 'rgba(255,255,255,0.25)', fontFamily: '"Albert Sans", sans-serif' }}
          >
            HSBI
          </p>
          <h1
            className="text-[2rem] font-light"
            style={{ fontFamily: '"Funnel Display", sans-serif', color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.01em' }}
          >
            CuraHub
          </h1>
        </div>

        {children}

        <p
          className="text-xs text-center select-none"
          style={{ color: 'rgba(255,255,255,0.15)', letterSpacing: '0.04em' }}
        >
          Digitale Ausstellungsplanung · Hochschule Bielefeld
        </p>
      </div>
    </div>
  );
}
