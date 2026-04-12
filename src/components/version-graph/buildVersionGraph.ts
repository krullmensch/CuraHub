import type { Node, Edge } from '@xyflow/react';

export interface Version {
  id: number;
  comment: string | null;
  created_at: string;
  parent_version_id: number | null;
  branch_name: string;
  is_published: boolean;
  is_featured: boolean;
  creator: { id: number; email: string };
  _count: { instances: number };
}

export interface VersionNodeData {
  version: Version;
  isActive: boolean;
  [key: string]: unknown;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const X_STEP = 240;   // horizontal distance between parent and child
const Y_FORK = 120;   // vertical spacing unit between fork branches
const X_ROOT = 60;
const Y_ROOT = 180;

/**
 * Builds React Flow nodes and edges from a flat version list.
 *
 * Layout rules:
 * - Same-branch successor → directly to the right (same Y)
 * - Fork branches (different branch_name than parent) → diagonally, distributed
 *   above and below the parent's Y, with spacing proportional to subtree depth
 */
export function buildVersionGraph(
  versions: Version[],
  activeVersionId: number | null
): { nodes: Node<VersionNodeData>[]; edges: Edge[] } {
  if (versions.length === 0) return { nodes: [], edges: [] };

  const sorted = [...versions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const byId = new Map(sorted.map((v) => [v.id, v]));

  // Build parent → [children] map (sorted chronologically so fork order is stable)
  const childrenOf = new Map<number, Version[]>();
  for (const v of sorted) {
    if (!childrenOf.has(v.id)) childrenOf.set(v.id, []);
    if (v.parent_version_id != null) {
      const arr = childrenOf.get(v.parent_version_id) ?? [];
      arr.push(v);
      childrenOf.set(v.parent_version_id, arr);
    }
  }

  // Compute the "subtree height" for each node (in Y_FORK units).
  // This drives fork spacing so deep subtrees don't overlap.
  const subtreeHeight = new Map<number, number>();

  function computeHeight(id: number): number {
    const children = childrenOf.get(id) ?? [];
    if (children.length === 0) {
      subtreeHeight.set(id, 1);
      return 1;
    }
    const forks = children.filter(
      (c) => c.branch_name !== byId.get(id)!.branch_name
    );
    const sameBranch = children.filter(
      (c) => c.branch_name === byId.get(id)!.branch_name
    );

    // Height of the linear chain is the height of the last same-branch child
    const chainHeight =
      sameBranch.length > 0 ? computeHeight(sameBranch[0].id) : 1;

    // Height contributed by forks
    const forkTotal = forks.reduce((sum, f) => sum + computeHeight(f.id), 0);

    const h = Math.max(chainHeight, forkTotal === 0 ? 1 : forkTotal);
    subtreeHeight.set(id, h);
    return h;
  }

  const roots = sorted.filter((v) => v.parent_version_id == null);
  for (const root of roots) computeHeight(root.id);

  // Place nodes recursively
  const positions = new Map<number, { x: number; y: number }>();

  function place(version: Version, x: number, y: number) {
    positions.set(version.id, { x, y });

    const children = childrenOf.get(version.id) ?? [];
    const sameBranch = children.filter(
      (c) => c.branch_name === version.branch_name
    );
    const forks = children.filter(
      (c) => c.branch_name !== version.branch_name
    );

    // Same-branch successor → same row, step right
    for (const child of sameBranch) {
      place(child, x + X_STEP, y);
    }

    // Fork branches → step right + distribute vertically
    if (forks.length > 0) {
      // Compute total height span needed for all forks
      const heights = forks.map((f) => subtreeHeight.get(f.id) ?? 1);
      const totalH = heights.reduce((s, h) => s + h, 0);

      // Start Y so the block of forks is centered around parent Y
      let curY = y - ((totalH - 1) * Y_FORK) / 2;

      for (let i = 0; i < forks.length; i++) {
        const forkCenterY = curY + ((heights[i] - 1) * Y_FORK) / 2;
        place(forks[i], x + X_STEP, forkCenterY);
        curY += heights[i] * Y_FORK;
      }
    }
  }

  let rootY = Y_ROOT;
  for (const root of roots) {
    place(root, X_ROOT, rootY);
    rootY += (subtreeHeight.get(root.id) ?? 1) * Y_FORK + Y_FORK;
  }

  const nodes: Node<VersionNodeData>[] = sorted.map((v) => {
    const pos = positions.get(v.id) ?? { x: 0, y: 0 };
    return {
      id: String(v.id),
      type: 'versionNode',
      position: pos,
      data: { version: v, isActive: v.id === activeVersionId },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  const edges: Edge[] = sorted
    .filter((v) => v.parent_version_id != null)
    .map((v) => {
      const isFork =
        byId.get(v.parent_version_id!)?.branch_name !== v.branch_name;
      return {
        id: `e${v.parent_version_id}-${v.id}`,
        source: String(v.parent_version_id),
        target: String(v.id),
        type: isFork ? 'smoothstep' : 'default',
        style: {
          stroke: isFork ? '#6366f1' : '#3f3f46',
          strokeWidth: isFork ? 1.5 : 1,
          strokeDasharray: isFork ? '4 3' : undefined,
        },
        animated: false,
      };
    });

  return { nodes, edges };
}
