<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { NCard, NStatistic, NGrid, NGi, NSpin, NEmpty } from 'naive-ui';
import { useTaskStore } from '@/stores/task';
import { api } from '@/lib/api';
import type { PhotoStats, DropboxConfig } from '@photo-processor/shared';
import { formatBytes, formatRelativeTime } from '@photo-processor/shared';

const taskStore = useTaskStore();
const loading = ref(true);
const photoStats = ref<PhotoStats | null>(null);
const dropboxStatus = ref<DropboxConfig | null>(null);

onMounted(async () => {
  try {
    await Promise.all([
      taskStore.fetchTasks(),
      fetchPhotoStats(),
      fetchDropboxStatus(),
    ]);
  } finally {
    loading.value = false;
  }
});

async function fetchPhotoStats() {
  const response = await api.get<PhotoStats>('/photos/stats');
  if (response.success && response.data) {
    photoStats.value = response.data;
  }
}

async function fetchDropboxStatus() {
  const response = await api.get<DropboxConfig>('/dropbox/status');
  if (response.success && response.data) {
    dropboxStatus.value = response.data;
  }
}
</script>

<template>
  <div>
    <h2 class="text-xl font-bold mb-6">仪表板</h2>

    <NSpin :show="loading">
      <NGrid :cols="4" :x-gap="16" :y-gap="16">
        <NGi>
          <NCard>
            <NStatistic label="任务总数" :value="taskStore.tasks.length" />
          </NCard>
        </NGi>

        <NGi>
          <NCard>
            <NStatistic
              label="运行中任务"
              :value="taskStore.activeTasks.length"
            />
          </NCard>
        </NGi>

        <NGi>
          <NCard>
            <NStatistic
              label="已下载照片"
              :value="photoStats?.totalDownloaded || 0"
            />
          </NCard>
        </NGi>

        <NGi>
          <NCard>
            <NStatistic
              label="今日下载"
              :value="photoStats?.todayDownloaded || 0"
            />
          </NCard>
        </NGi>
      </NGrid>

      <div class="mt-6">
        <NGrid :cols="2" :x-gap="16">
          <NGi>
            <NCard title="Dropbox 状态">
              <template v-if="dropboxStatus?.isConnected">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-green-500"></span>
                  <span>已连接</span>
                </div>
                <p class="text-gray-500 mt-2">
                  {{ dropboxStatus.accountName }}
                  ({{ dropboxStatus.accountEmail }})
                </p>
              </template>
              <template v-else>
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-red-500"></span>
                  <span>未连接</span>
                </div>
                <p class="text-gray-500 mt-2">
                  请前往设置页面连接 Dropbox
                </p>
              </template>
            </NCard>
          </NGi>

          <NGi>
            <NCard title="下载统计">
              <div class="space-y-2">
                <p>
                  <span class="text-gray-500">总大小：</span>
                  {{ formatBytes(photoStats?.totalSize || 0) }}
                </p>
                <p>
                  <span class="text-gray-500">最近下载：</span>
                  {{
                    photoStats?.lastDownloadAt
                      ? formatRelativeTime(photoStats.lastDownloadAt)
                      : '暂无'
                  }}
                </p>
              </div>
            </NCard>
          </NGi>
        </NGrid>
      </div>

      <div class="mt-6">
        <NCard title="任务列表">
          <template v-if="taskStore.tasks.length === 0">
            <NEmpty description="暂无任务" />
          </template>
          <template v-else>
            <div class="space-y-3">
              <div
                v-for="task in taskStore.tasks"
                :key="task.id"
                class="p-4 border rounded-lg flex items-center justify-between hover:bg-gray-50"
              >
                <div>
                  <div class="font-medium">{{ task.name }}</div>
                  <div class="text-sm text-gray-500">{{ task.targetUrl }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-1 text-xs rounded"
                    :class="
                      task.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    "
                  >
                    {{ task.isActive ? '运行中' : '已停止' }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </NCard>
      </div>
    </NSpin>
  </div>
</template>
