/**
 * Authentication types
 */
export interface User {
  id: number;
  username: string;
  createdAt: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
  expiresAt: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}
