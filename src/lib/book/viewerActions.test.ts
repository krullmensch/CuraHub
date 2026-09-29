import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bookInReach, closeBook, openBook, type PointerEnv } from './viewerActions';
import { useBookViewerStore } from '@/store/bookViewerStore';
import { isControlsLocked } from '@/lib/controlsLock';
import { useEditorStore } from '@/store/editorStore';

const BOOK = { assetId: 7, title: 'Katalog', pageCount: 12, publicView: false };

function fakeEnv(locked: boolean) {
  const log: string[] = [];
  const env: PointerEnv = {
    pointerLocked: () => locked,
    exitPointerLock: () => log.push(`exit(book=${useBookViewerStore.getState().book ? 'set' : 'null'})`),
    requestPointerLock: () => log.push('request'),
    leaveFirstPerson: () => log.push('leave'),
  };
  return { env, log };
}

beforeEach(() => {
  useBookViewerStore.getState().clear();
  useEditorStore.setState({ isDialogOpen: false });
});

describe('openBook', () => {
  it('sets the book before releasing the pointer, so the unlock handler sees the lock', () => {
    const { env, log } = fakeEnv(true);
    openBook(BOOK, env);
    expect(log).toEqual(['exit(book=set)']);
    expect(useBookViewerStore.getState().resumeFirstPerson).toBe(true);
    expect(isControlsLocked()).toBe(true);
  });
  it('does not touch the pointer when it was not locked', () => {
    const { env, log } = fakeEnv(false);
    openBook(BOOK, env);
    expect(log).toEqual([]);
    expect(useBookViewerStore.getState().resumeFirstPerson).toBe(false);
  });
});

describe('closeBook', () => {
  it('re-locks at once after the close button in first person', () => {
    const { env, log } = fakeEnv(true);
    openBook(BOOK, env);
    closeBook('button', env);
    expect(log).toEqual(['exit(book=set)', 'request']);
    expect(isControlsLocked()).toBe(false);
  });
  it('leaves first person after ESC in the editor (no user gesture to re-lock)', () => {
    const { env, log } = fakeEnv(true);
    openBook(BOOK, env);
    closeBook('escape', env);
    expect(log).toEqual(['exit(book=set)', 'leave']);
  });
  it('leaves re-entry to the entry overlay after ESC in the public viewer', () => {
    const { env, log } = fakeEnv(true);
    openBook({ ...BOOK, publicView: true }, env);
    closeBook('escape', env);
    expect(log).toEqual(['exit(book=set)']);
  });
  it('does nothing when no book is open', () => {
    const { env, log } = fakeEnv(false);
    closeBook('button', env);
    expect(log).toEqual([]);
  });
});

describe('controls lock', () => {
  it('also follows the existing dialog flag', () => {
    useEditorStore.setState({ isDialogOpen: true });
    expect(isControlsLocked()).toBe(true);
  });
});

describe('bookInReach', () => {
  const proxy = new THREE.Object3D();
  proxy.userData.bookHitProxy = true;
  it('is true for the book hit box within 2.5 m', () => {
    expect(bookInReach({ object: proxy, distance: 2.4 }, true)).toBe(true);
  });
  it('is false further away, for other objects, or when the book is not readable', () => {
    expect(bookInReach({ object: proxy, distance: 2.6 }, true)).toBe(false);
    expect(bookInReach({ object: new THREE.Object3D(), distance: 1 }, true)).toBe(false);
    expect(bookInReach({ object: proxy, distance: 1 }, false)).toBe(false);
    expect(bookInReach(null, true)).toBe(false);
  });
});
