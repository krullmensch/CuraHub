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
    (set) => ({
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
    }),
    {
      name: 'curahub-auth',
    }
  )
);
