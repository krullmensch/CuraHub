import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuthStore } from '../store/authStore';
import { X, Trash2, UserMinus } from 'lucide-react';

interface ExhibitionEntry {
  id: number;
  title: string;
  slug: string;
  projectName: string;
}

interface Props {
  userId: number;
  userEmail: string;
  onClose: () => void;
}

export const UserExhibitionsModal = ({ userId, userEmail, onClose }: Props) => {
  const token = useAuthStore((s) => s.token);
  const [owned, setOwned] = useState<ExhibitionEntry[]>([]);
  const [collaborating, setCollaborating] = useState<ExhibitionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExhibitions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/admin/users/${userId}/exhibitions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setOwned(data.owned);
        setCollaborating(data.collaborating);
      } catch {
        setError('Ausstellungen konnten nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    };
    fetchExhibitions();
  }, [userId, token]);

  const handleDeleteExhibition = async (id: number) => {
    try {
      const res = await fetch(`/admin/exhibitions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setOwned((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert('Ausstellung konnte nicht gelöscht werden.');
    }
  };

  const handleRevokeAccess = async (exhibitionId: number) => {
    try {
      const res = await fetch(`/admin/exhibitions/${exhibitionId}/collaborators/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setCollaborating((prev) => prev.filter((e) => e.id !== exhibitionId));
    } catch {
      alert('Zugang konnte nicht entzogen werden.');
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <Dialog.Title className="text-white font-display text-xl font-light">
                Ausstellungen
              </Dialog.Title>
              <Dialog.Description className="text-zinc-500 text-sm mt-1">
                {userEmail}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="text-zinc-500 hover:text-white transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {loading && <p className="text-zinc-500 text-sm">Wird geladen…</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {!loading && !error && (
            <div className="space-y-8">
              {/* List A: Owned exhibitions */}
              <section>
                <h3 className="text-xs tracking-[0.2em] uppercase text-zinc-500 font-medium mb-3">
                  Eigene Ausstellungen
                </h3>
                {owned.length === 0 ? (
                  <p className="text-zinc-600 text-sm">Keine eigenen Ausstellungen.</p>
                ) : (
                  <ul className="space-y-2">
                    {owned.map((e) => (
                      <li key={e.id} className="flex items-center justify-between border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-950/50">
                        <div>
                          <p className="text-zinc-200 text-sm">{e.title}</p>
                          <p className="text-zinc-600 text-xs mt-0.5">{e.projectName}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteExhibition(e.id)}
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-3 py-1.5 rounded transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                          Löschen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* List B: Collaborating exhibitions */}
              <section>
                <h3 className="text-xs tracking-[0.2em] uppercase text-zinc-500 font-medium mb-3">
                  Kollaborationen
                </h3>
                {collaborating.length === 0 ? (
                  <p className="text-zinc-600 text-sm">Keine Kollaborationen.</p>
                ) : (
                  <ul className="space-y-2">
                    {collaborating.map((e) => (
                      <li key={e.id} className="flex items-center justify-between border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-950/50">
                        <div>
                          <p className="text-zinc-200 text-sm">{e.title}</p>
                          <p className="text-zinc-600 text-xs mt-0.5">{e.projectName}</p>
                        </div>
                        <button
                          onClick={() => handleRevokeAccess(e.id)}
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-orange-400 border border-zinc-700 hover:border-orange-800 px-3 py-1.5 rounded transition-all"
                        >
                          <UserMinus className="w-3 h-3" />
                          Zugang entziehen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
