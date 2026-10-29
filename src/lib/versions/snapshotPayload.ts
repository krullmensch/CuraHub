import { useEditorStore } from '../../store/editorStore';
import { useWallEditorView } from '../../store/wallEditorViewStore';
import { frameStyleOf } from '../frameStyles';
import { serializeGuides } from '../wallEditor/guides';
import { isWallLayoutLoaded } from '../wallEditor/layoutSync';

export interface VersionSnapshotOptions {
  comment: string;
  branchName: string;
  sourceVersionId: number | null;
}

/** The JSON body for POST /api/exhibitions/:id/versions: the editor's current local state. */
export function buildVersionSnapshot(opts: VersionSnapshotOptions): Record<string, unknown> {
  const { comment, branchName, sourceVersionId } = opts;
  return {
    comment,
    branch_name: branchName,
    sourceVersionId,
    // 2D wall editor layout — only once it is loaded for this version; otherwise the server
    // copies the source version's stored layout. Guide keys use the wall ids sent with `walls`.
    ...(isWallLayoutLoaded(sourceVersionId) ? {
      hangingHeight: useWallEditorView.getState().hangingHeight,
      wallGuides: serializeGuides(useWallEditorView.getState().guidesByFace),
    } : {}),
    instances: (() => {
      const walls = useEditorStore.getState().localWalls;
      return useEditorStore.getState().localInstances.map(inst => ({
        artworkId: inst.artworkId !== undefined ? inst.artworkId : (inst.artwork.id !== undefined ? inst.artwork.id : undefined),
        assetId: inst.assetId,
        wallId: inst.wallId ?? null,
        wallIndex: inst.wallId ? walls.findIndex(w => w.id === inst.wallId) : null,
        medium: inst.medium ?? 'frame',
        frameStyle: frameStyleOf(inst.frameStyle),
        passepartoutWidth: inst.passepartoutWidth ?? 0,
        passepartoutPlacement: inst.passepartoutPlacement ?? 'center',
        opacity: inst.opacity ?? 1,
        position_x: inst.position_x,
        position_y: inst.position_y,
        position_z: inst.position_z,
        rotation_x: inst.rotation_x,
        rotation_y: inst.rotation_y,
        rotation_z: inst.rotation_z,
        scale_x: inst.scale_x,
        scale_y: inst.scale_y,
        scale_z: inst.scale_z,
      }));
    })(),
    walls: useEditorStore.getState().localWalls.map(w => ({
      id: w.id,
      label: w.label ?? null,
      position_x: w.position_x,
      position_y: w.position_y,
      position_z: w.position_z,
      rotation_x: w.rotation_x,
      rotation_y: w.rotation_y,
      rotation_z: w.rotation_z,
      width: w.width,
      height: w.height,
      thickness: w.thickness,
      color: w.color,
      isLocked: w.isLocked,
    })),
    scaleFigures: useEditorStore.getState().localScaleFigures.map(f => ({
      position_x: f.position_x,
      position_z: f.position_z,
      rotation_y: f.rotation_y,
      isPublic: f.isPublic,
    })),
  };
}

export type PostSnapshotResult = { ok: true; id: number } | { ok: false; error: string };

const FALLBACK_ERROR = 'Arbeitskopie konnte nicht angelegt werden.';

/** Creates a new version from the editor's current state. Never throws. */
export async function postVersionSnapshot(
  exhibitionId: number,
  token: string,
  opts: VersionSnapshotOptions,
): Promise<PostSnapshotResult> {
  try {
    const res = await fetch(`/api/exhibitions/${exhibitionId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(buildVersionSnapshot(opts)),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined;
      return { ok: false, error: typeof err === 'string' && err ? err : FALLBACK_ERROR };
    }
    const id = data && typeof data === 'object' ? (data as { id?: unknown }).id : undefined;
    if (typeof id !== 'number') return { ok: false, error: FALLBACK_ERROR };
    return { ok: true, id };
  } catch {
    return { ok: false, error: FALLBACK_ERROR };
  }
}
