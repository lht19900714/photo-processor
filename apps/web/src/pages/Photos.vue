<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { NCard, NDataTable, NPagination, NSpin, NEmpty } from 'naive-ui';
import { api } from '@/lib/api';
import type { Photo, PaginatedResponse } from '@photo-processor/shared';
import { formatDate, formatBytes } from '@photo-processor/shared';

const loading = ref(true);
const photos = ref<Photo[]>([]);
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
});

const columns = [
  { title: 'ID', key: 'id', width: 80 },
  { title: '文件名', key: 'originalFilename', ellipsis: { tooltip: true } },
  { title: '指纹', key: 'fingerprint', ellipsis: { tooltip: true } },
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

onMounted(() => {
  fetchPhotos();
});

async function fetchPhotos() {
  loading.value = true;
  try {
    const response = await api.get<PaginatedResponse<Photo>>(
      `/photos?page=${pagination.value.page}&pageSize=${pagination.value.pageSize}`
    );
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
</script>

<template>
  <div>
    <h2 class="text-xl font-bold mb-6">下载历史</h2>

    <NCard>
      <NSpin :show="loading">
        <template v-if="photos.length === 0 && !loading">
          <NEmpty description="暂无下载记录" />
        </template>
        <template v-else>
          <NDataTable
            :columns="columns"
            :data="photos"
            :bordered="false"
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
