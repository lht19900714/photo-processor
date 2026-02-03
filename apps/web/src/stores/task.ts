import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TaskConfig, TaskRuntimeStatus, CreateTaskInput } from '@photo-processor/shared';
import { api } from '@/lib/api';

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<TaskConfig[]>([]);
  const currentTask = ref<TaskConfig | null>(null);
  const taskStatuses = ref<Map<number, TaskRuntimeStatus>>(new Map());
  const loading = ref(false);

  const activeTasks = computed(() => tasks.value.filter((t) => t.isActive));

  async function fetchTasks(): Promise<void> {
    loading.value = true;
    try {
      const response = await api.get<TaskConfig[]>('/tasks');
      if (response.success && response.data) {
        tasks.value = response.data;
      }
    } finally {
      loading.value = false;
    }
  }

  async function fetchTask(id: number): Promise<TaskConfig | null> {
    const response = await api.get<TaskConfig>(`/tasks/${id}`);
    if (response.success && response.data) {
      currentTask.value = response.data;
      return response.data;
    }
    return null;
  }

  async function createTask(input: CreateTaskInput): Promise<TaskConfig | null> {
    const response = await api.post<TaskConfig>('/tasks', input);
    if (response.success && response.data) {
      tasks.value.unshift(response.data);
      return response.data;
    }
    throw new Error(response.error || 'Failed to create task');
  }

  async function updateTask(id: number, input: Partial<TaskConfig>): Promise<TaskConfig | null> {
    const response = await api.put<TaskConfig>(`/tasks/${id}`, input);
    if (response.success && response.data) {
      const index = tasks.value.findIndex((t) => t.id === id);
      if (index !== -1) {
        tasks.value[index] = response.data;
      }
      if (currentTask.value?.id === id) {
        currentTask.value = response.data;
      }
      return response.data;
    }
    throw new Error(response.error || 'Failed to update task');
  }

  async function deleteTask(id: number): Promise<void> {
    const response = await api.delete(`/tasks/${id}`);
    if (response.success) {
      tasks.value = tasks.value.filter((t) => t.id !== id);
      if (currentTask.value?.id === id) {
        currentTask.value = null;
      }
    } else {
      throw new Error(response.error || 'Failed to delete task');
    }
  }

  async function startTask(id: number): Promise<void> {
    const response = await api.post(`/tasks/${id}/start`);
    if (!response.success) {
      throw new Error(response.error || 'Failed to start task');
    }
    await fetchTask(id);
  }

  async function stopTask(id: number): Promise<void> {
    const response = await api.post(`/tasks/${id}/stop`);
    if (!response.success) {
      throw new Error(response.error || 'Failed to stop task');
    }
    await fetchTask(id);
  }

  async function fetchTaskStatus(id: number): Promise<TaskRuntimeStatus | null> {
    const response = await api.get<TaskRuntimeStatus>(`/tasks/${id}/status`);
    if (response.success && response.data) {
      taskStatuses.value.set(id, response.data);
      return response.data;
    }
    return null;
  }

  return {
    tasks,
    currentTask,
    taskStatuses,
    loading,
    activeTasks,
    fetchTasks,
    fetchTask,
    createTask,
    updateTask,
    deleteTask,
    startTask,
    stopTask,
    fetchTaskStatus,
  };
});
