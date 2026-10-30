import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { collectOccluders, pickArtworkAt } from './artworkPick';

function plane(z: number, name = ''): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.position.z = z;
    mesh.name = name;
    return mesh;
}

function setup(occluderZ?: number) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const artwork = new THREE.Group();
    artwork.userData.instanceId = 7;
    artwork.userData.artworkInfo = { assetType: 'image', title: 'Bild' };
    artwork.add(plane(-3));
    scene.add(artwork);
    if (occluderZ !== undefined) scene.add(plane(occluderZ, 'ModularWall'));
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    return { scene, camera, artwork };
}

describe('pickArtworkAt', () => {
    it('hit at centre', () => {
        const { scene, camera, artwork } = setup();
        const pick = pickArtworkAt({ x: 0, y: 0 }, camera, [artwork], collectOccluders(scene));
        expect(pick?.instanceId).toBe(7);
        expect(pick?.group).toBe(artwork);
        expect(pick?.hit.distance).toBeCloseTo(3);
    });

    it('miss in empty space', () => {
        const { scene, camera, artwork } = setup();
        expect(pickArtworkAt({ x: 0.9, y: 0.9 }, camera, [artwork], collectOccluders(scene))).toBeNull();
    });

    it('occluded by a wall', () => {
        const { scene, camera, artwork } = setup(-2);
        expect(pickArtworkAt({ x: 0, y: 0 }, camera, [artwork], collectOccluders(scene))).toBeNull();
    });

    it('occluder behind the artwork does not block', () => {
        const { scene, camera, artwork } = setup(-4);
        expect(pickArtworkAt({ x: 0, y: 0 }, camera, [artwork], collectOccluders(scene))?.instanceId).toBe(7);
    });

    it('invisible artwork skipped', () => {
        const { scene, camera, artwork } = setup();
        artwork.children[0].visible = false;
        expect(pickArtworkAt({ x: 0, y: 0 }, camera, [artwork], collectOccluders(scene))).toBeNull();
    });

    it('beyond the maximum distance is a miss', () => {
        const { scene, camera, artwork } = setup();
        expect(pickArtworkAt({ x: 0, y: 0 }, camera, [artwork], collectOccluders(scene), undefined, 2)).toBeNull();
    });
});
