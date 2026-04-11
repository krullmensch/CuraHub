import { useAuthStore } from '../store/authStore';

export interface Folder {
  id: number;
  name: string;
  color: string;
  projectId: number;
  createdAt: string;
  updatedAt: string;
  _count?: { assets: number };
}

export interface FolderListResponse {
  folders: Folder[];
  unsortedCount: number;
}

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore parse error */
    }
    throw new Error(message);
  }
  return res.json();
}

export async function listFolders(projectId: number): Promise<FolderListResponse> {
  const res = await fetch(`/api/folders?projectId=${projectId}`, {
    headers: authHeaders(),
  });
  return jsonOrThrow(res) as Promise<FolderListResponse>;
}

export async function createFolder(input: {
  projectId: number;
  name: string;
  color?: string;
}): Promise<Folder> {
  const res = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  });
  return jsonOrThrow(res) as Promise<Folder>;
}

export async function updateFolder(
  id: number,
  data: { name?: string; color?: string }
): Promise<Folder> {
  const res = await fetch(`/api/folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  return jsonOrThrow(res) as Promise<Folder>;
}

export async function deleteFolder(id: number): Promise<{ id: number; unsortedCount: number }> {
  const res = await fetch(`/api/folders/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return jsonOrThrow(res) as Promise<{ id: number; unsortedCount: number }>;
}

export async function moveAssetToFolder(
  assetId: number,
  folderId: number | null
): Promise<unknown> {
  const res = await fetch(`/api/assets/${assetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ folderId }),
  });
  return jsonOrThrow(res);
}

export const FOLDER_COLOR_PALETTE = [
  '#6b7280', // zinc
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#a855f7', // purple
] as const;

export const DEFAULT_FOLDER_COLOR = '#6b7280';
