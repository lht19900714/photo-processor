<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  NCard,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NTag,
  NPopconfirm,
  NSpin,
  NAlert,
  useMessage,
} from 'naive-ui';
import { api } from '@/lib/api';
import type { DropboxConfig, DropboxAuthUrl } from '@photo-processor/shared';
import { formatDate } from '@photo-processor/shared';

const route = useRoute();
const message = useMessage();

const loading = ref(true);
const connecting = ref(false);
const testing = ref(false);
const dropboxConfig = ref<DropboxConfig | null>(null);

onMounted(async () => {
  // Check for OAuth callback result
  const success = route.query.success;
  const error = route.query.error;

  if (success === 'true') {
    message.success('Dropbox 连接成功！');
  } else if (error) {
    message.error(`Dropbox 连接失败: ${error}`);
  }

  await fetchStatus();
});

async function fetchStatus() {
  loading.value = true;
  try {
    const response = await api.get<DropboxConfig>('/dropbox/status');
    if (response.success && response.data) {
      dropboxConfig.value = response.data;
    }
  } finally {
    loading.value = false;
  }
}

async function handleConnect() {
  connecting.value = true;
  try {
    const response = await api.get<DropboxAuthUrl>('/dropbox/auth-url');
    if (response.success && response.data) {
      // Redirect to Dropbox OAuth page
      window.location.href = response.data.url;
    } else {
      message.error(response.error || '获取授权链接失败');
    }
  } catch (error: any) {
    message.error(error.message || '连接失败');
  } finally {
    connecting.value = false;
  }
}

async function handleDisconnect() {
  try {
    const response = await api.delete('/dropbox/disconnect');
    if (response.success) {
      message.success('Dropbox 已断开连接');
      dropboxConfig.value = {
        isConnected: false,
        accountName: null,
        accountEmail: null,
        connectedAt: null,
      };
    } else {
      message.error(response.error || '断开连接失败');
    }
  } catch (error: any) {
    message.error(error.message || '操作失败');
  }
}

async function handleTest() {
  testing.value = true;
  try {
    const response = await api.post('/dropbox/test');
    if (response.success) {
      message.success(response.message || '连接测试成功');
    } else {
      message.error(response.error || '连接测试失败');
    }
  } catch (error: any) {
    message.error(error.message || '测试失败');
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div>
    <div class="flex items-center gap-4 mb-6">
      <RouterLink to="/settings">
        <NButton quaternary>← 返回</NButton>
      </RouterLink>
      <h2 class="text-xl font-bold">Dropbox 设置</h2>
    </div>

    <NSpin :show="loading">
      <NCard title="连接状态">
        <template v-if="dropboxConfig?.isConnected">
          <NDescriptions :column="1">
            <NDescriptionsItem label="状态">
              <NTag type="success">已连接</NTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="账户名称">
              {{ dropboxConfig.accountName }}
            </NDescriptionsItem>
            <NDescriptionsItem label="账户邮箱">
              {{ dropboxConfig.accountEmail }}
            </NDescriptionsItem>
            <NDescriptionsItem label="连接时间">
              {{ dropboxConfig.connectedAt ? formatDate(dropboxConfig.connectedAt) : '-' }}
            </NDescriptionsItem>
          </NDescriptions>

          <div class="mt-4 flex gap-2">
            <NButton :loading="testing" @click="handleTest">
              测试连接
            </NButton>
            <NPopconfirm @positive-click="handleDisconnect">
              <template #trigger>
                <NButton type="error">断开连接</NButton>
              </template>
              确定要断开 Dropbox 连接吗？
            </NPopconfirm>
          </div>
        </template>

        <template v-else>
          <NAlert type="info" class="mb-4">
            连接 Dropbox 后，下载的照片将自动上传到您的 Dropbox 账户。
          </NAlert>

          <NDescriptions :column="1">
            <NDescriptionsItem label="状态">
              <NTag type="error">未连接</NTag>
            </NDescriptionsItem>
          </NDescriptions>

          <div class="mt-4">
            <NButton type="primary" :loading="connecting" @click="handleConnect">
              连接 Dropbox
            </NButton>
          </div>
        </template>
      </NCard>
    </NSpin>
  </div>
</template>
