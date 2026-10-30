/**
 * The AR sheet builds one model at a time: a newer request (another artwork, another frame)
 * or closing the sheet makes the running build's result stale, so it is dropped.
 */
export class ArRequests {
  private current = 0;

  start(): number {
    this.current += 1;
    return this.current;
  }

  isCurrent(token: number): boolean {
    return token === this.current;
  }

  cancel(): void {
    this.current += 1;
  }
}
