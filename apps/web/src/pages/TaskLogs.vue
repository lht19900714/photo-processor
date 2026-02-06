<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NCard,
  NButton,
  NSpace,
  NSelect,
  NInput,
  NDataTable,
  NTag,
  NSpin,
  NEmpty,
  NBadge,
} from 'naive-ui';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { formatDate } from '@photo-processor/shared';
import type { TaskLog, ServerWSEvent } from '@photo-processor/shared';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { connected, subscribe, unsubscribe, onEvent, connect } = useWebSocket();

const taskId = parseInt(route.params.id as string, 10);
const loading = ref(true);
const logs = ref<TaskLog[]>([]);
const levelFilter = ref<string>('');
const searchText = ref('');
const newLogsCount = ref(0);
const autoScroll = ref(true);

// Level filter options
const levelOptions = [
  { label: 'All', value: '' },
  { label: 'Info', value: 'info' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' },
];

// Filtered logs
const filteredLogs = computed(() => {
  let result = logs.value;

  // Filter by level
  if (levelFilter.value) {
    result = result.filter((log) => log.level === levelFilter.value);
  }

  // Filter by search text
  if (searchText.value.trim()) {
    const search = searchText.value.toLowerCase();
    result = result.filter((log) => log.message.toLowerCase().includes(search));
  }

  return result;
});

// Table columns
const columns = [
  {
    title: 'Time',
    key: 'createdAt',
    width: 180,
    render: (row: TaskLog) => formatDate(row.createdAt),
  },
  {
    title: 'Level',
    key: 'level',
    width: 80,
    render: (row: TaskLog) => {
      const typeMap: Record<string, 'default' | 'warning' | 'error'> = {
        info: 'default',
        warn: 'warning',
        error: 'error',
      };
      return h(NTag, { type: typeMap[row.level], size: 'small' }, () => row.level.toUpperCase());
    },
  },
  {
    title: 'Message',
    key: 'message',
    ellipsis: {
      tooltip: true,
    },
  },
];

// Load initial logs
async function loadLogs() {
  loading.value = true;
  try {
    const response = await api.get<TaskLog[]>(`/tasks/${taskId}/logs?limit=500`);
    if (response.success && response.data) {
      // API returns logs in DESC order, reverse for chronological display
      logs.value = response.data.reverse().map(normalizeLog);
    }
  } finally {
    loading.value = false;
  }
}

// Normalize log field names (snake_case -> camelCase)
function normalizeLog(log: any): TaskLog {
  return {
    id: log.id,
    taskId: log.task_id ?? log.taskId,
    level: log.level,
    message: log.message,
    metadataJson: log.metadata_json ?? log.metadataJson,
    createdAt: log.created_at ?? log.createdAt,
  };
}

// Handle WebSocket log events
function handleWSEvent(event: ServerWSEvent) {
  if (event.type === 'log' && event.taskId === taskId) {
    const newLog: TaskLog = {
      id: Date.now(), // Temporary ID
      taskId: event.taskId,
      level: event.level,
      message: event.message,
      metadataJson: null,
      createdAt: event.timestamp,
    };
    logs.value.push(newLog);

    // Increment new logs counter if not at bottom
    if (!autoScroll.value) {
      newLogsCount.value++;
    }

    // Keep only last 1000 logs in memory
    if (logs.value.length > 1000) {
      logs.value = logs.value.slice(-1000);
    }
  }
}

// Scroll to bottom
function scrollToBottom() {
  newLogsCount.value = 0;
  autoScroll.value = true;
  // The table doesn't have a built-in scroll method,
  // so we rely on the user seeing new logs appear
}

// Clear new logs badge when filter changes
watch([levelFilter, searchText], () => {
  newLogsCount.value = 0;
});

let unsubscribeEvent: (() => void) | null = null;

onMounted(async () => {
  // Connect WebSocket if not connected
  if (!connected.value && authStore.token) {
    connect(authStore.token);
  }

  // Subscribe to task events
  subscribe(taskId);

  // Register event handler
  unsubscribeEvent = onEvent(handleWSEvent);

  // Load initial logs
  await loadLogs();
});

onUnmounted(() => {
  // Unsubscribe from task events
  unsubscribe(taskId);

  // Remove event handler
  if (unsubscribeEvent) {
    unsubscribeEvent();
  }
});

// Import h for render function
import { h } from 'vue';
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <NButton quaternary @click="router.push(`/tasks/${taskId}`)">
          ← Back
        </NButton>
        <h2 class="text-xl font-bold">Task Logs #{{ taskId }}</h2>
        <NBadge :value="newLogsCount" :max="99" v-if="newLogsCount > 0">
          <NButton size="small" @click="scrollToBottom">New Logs</NButton>
        </NBadge>
      </div>
      <NSpace>
        <NTag :type="connected ? 'success' : 'error'" size="small">
          {{ connected ? 'Live' : 'Disconnected' }}
        </NTag>
        <NButton @click="loadLogs" :loading="loading">Refresh</NButton>
      </NSpace>
    </div>

    <!-- Filters -->
    <NCard class="mb-4" size="small">
      <NSpace>
        <NSelect
          v-model:value="levelFilter"
          :options="levelOptions"
          placeholder="Filter by level"
          style="width: 120px"
          clearable
        />
        <NInput
          v-model:value="searchText"
          placeholder="Search..."
          clearable
          style="width: 240px"
        />
        <span class="text-gray-500 text-sm">
          {{ filteredLogs.length }} / {{ logs.length }} entries
        </span>
      </NSpace>
    </NCard>

    <!-- Logs Table -->
    <NCard>
      <NSpin :show="loading">
        <NDataTable
          v-if="filteredLogs.length > 0"
          :columns="columns"
          :data="filteredLogs"
          :bordered="false"
          :max-height="600"
          :pagination="{
            pageSize: 50,
            showSizePicker: true,
            pageSizes: [50, 100, 200],
          }"
          size="small"
          striped
        />
        <NEmpty v-else description="No logs available" />
      </NSpin>
    </NCard>
  </div>
</template>
