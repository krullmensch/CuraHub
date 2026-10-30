import { useCallback, useRef, useState } from 'react';
import { DEFAULT_FRAME_STYLE, type FrameStyleId } from '@/lib/frameStyles';
import type { PassepartoutValue } from '@/lib/passepartout';
import { useEditorStore } from '@/store/editorStore';

/**
 * Frame + passepartout as FrameControls edits them, with the same toggle memory as the properties
 * panel (switching the frame or passepartout back on restores the last value). `commit` receives
 * every change; choices also become the defaults for new drops, like in the panel.
 */
export function useFrameState(
  initial: { frameStyle: FrameStyleId; passepartout: PassepartoutValue },
  commit: (next: { frameStyle: FrameStyleId; passepartout: PassepartoutValue }) => void,
) {
  const [frameStyle, setFrameStyle] = useState(initial.frameStyle);
  const [passepartout, setPassepartout] = useState(initial.passepartout);
  const lastStyle = useRef(initial.frameStyle === 'none' ? DEFAULT_FRAME_STYLE : initial.frameStyle);
  const lastWidth = useRef(initial.passepartout.width > 0 ? initial.passepartout.width : 5);

  const onFrameStyleChange = useCallback((next: FrameStyleId) => {
    setFrameStyle(next);
    if (next !== 'none') {
      lastStyle.current = next;
      useEditorStore.getState().setDefaultFrameStyle(next);
    }
    commit({ frameStyle: next, passepartout });
  }, [commit, passepartout]);

  const onFrameToggle = useCallback((framed: boolean) => {
    onFrameStyleChange(framed ? lastStyle.current : 'none');
  }, [onFrameStyleChange]);

  const onPassepartoutChange = useCallback((next: PassepartoutValue) => {
    setPassepartout(next);
    if (next.width > 0) lastWidth.current = next.width;
    useEditorStore.getState().setDefaultPassepartout(next);
    commit({ frameStyle, passepartout: next });
  }, [commit, frameStyle]);

  const onPassepartoutToggle = useCallback((on: boolean) => {
    onPassepartoutChange({ width: on ? lastWidth.current : 0, placement: passepartout.placement });
  }, [onPassepartoutChange, passepartout.placement]);

  return { frameStyle, passepartout, onFrameStyleChange, onFrameToggle, onPassepartoutChange, onPassepartoutToggle };
}
