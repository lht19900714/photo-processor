<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue';
import { NCard, NDataTable, NPagination, NSpin, NEmpty, NSelect, NSpace, NTag, type SelectOption } from 'naive-ui';
import { api } from '@/lib/api';
import type { Photo, PaginatedResponse, TaskConfig } from '@photo-processor/shared';
import { formatDate, formatBytes } from '@photo-processor/shared';

const loading = ref(true);
const photos = ref<Photo[]>([]);
const tasks = ref<TaskConfig[]>([]);
const selectedTaskId = ref<string>('all');
const selectedStatus = ref<string>('all');

const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
});

const taskOptions = computed<SelectOption[]>(() => [
  { label: '全部任务', value: 'all' },
  ...tasks.value.map((t) => ({ label: t.name, value: String(t.id) })),
]);

const statusOptions: SelectOption[] = [
  { label: '全部状态', value: 'all' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
];

const columns = [
  { title: 'ID', key: 'id', width: 80 },
  { title: '所属任务', key: 'taskName', width: 150, ellipsis: { tooltip: true } },
  { title: '文件名', key: 'originalFilename', ellipsis: { tooltip: true } },
  {
    title: '状态',
    key: 'status',
    width: 80,
    render: (row: Photo) =>
      h(
        NTag,
        { type: row.status === 'success' ? 'success' : 'error', size: 'small' },
        { default: () => (row.status === 'success' ? '成功' : '失败') }
      ),
  },
  {
    title: '大小',
    key: 'fileSize',
    width: 100,
    render: (row: Photo) => (row.fileSize ? formatBytes(row.fileSize) : '-'),
  },
  { title: 'Dropbox 路径', key: 'dropboxPath', ellipsis: { tooltip: true } },
  {
    title: '下载时间',
    key: 'downloadedAt',
    width: 180,
    render: (row: Photo) => formatDate(row.downloadedAt),
  },
];

onMounted(async () => {
  await fetchTasks();
  await fetchPhotos();
});

async function fetchTasks() {
  try {
    const response = await api.get<TaskConfig[]>('/tasks');
    if (response.success && response.data) {
      tasks.value = response.data;
    }
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
  }
}

async function fetchPhotos() {
  loading.value = true;
  try {
    let url = `/photos?page=${pagination.value.page}&pageSize=${pagination.value.pageSize}`;
    if (selectedTaskId.value && selectedTaskId.value !== 'all') {
      url += `&taskId=${selectedTaskId.value}`;
    }
    if (selectedStatus.value && selectedStatus.value !== 'all') {
      url += `&status=${selectedStatus.value}`;
    }
    const response = await api.get<PaginatedResponse<Photo>>(url);
    if (response.success && response.data) {
      photos.value = response.data.items;
      pagination.value.total = response.data.total;
      pagination.value.totalPages = response.data.totalPages;
    }
  } finally {
    loading.value = false;
  }
}

function handlePageChange(page: number) {
  pagination.value.page = page;
  fetchPhotos();
}

function handleTaskChange(value: string) {
  selectedTaskId.value = value;
  pagination.value.page = 1;
  fetchPhotos();
}

function handleStatusChange(value: string) {
  selectedStatus.value = value;
  pagination.value.page = 1;
  fetchPhotos();
}
</script>

<template>
  <div>
    <h2 class="text-xl font-bold mb-6">下载历史</h2>

    <NCard>
      <!-- 筛选区域 -->
      <div class="mb-4">
        <NSpace>
          <NSelect
            v-model:value="selectedTaskId"
            :options="taskOptions"
            placeholder="选择任务"
            style="width: 200px"
            clearable
            @update:value="handleTaskChange"
          />
          <NSelect
            v-model:value="selectedStatus"
            :options="statusOptions"
            placeholder="选择状态"
            style="width: 120px"
            clearable
            @update:value="handleStatusChange"
          />
        </NSpace>
      </div>

      <NSpin :show="loading">
        <template v-if="photos.length === 0 && !loading">
          <NEmpty description="暂无下载记录" />
        </template>
        <template v-else>
          <NDataTable
            :columns="columns"
            :data="photos"
            :bordered="false"
            :row-class-name="(row: Photo) => row.status === 'failed' ? 'bg-red-50' : ''"
          />
          <div class="mt-4 flex justify-end">
            <NPagination
              v-model:page="pagination.page"
              :page-count="pagination.totalPages"
              :page-size="pagination.pageSize"
              @update:page="handlePageChange"
            />
          </div>
        </template>
      </NSpin>
    </NCard>
  </div>
</template>

<style scoped>
:deep(.bg-red-50) {
  background-color: rgb(254 242 242) !important;
}
</style>
