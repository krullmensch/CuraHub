import { Component, type ReactNode } from 'react';

interface Props {
  /** Called with the error; the export page logs it with the `[ar-export]` marker. */
  onError: (err: unknown) => void;
  children: ReactNode;
}

/** Around the whole Canvas: errors thrown while rendering its tree are logged at once instead of at the timeout. (A failing renderer factory is async and is caught by the page's window listeners.) */
export class ExportErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
