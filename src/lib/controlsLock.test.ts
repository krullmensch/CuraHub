import { beforeEach, describe, expect, it } from 'vitest';
import { isControlsLocked } from './controlsLock';
import { useEditorStore } from '@/store/editorStore';
import { useBookViewerStore } from '@/store/bookViewerStore';
import { useTourStore } from '@/store/tourStore';

// EditorPage's and WallEditorOverlay's key handlers return early on this (I3): an open dialog,
// such as the published-version question, must freeze the editor's shortcuts.
beforeEach(() => {
  useEditorStore.setState({ isDialogOpen: false });
  useBookViewerStore.getState().clear();
  useTourStore.setState({ active: false });
});

describe('isControlsLocked', () => {
  it('is false with nothing open', () => {
    expect(isControlsLocked()).toBe(false);
  });

  it('is true while a dialog is open', () => {
    useEditorStore.getState().setDialogOpen(true);
    expect(isControlsLocked()).toBe(true);
    useEditorStore.getState().setDialogOpen(false);
    expect(isControlsLocked()).toBe(false);
  });

  it('is true while the onboarding tour runs', () => {
    useTourStore.setState({ active: true });
    expect(isControlsLocked()).toBe(true);
  });
});
