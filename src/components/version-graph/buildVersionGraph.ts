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
  isOnActiveBranch: boolean;
  isLatestOnBranch: boolean;
  branchColor: string;
  [key: string]: unknown;
}

const BRANCH_PALETTE = [
  '#3b82f6', // blue   — main
  '#a855f7', // purple
  '#ec4899', // pink
  '#10b981', // emerald
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
];

function getBranchColor(branchOrder: string[], name: string): string {
  const idx = branchOrder.indexOf(name);
  return BRANCH_PALETTE[idx >= 0 ? idx % BRANCH_PALETTE.length : 0];
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

  // Assign stable color indices: main always first, others in first-appearance order
  const branchOrder: string[] = ['main'];
  for (const v of sorted) {
    if (!branchOrder.includes(v.branch_name)) branchOrder.push(v.branch_name);
  }

  // Detect merge-back nodes: parent is on a different branch, but this node's
  // branch_name already has earlier versions (i.e. it's merging back, not forking).
  // For layout we re-parent these to their most recent same-branch predecessor so
  // they land on the correct Y row. The real parent_version_id is kept for edges.
  const layoutParentOf = new Map<number, number>();
  for (const v of sorted) {
    if (v.parent_version_id == null) continue;
    const parent = byId.get(v.parent_version_id);
    if (!parent || parent.branch_name === v.branch_name) continue;
    // Child branch differs from parent branch — fork or merge-back?
    const sameBranchBefore = sorted.filter(
      (s) => s.branch_name === v.branch_name &&
             new Date(s.created_at) < new Date(v.created_at)
    );
    if (sameBranchBefore.length > 0) {
      // merge-back: layout parent = most recent same-branch predecessor
      layoutParentOf.set(v.id, sameBranchBefore[sameBranchBefore.length - 1].id);
    }
  }

  // Build parent → [children] map using layout parents for merge nodes
  const childrenOf = new Map<number, Version[]>();
  for (const v of sorted) {
    if (!childrenOf.has(v.id)) childrenOf.set(v.id, []);
    const effectiveParentId = layoutParentOf.get(v.id) ?? v.parent_version_id;
    if (effectiveParentId != null) {
      const arr = childrenOf.get(effectiveParentId) ?? [];
      arr.push(v);
      childrenOf.set(effectiveParentId, arr);
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

    // Height of the linear chain (follows same-branch succession)
    const chainHeight =
      sameBranch.length > 0 ? computeHeight(sameBranch[0].id) : 1;

    // Height contributed by forks (stacked below the chain)
    const forkTotal = forks.reduce((sum, f) => sum + computeHeight(f.id), 0);

    // When forks exist alongside a same-branch child they are placed BELOW the
    // chain row, so the total height is chain + forks. Without a same-branch
    // child they are centered around the parent so only their own total matters.
    const h = sameBranch.length > 0
      ? chainHeight + forkTotal
      : forkTotal === 0 ? 1 : forkTotal;
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
      const heights = forks.map((f) => subtreeHeight.get(f.id) ?? 1);
      const totalH = heights.reduce((s, h) => s + h, 0);

      let curY: number;
      if (sameBranch.length > 0) {
        // Main chain continues at y — place forks below it to avoid overlap
        curY = y + Y_FORK;
      } else {
        // No main chain — center the forks around the parent Y
        curY = y - ((totalH - 1) * Y_FORK) / 2;
      }

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

  // Find the latest version per branch (leaf = no same-branch child)
  const latestPerBranch = new Set<number>();
  const branchNames = new Set(sorted.map((v) => v.branch_name));
  for (const branch of branchNames) {
    const branchVersions = sorted.filter((v) => v.branch_name === branch);
    const leaf = branchVersions.find(
      (v) => !(childrenOf.get(v.id) ?? []).some((c) => c.branch_name === branch)
    );
    if (leaf) latestPerBranch.add(leaf.id);
  }

  const nodes: Node<VersionNodeData>[] = sorted.map((v) => {
    const pos = positions.get(v.id) ?? { x: 0, y: 0 };
    return {
      id: String(v.id),
      type: 'versionNode',
      position: pos,
      data: {
        version: v,
        isActive: v.id === activeVersionId,
        isOnActiveBranch: v.branch_name === (byId.get(activeVersionId ?? -1)?.branch_name ?? null),
        isLatestOnBranch: latestPerBranch.has(v.id),
        branchColor: getBranchColor(branchOrder, v.branch_name),
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  const edges: Edge[] = sorted
    .filter((v) => v.parent_version_id != null)
    .map((v) => {
      const color = getBranchColor(branchOrder, v.branch_name);
      return {
        id: `e${v.parent_version_id}-${v.id}`,
        source: String(v.parent_version_id),
        target: String(v.id),
        type: 'smoothstep',
        style: {
          stroke: color,
          strokeWidth: 1.5,
          strokeDasharray: '4 3',
        },
        animated: false,
      };
    });

  return { nodes, edges };
}
