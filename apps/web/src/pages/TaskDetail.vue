<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NCard,
  NButton,
  NSpace,
  NDescriptions,
  NDescriptionsItem,
  NTag,
  NSpin,
  NPopconfirm,
  NStatistic,
  NGrid,
  NGi,
  NDataTable,
  NCollapse,
  NCollapseItem,
  useMessage,
} from 'naive-ui';
import { useTaskStore } from '@/stores/task';
import { formatDate } from '@photo-processor/shared';
import type { TaskRuntimeStatus, FailedDownload } from '@photo-processor/shared';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const taskStore = useTaskStore();

const loading = ref(true);
const taskId = parseInt(route.params.id as string, 10);
const taskStatus = ref<TaskRuntimeStatus | null>(null);
const failedDownloads = ref<FailedDownload[]>([]);
let statusInterval: ReturnType<typeof setInterval> | null = null;

const errorColumns = [
  { title: '文件名', key: 'filename', ellipsis: { tooltip: true } },
  { title: '错误原因', key: 'errorMessage', ellipsis: { tooltip: true } },
  {
    title: '失败时间',
    key: 'failedAt',
    width: 180,
    render: (row: FailedDownload) => formatDate(row.failedAt),
  },
];

onMounted(async () => {
  try {
    await taskStore.fetchTask(taskId);
    await refreshStatus();
    // Start status polling
    statusInterval = setInterval(refreshStatus, 5000);
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval);
  }
});

async function refreshStatus() {
  taskStatus.value = await taskStore.fetchTaskStatus(taskId);
  if (taskStatus.value && taskStatus.value.stats.failedPhotos > 0) {
    failedDownloads.value = await taskStore.fetchTaskErrors(taskId);
  }
}

async function handleStart() {
  try {
    await taskStore.startTask(taskId);
    message.success('任务已启动');
    await refreshStatus();
  } catch (error: any) {
    message.error(error.message || '启动失败');
  }
}

async function handleStop() {
  try {
    await taskStore.stopTask(taskId);
    message.success('任务已停止');
    await refreshStatus();
  } catch (error: any) {
    message.error(error.message || '停止失败');
  }
}

async function handleDelete() {
  try {
    await taskStore.deleteTask(taskId);
    message.success('任务已删除');
    router.push('/tasks');
  } catch (error: any) {
    message.error(error.message || '删除失败');
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <NButton quaternary @click="router.push('/tasks')">← 返回</NButton>
        <h2 class="text-xl font-bold">
          {{ taskStore.currentTask?.name || '任务详情' }}
        </h2>
      </div>
      <NSpace>
        <template v-if="taskStore.currentTask">
          <NButton @click="router.push(`/tasks/${taskId}/logs`)">
            View Logs
          </NButton>
          <NButton
            v-if="!taskStore.currentTask.isActive"
            type="primary"
            @click="handleStart"
          >
            启动任务
          </NButton>
          <NButton
            v-else
            type="warning"
            @click="handleStop"
          >
            停止任务
          </NButton>
          <NPopconfirm @positive-click="handleDelete">
            <template #trigger>
              <NButton type="error">删除任务</NButton>
            </template>
            确定要删除这个任务吗？
          </NPopconfirm>
        </template>
      </NSpace>
    </div>

    <NSpin :show="loading">
      <template v-if="taskStore.currentTask">
        <!-- 统计卡片 -->
        <NCard title="处理统计" class="mb-4">
          <NGrid :cols="4" :x-gap="16">
            <NGi>
              <NStatistic label="总处理数" :value="taskStatus?.stats.totalPhotos || 0" />
            </NGi>
            <NGi>
              <NStatistic label="成功下载">
                <template #default>
                  <span class="text-green-600">{{ taskStatus?.stats.downloadedPhotos || 0 }}</span>
                </template>
              </NStatistic>
            </NGi>
            <NGi>
              <NStatistic label="失败数">
                <template #default>
                  <span :class="(taskStatus?.stats.failedPhotos || 0) > 0 ? 'text-red-600' : ''">
                    {{ taskStatus?.stats.failedPhotos || 0 }}
                  </span>
                </template>
              </NStatistic>
            </NGi>
            <NGi>
              <NStatistic label="运行周期" :value="taskStatus?.currentCycle || 0" />
            </NGi>
          </NGrid>
          <div v-if="taskStatus?.stats.lastDownloadAt" class="mt-4 text-sm text-gray-500">
            最后下载时间: {{ formatDate(taskStatus.stats.lastDownloadAt) }}
          </div>
        </NCard>

        <!-- 失败记录 -->
        <NCollapse v-if="failedDownloads.length > 0" class="mb-4">
          <NCollapseItem title="失败记录" name="errors">
            <template #header-extra>
              <NTag type="error" size="small">{{ failedDownloads.length }} 条</NTag>
            </template>
            <NDataTable
              :columns="errorColumns"
              :data="failedDownloads"
              :bordered="false"
              :max-height="300"
            />
          </NCollapseItem>
        </NCollapse>

        <NCard title="基本信息" class="mb-4">
          <NDescriptions :column="2">
            <NDescriptionsItem label="任务名称">
              {{ taskStore.currentTask.name }}
            </NDescriptionsItem>
            <NDescriptionsItem label="状态">
              <NTag :type="taskStore.currentTask.isActive ? 'success' : 'default'">
                {{ taskStore.currentTask.isActive ? '运行中' : '已停止' }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="目标 URL">
              {{ taskStore.currentTask.targetUrl }}
            </NDescriptionsItem>
            <NDescriptionsItem label="检查间隔">
              {{ taskStore.currentTask.checkInterval }} 秒
            </NDescriptionsItem>
            <NDescriptionsItem label="Dropbox 路径">
              {{ taskStore.currentTask.dropboxPath }}
            </NDescriptionsItem>
            <NDescriptionsItem label="无头模式">
              {{ taskStore.currentTask.browserHeadless ? '是' : '否' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="创建时间">
              {{ formatDate(taskStore.currentTask.createdAt) }}
            </NDescriptionsItem>
            <NDescriptionsItem label="更新时间">
              {{ formatDate(taskStore.currentTask.updatedAt) }}
            </NDescriptionsItem>
          </NDescriptions>
        </NCard>

        <NCard title="选择器配置">
          <NDescriptions :column="1">
            <NDescriptionsItem label="照片元素">
              <code>{{ taskStore.currentTask.selectors.photoItem }}</code>
            </NDescriptionsItem>
            <NDescriptionsItem label="点击元素">
              <code>{{ taskStore.currentTask.selectors.photoClick }}</code>
            </NDescriptionsItem>
            <NDescriptionsItem label="原图链接">
              <code>{{ taskStore.currentTask.selectors.viewOriginal }}</code>
            </NDescriptionsItem>
          </NDescriptions>
        </NCard>
      </template>
    </NSpin>
  </div>
</template>
