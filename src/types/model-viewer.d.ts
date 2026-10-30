import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/** `<model-viewer>` (Google, loaded lazily by the mobile planner's AR sheet). */
export interface ModelViewerElement extends HTMLElement {
  readonly canActivateAR: boolean;
  activateAR(): Promise<void>;
}

interface ModelViewerAttributes extends HTMLAttributes<ModelViewerElement> {
  src?: string;
  alt?: string;
  ar?: boolean;
  'ar-modes'?: string;
  'ar-placement'?: string;
  'ar-scale'?: string;
  'camera-controls'?: boolean;
  'touch-action'?: string;
  'shadow-intensity'?: string;
  exposure?: string;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<ModelViewerAttributes, ModelViewerElement>;
    }
  }
}
