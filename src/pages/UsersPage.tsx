import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Trash2, Layers, ArrowLeft } from 'lucide-react';
import { UserExhibitionsModal } from '../components/UserExhibitionsModal';
import { gooeyToast } from 'goey-toast';

type AppRole = 'user' | 'curator' | 'prof' | 'admin';

interface UserRow {
  id: number;
  email: string;
  role: AppRole;
  createdAt: string;
  _count: { projects: number };
}

const ROLE_BADGE: Record<AppRole, string> = {
  user: 'bg-zinc-700 text-zinc-300',
  curator: 'bg-blue-900 text-blue-300',
  prof: 'bg-purple-900 text-purple-300',
  admin: 'bg-red-900 text-red-300',
};

const ROLE_LABELS: Record<AppRole, string> = {
  user: 'User',
  curator: 'Curator',
  prof: 'Prof',
  admin: 'Admin',
};

export const UsersPage = () => {
  const token = useAuthStore((s) => s.token);
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [modalUser, setModalUser] = useState<{ id: number; email: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        if (!cancelled) setUsers(await res.json());
      } catch {
        if (!cancelled) setError('Benutzer konnten nicht geladen werden.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [token]);

  const handleRoleChange = async (userId: number, newRole: AppRole) => {
    try {
      const res = await fetch(`/auth/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error();
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch {
      gooeyToast.error('Fehler', { description: 'Rollenänderung fehlgeschlagen.' });
    }
  };

  const handleDelete = async (userId: number) => {
    try {
      const res = await fetch(`/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setConfirmDeleteId(null);
    } catch {
      gooeyToast.error('Fehler', { description: 'Benutzer konnte nicht gelöscht werden.' });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-black/80 backdrop-blur-md border-b border-white/5">
        <Link to="/" className="font-display text-xl font-light tracking-wide text-white">
          Cura<span className="font-semibold">Hub</span>
        </Link>
        <Link to="/" className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs tracking-[0.12em] uppercase transition-colors">
          <ArrowLeft className="w-3 h-3" />
          Zurück
        </Link>
      </nav>

      <div className="pt-24 px-8 pb-16 max-w-5xl mx-auto">
        <h1 className="font-display text-3xl font-light text-white mb-2">Benutzerverwaltung</h1>
        {!loading && (
          <p className="text-zinc-500 text-sm mb-10">{users.length} registrierte Benutzer</p>
        )}

        {loading && (
          <div className="text-zinc-500 text-sm">Wird geladen…</div>
        )}

        {error && (
          <div className="text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && (
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs tracking-wide uppercase">E-Mail</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs tracking-wide uppercase">Rolle</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs tracking-wide uppercase">Registriert</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs tracking-wide uppercase">Projekte</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                      <td className="px-5 py-4 text-zinc-200">{u.email.split('@')[0]}</td>
                      <td className="px-5 py-4">
                        {isSelf ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[u.role]}`}>
                            {ROLE_LABELS[u.role]}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as AppRole)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 cursor-pointer hover:border-zinc-500 transition-colors"
                          >
                            <option value="user">User</option>
                            <option value="curator">Curator</option>
                            <option value="prof">Prof</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-4 text-zinc-400">
                        {new Date(u.createdAt).toLocaleDateString('de-DE', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-4 text-zinc-400">{u._count.projects}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => { setModalUser({ id: u.id, email: u.email }); setConfirmDeleteId(null); }}
                            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded transition-all"
                          >
                            <Layers className="w-3 h-3" />
                            Ausstellungen
                          </button>
                          {!isSelf && (
                            confirmDeleteId === u.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleDelete(u.id)}
                                  className="text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 px-3 py-1.5 rounded transition-all"
                                >
                                  Bestätigen
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1.5 rounded transition-colors"
                                >
                                  Abbrechen
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(u.id)}
                                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-3 py-1.5 rounded transition-all"
                              >
                                <Trash2 className="w-3 h-3" />
                                Löschen
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalUser && (
        <UserExhibitionsModal
          userId={modalUser.id}
          userEmail={modalUser.email}
          onClose={() => setModalUser(null)}
        />
      )}
    </div>
  );
};
