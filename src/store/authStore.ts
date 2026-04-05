import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppRole = 'user' | 'curator' | 'prof' | 'admin';

interface User {
  id: number;
  email: string;
  role: AppRole;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isCurator: boolean;
  isProf: boolean;
  isAdmin: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  /** Fetches /auth/me, updates token + role from the DB without re-login. */
  refreshAuth: () => Promise<void>;
}

const ROLE_HIERARCHY: Record<AppRole, number> = {
  user: 0,
  curator: 1,
  prof: 2,
  admin: 3,
};

function roleAtLeast(role: AppRole, min: AppRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[min];
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isCurator: false,
      isProf: false,
      isAdmin: false,
      login: (token, user) => set({
        token,
        user,
        isAuthenticated: true,
        isCurator: roleAtLeast(user.role, 'curator'),
        isProf: roleAtLeast(user.role, 'prof'),
        isAdmin: user.role === 'admin',
      }),
      logout: () => set({ token: null, user: null, isAuthenticated: false, isCurator: false, isProf: false, isAdmin: false }),

      refreshAuth: async () => {
        const currentToken = get().token;
        if (!currentToken) return;
        try {
          const res = await fetch('/auth/me', {
            headers: { 'Authorization': `Bearer ${currentToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            const user: User = data.user;
            set({
              token: data.token,
              user,
              isAuthenticated: true,
              isCurator: roleAtLeast(user.role, 'curator'),
              isProf: roleAtLeast(user.role, 'prof'),
              isAdmin: user.role === 'admin',
            });
          } else if (res.status === 401) {
            get().logout();
          }
        } catch {
          // Network error — silently skip, will retry on next trigger
        }
      },
    }),
    {
      name: 'curahub-auth',
    }
  )
);
