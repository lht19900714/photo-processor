<script setup lang="ts">
import { h, computed } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { NLayout, NLayoutSider, NLayoutContent, NMenu, NIcon, NButton, NDropdown } from 'naive-ui';
import {
  HomeOutline,
  ListOutline,
  ImagesOutline,
  SettingsOutline,
  LogOutOutline,
  PersonOutline,
} from '@vicons/ionicons5';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const menuOptions = [
  {
    label: () => h(RouterLink, { to: '/' }, { default: () => '仪表板' }),
    key: 'Dashboard',
    icon: () => h(NIcon, null, { default: () => h(HomeOutline) }),
  },
  {
    label: () => h(RouterLink, { to: '/tasks' }, { default: () => '任务管理' }),
    key: 'Tasks',
    icon: () => h(NIcon, null, { default: () => h(ListOutline) }),
  },
  {
    label: () => h(RouterLink, { to: '/photos' }, { default: () => '下载历史' }),
    key: 'Photos',
    icon: () => h(NIcon, null, { default: () => h(ImagesOutline) }),
  },
  {
    label: () => h(RouterLink, { to: '/settings' }, { default: () => '设置' }),
    key: 'Settings',
    icon: () => h(NIcon, null, { default: () => h(SettingsOutline) }),
  },
];

const activeKey = computed(() => {
  const name = route.name as string;
  if (name?.startsWith('Task')) return 'Tasks';
  if (name?.startsWith('Dropbox') || name?.startsWith('Settings')) return 'Settings';
  return name || 'Dashboard';
});

const userMenuOptions = [
  {
    label: '退出登录',
    key: 'logout',
    icon: () => h(NIcon, null, { default: () => h(LogOutOutline) }),
  },
];

function handleUserMenuSelect(key: string) {
  if (key === 'logout') {
    authStore.logout();
    router.push('/login');
  }
}
</script>

<template>
  <NLayout has-sider class="min-h-screen">
    <NLayoutSider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="200"
      :native-scrollbar="false"
      show-trigger
    >
      <div class="p-4 text-center font-bold text-lg border-b">
        PhotoProcessor
      </div>
      <NMenu
        :value="activeKey"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
      />
    </NLayoutSider>

    <NLayout>
      <div class="h-14 px-4 flex items-center justify-between border-b bg-white">
        <div class="text-lg font-medium">
          {{ route.meta.title || route.name }}
        </div>
        <NDropdown
          :options="userMenuOptions"
          @select="handleUserMenuSelect"
        >
          <NButton quaternary circle>
            <template #icon>
              <NIcon :size="20">
                <PersonOutline />
              </NIcon>
            </template>
          </NButton>
        </NDropdown>
      </div>

      <NLayoutContent class="p-6 bg-gray-50">
        <RouterView />
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>
