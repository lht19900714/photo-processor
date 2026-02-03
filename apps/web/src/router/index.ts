import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/pages/Login.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: () => import('@/components/layout/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'Dashboard',
          component: () => import('@/pages/Dashboard.vue'),
        },
        {
          path: 'tasks',
          name: 'Tasks',
          component: () => import('@/pages/Tasks.vue'),
        },
        {
          path: 'tasks/:id',
          name: 'TaskDetail',
          component: () => import('@/pages/TaskDetail.vue'),
        },
        {
          path: 'photos',
          name: 'Photos',
          component: () => import('@/pages/Photos.vue'),
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/pages/Settings.vue'),
        },
        {
          path: 'settings/dropbox',
          name: 'DropboxSettings',
          component: () => import('@/pages/DropboxSettings.vue'),
        },
      ],
    },
  ],
});

// Navigation guard
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();

  if (to.meta.requiresAuth !== false && !authStore.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
  } else if (to.name === 'Login' && authStore.isAuthenticated) {
    next({ name: 'Dashboard' });
  } else {
    next();
  }
});

export default router;
