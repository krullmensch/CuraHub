import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  email: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      login: (token, user) => set({ token, user, isAuthenticated: true, isAdmin: user.role === 'admin' }),
      logout: () => set({ token: null, user: null, isAuthenticated: false, isAdmin: false }),
    }),
    {
      name: 'curahub-auth',
    }
  )
);
