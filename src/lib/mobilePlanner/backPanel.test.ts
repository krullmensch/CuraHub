import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addBackPanel, BACK_PANEL_NAME } from './backPanel';

function artwork(): THREE.Group {
    const g = new THREE.Group();
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.02), new THREE.MeshStandardMaterial());
    front.position.z = 0.015; // 5 mm to 25 mm off the wall
    g.add(front);
    g.updateMatrixWorld(true);
    return g;
}

describe('addBackPanel', () => {
    it('covers the whole artwork from behind, just behind its back face', () => {
        const g = artwork();
        addBackPanel(g);
        const panel = g.getObjectByName(BACK_PANEL_NAME) as THREE.Mesh;
        expect(panel).toBeDefined();
        panel.geometry.computeBoundingBox();
        const box = panel.geometry.boundingBox!;
        expect(box.max.x - box.min.x).toBeCloseTo(0.6);
        expect(box.max.y - box.min.y).toBeCloseTo(0.9);
        expect(panel.position.z).toBeLessThan(0.005);
        expect(panel.position.z).toBeGreaterThan(0.004);
    });

    it('faces backwards (-Z) and is not double-sided', () => {
        const g = artwork();
        addBackPanel(g);
        const panel = g.getObjectByName(BACK_PANEL_NAME) as THREE.Mesh;
        panel.updateMatrixWorld(true);
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(panel.matrixWorld);
        expect(normal.z).toBeCloseTo(-1);
        expect((panel.material as THREE.Material).side).toBe(THREE.FrontSide);
    });

    it('does nothing for an empty group', () => {
        const g = new THREE.Group();
        addBackPanel(g);
        expect(g.children).toHaveLength(0);
    });
});
