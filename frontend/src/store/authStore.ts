import { create } from 'zustand';
import { AuthUser, UserRole } from '@/types';

// Decode JWT payload without a library — the payload is just base64url JSON
function decodeToken(token: string): { sub: string; role: UserRole } | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function userFromToken(token: string): AuthUser | null {
  const payload = decodeToken(token);
  if (!payload) return null;
  return { userId: payload.sub, role: payload.role };
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

// Rehydrate from localStorage on app start
const storedToken = localStorage.getItem('accessToken');

export const useAuthStore = create<AuthState>((set) => ({
  user: storedToken ? userFromToken(storedToken) : null,
  isAuthenticated: !!storedToken,

  login: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user: userFromToken(accessToken), isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
  },
}));
