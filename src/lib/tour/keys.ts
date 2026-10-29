export type TourKeyAction = 'next' | 'back' | 'skip';

type KeyLike = Pick<KeyboardEvent, 'key' | 'altKey' | 'metaKey' | 'ctrlKey'>;

/** What a key press does in the tour; null = not a tour key (modified keys stay with the browser). */
export function tourKeyAction(e: KeyLike): TourKeyAction | null {
  if (e.altKey || e.metaKey || e.ctrlKey) return null;
  if (e.key === 'ArrowRight' || e.key === 'Enter') return 'next';
  if (e.key === 'ArrowLeft') return 'back';
  if (e.key === 'Escape') return 'skip';
  return null;
}
