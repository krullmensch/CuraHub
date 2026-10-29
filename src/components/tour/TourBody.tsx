import { parseTourBody } from '@/lib/tour/steps';

/** A tour step's text with `*UI labels*` and `<kbd>` keys. */
export function TourBody({ body }: { body: string }) {
  return (
    <>
      {parseTourBody(body).map((part, i) => {
        if (part.kind === 'kbd') {
          return (
            <kbd key={i} className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-100">
              {part.text}
            </kbd>
          );
        }
        if (part.kind === 'em') return <em key={i} className="not-italic text-zinc-100">{part.text}</em>;
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}
