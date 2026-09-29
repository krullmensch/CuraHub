let suppressClick = false;

/** Marks the click that ends a ⇧-drag marquee so it does not also toggle an artwork. */
export function suppressNextClick(): void {
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
}

/** True (once) if the current click ended a marquee drag and must be ignored. */
export function consumeMarqueeClick(): boolean {
  const suppressed = suppressClick;
  suppressClick = false;
  return suppressed;
}
