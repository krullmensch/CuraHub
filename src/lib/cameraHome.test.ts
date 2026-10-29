import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAMERA_HOME_DISTANCE,
  CAMERA_HOME_HEIGHT,
  cameraHomePose,
} from './cameraHome';
import { useEditorStore } from '../store/editorStore';

describe('cameraHomePose', () => {
  it('looks at the centre of the room', () => {
    expect(cameraHomePose().target).toEqual([0, 0, 0]);
  });

  it('stays 15 m from the target', () => {
    const { position, target } = cameraHomePose();
    const d = Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]);
    expect(d).toBeCloseTo(CAMERA_HOME_DISTANCE, 9);
  });

  it('is at least 10 m high', () => {
    expect(cameraHomePose().position[1]).toBeGreaterThanOrEqual(10);
    expect(cameraHomePose().position[1]).toBeCloseTo(CAMERA_HOME_HEIGHT, 9);
  });

  it('stands on the window side (windows sit in the wall at z = -3.65, facing -Z), centred in x', () => {
    const { position } = cameraHomePose();
    expect(position[2]).toBeLessThan(-3.65);
    expect(position[0]).toBeCloseTo(0, 9);
  });

  it('returns a fresh copy each time', () => {
    const a = cameraHomePose();
    a.position[0] = 99;
    a.target[1] = 99;
    expect(cameraHomePose().position[0]).toBe(0);
    expect(cameraHomePose().target[1]).toBe(0);
  });
});

describe('store start pose and project switch', () => {
  beforeEach(() => {
    useEditorStore.setState({
      plannerViewMode: 'perspective',
      activeProjectId: null,
      activeVersionId: null,
      focusTarget: null,
      orbitCameraState: { position: [1, 2, 3], target: [4, 5, 6], zoom: 40 },
    });
  });

  it('starts at the home pose', () => {
    // The initial state is what a fresh store is created with.
    const initial = useEditorStore.getInitialState().orbitCameraState;
    expect(initial.position).toEqual(cameraHomePose().position);
    expect(initial.target).toEqual(cameraHomePose().target);
  });

  it('opening another project resets the orbit pose and homes the perspective camera', () => {
    useEditorStore.getState().setActiveProject(1, 'A', 'a', 1, 1);
    const home = cameraHomePose();
    const s = useEditorStore.getState();
    expect(s.orbitCameraState.position).toEqual(home.position);
    expect(s.orbitCameraState.target).toEqual(home.target);
    expect(s.focusTarget).toEqual({ target: home.target, position: home.position, isHoming: true });
  });

  it('re-activating the same project keeps the camera', () => {
    useEditorStore.getState().setActiveProject(1, 'A', 'a', 1, 1);
    useEditorStore.setState({ focusTarget: null, orbitCameraState: { position: [1, 2, 3], target: [4, 5, 6], zoom: 40 } });
    useEditorStore.getState().setActiveProject(1, 'A', 'a', 1, 2);
    expect(useEditorStore.getState().orbitCameraState.position).toEqual([1, 2, 3]);
    expect(useEditorStore.getState().focusTarget).toBeNull();
  });

  it('in first person only the saved orbit pose changes (no lingering focus)', () => {
    useEditorStore.setState({ plannerViewMode: 'firstPerson' });
    useEditorStore.getState().setActiveProject(2, 'B', 'b', 2, 2);
    expect(useEditorStore.getState().orbitCameraState.position).toEqual(cameraHomePose().position);
    expect(useEditorStore.getState().focusTarget).toBeNull();
  });
});
