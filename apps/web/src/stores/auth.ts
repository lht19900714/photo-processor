import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User, LoginInput, LoginResponse } from '@photo-processor/shared';
import { api } from '@/lib/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem('token'));

  const isAuthenticated = computed(() => !!token.value);

  async function login(credentials: LoginInput): Promise<void> {
    const response = await api.post<LoginResponse>('/auth/login', credentials);
    if (response.success && response.data) {
      user.value = response.data.user;
      token.value = response.data.token;
      localStorage.setItem('token', response.data.token);
    } else {
      throw new Error(response.error || 'Login failed');
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore logout errors
    }
    user.value = null;
    token.value = null;
    localStorage.removeItem('token');
  }

  async function fetchUser(): Promise<void> {
    if (!token.value) return;

    try {
      const response = await api.get<User>('/auth/me');
      if (response.success && response.data) {
        user.value = response.data;
      } else {
        // Token invalid, clear it
        await logout();
      }
    } catch (e) {
      await logout();
    }
  }

  // Initialize: fetch user if token exists
  if (token.value) {
    fetchUser();
  }

  return {
    user,
    token,
    isAuthenticated,
    login,
    logout,
    fetchUser,
  };
});
