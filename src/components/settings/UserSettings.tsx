import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Trash2, Layers, KeyRound, UserPlus } from 'lucide-react';
import { UserExhibitionsModal } from '@/components/UserExhibitionsModal';
import { toast } from '@/hooks/use-toast';
import { StartPasswordDialog } from '@/components/users/StartPasswordDialog';
import { isLocalAccount } from '@/lib/auth/localAccounts';
import { LOCAL_USERNAME_RE } from '@/lib/setup/validation';
import { Spinner } from '@/components/ui/loading';
import { Skeleton } from '@/components/ui/skeleton';

type AppRole = 'user' | 'curator' | 'prof' | 'admin';

interface UserRow {
  id: number;
  email: string;
  role: AppRole;
  createdAt: string;
  must_change_password: boolean;
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

/** Settings → Administration → Benutzer: every account, roles, local accounts, password resets. */
export const UserSettings = () => {
  const token = useAuthStore((s) => s.token);
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [modalUser, setModalUser] = useState<{ id: number; email: string } | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('curator');
  const [creating, setCreating] = useState(false);
  const [confirmResetId, setConfirmResetId] = useState<number | null>(null);
  const [startPassword, setStartPassword] = useState<{ username: string; password: string; created: boolean } | null>(null);

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
      toast.error('Fehler', { description: 'Rollenänderung fehlgeschlagen.' });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = newUsername.trim().toLowerCase();
    if (!LOCAL_USERNAME_RE.test(username)) {
      toast.error('Ungültiger Benutzername', { description: '3–32 Zeichen, nur a–z, 0–9, Punkt, Unterstrich und Bindestrich.' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username, role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Konto konnte nicht angelegt werden.');
      setUsers((prev) => [...prev, {
        ...data.user, createdAt: new Date().toISOString(), must_change_password: true, _count: { projects: 0 },
      }]);
      setNewUsername('');
      setStartPassword({ username: data.user.email, password: data.password, created: true });
    } catch (err) {
      toast.error('Fehler', { description: err instanceof Error ? err.message : 'Konto konnte nicht angelegt werden.' });
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (user: UserRow) => {
    try {
      const res = await fetch(`/admin/users/${user.id}/password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Passwort konnte nicht zurückgesetzt werden.');
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, must_change_password: true } : u)));
      setConfirmResetId(null);
      setStartPassword({ username: user.email, password: data.password, created: false });
    } catch (err) {
      toast.error('Fehler', { description: err instanceof Error ? err.message : 'Passwort konnte nicht zurückgesetzt werden.' });
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
      toast.error('Fehler', { description: 'Benutzer konnte nicht gelöscht werden.' });
    }
  };

  return (
    <div>
        {loading ? (
          <Skeleton className="h-4 w-40 mb-6 bg-zinc-800" />
        ) : !error && (
          <p className="text-zinc-400 text-sm mb-6">{users.length} registrierte Benutzer</p>
        )}

        <section className="border border-zinc-800 rounded-xl p-5 mb-8">
          <h3 className="font-display text-lg font-light mb-1">CuraHub-Konto anlegen</h3>
          <p className="text-xs text-zinc-400 mb-4">
            Für Personen ohne HSBI-Konto oder die ihr HSBI-Passwort nicht hier eingeben möchten. Sie melden sich
            unter „CuraHub-Konto" an und legen beim ersten Mal ein eigenes Passwort fest.
          </p>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5 text-xs text-zinc-400">
              Benutzername
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="vorname.nachname"
                autoComplete="off"
                required
                className="bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded px-3 py-1.5 w-56 focus:outline-none focus:border-zinc-500"
              />
            </label>
            <label className="grid gap-1.5 text-xs text-zinc-400">
              Rolle
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as AppRole)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5 cursor-pointer"
              >
                <option value="user">User</option>
                <option value="curator">Curator</option>
                <option value="prof">Prof</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-1.5 text-xs text-zinc-100 border border-zinc-600 hover:border-zinc-400 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded transition-all disabled:opacity-40"
            >
              {creating ? <Spinner className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
              {creating ? 'Wird angelegt…' : 'Konto anlegen'}
            </button>
          </form>
        </section>

        {loading && (
          <div className="border border-zinc-800 rounded-xl overflow-hidden" role="status" aria-label="Benutzer werden geladen">
            <div className="h-11 border-b border-zinc-800 bg-zinc-900/50" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-6 px-5 py-4 border-b border-zinc-800/50 last:border-b-0">
                <Skeleton className="h-4 w-40 bg-zinc-800" />
                <Skeleton className="h-6 w-20 bg-zinc-800" />
                <Skeleton className="h-4 w-28 bg-zinc-800" />
                <Skeleton className="h-4 w-10 bg-zinc-800" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && (
          <div className="border border-zinc-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left px-5 py-3 text-zinc-400 font-medium text-xs tracking-wide uppercase">Benutzer</th>
                  <th className="text-left px-5 py-3 text-zinc-400 font-medium text-xs tracking-wide uppercase">Rolle</th>
                  <th className="text-left px-5 py-3 text-zinc-400 font-medium text-xs tracking-wide uppercase">Registriert</th>
                  <th className="text-left px-5 py-3 text-zinc-400 font-medium text-xs tracking-wide uppercase">Projekte</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                      <td className="px-5 py-4 text-zinc-200">
                        {u.email.split('@')[0]}
                        {isLocalAccount(u.email) && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">lokal</span>
                        )}
                        {isLocalAccount(u.email) && u.must_change_password && (
                          <span className="ml-2 text-[10px] text-amber-400/80">Startpasswort noch nicht geändert</span>
                        )}
                      </td>
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
                      <td className="px-5 py-4 text-zinc-400 whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString('de-DE', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-4 text-zinc-400">{u._count.projects}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                          <button
                            onClick={() => { setModalUser({ id: u.id, email: u.email }); setConfirmDeleteId(null); }}
                            className="flex items-center gap-1.5 whitespace-nowrap text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded transition-all"
                          >
                            <Layers className="w-3 h-3" />
                            Ausstellungen
                          </button>
                          {!isSelf && isLocalAccount(u.email) && (
                            confirmResetId === u.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleResetPassword(u)}
                                  className="text-xs text-amber-300 hover:text-amber-200 border border-amber-800 hover:border-amber-600 px-3 py-1.5 rounded transition-all"
                                >
                                  Zurücksetzen
                                </button>
                                <button
                                  onClick={() => setConfirmResetId(null)}
                                  className="text-xs text-zinc-400 hover:text-zinc-300 px-2 py-1.5 rounded transition-colors"
                                >
                                  Abbrechen
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setConfirmResetId(u.id); setConfirmDeleteId(null); }}
                                className="flex items-center gap-1.5 whitespace-nowrap text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded transition-all"
                              >
                                <KeyRound className="w-3 h-3" />
                                Passwort zurücksetzen
                              </button>
                            )
                          )}
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
                                  className="text-xs text-zinc-400 hover:text-zinc-300 px-2 py-1.5 rounded transition-colors"
                                >
                                  Abbrechen
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(u.id)}
                                className="flex items-center gap-1.5 whitespace-nowrap text-xs text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-3 py-1.5 rounded transition-all"
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

      <StartPasswordDialog account={startPassword} onClose={() => setStartPassword(null)} />

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
