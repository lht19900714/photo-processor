<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  NCard,
  NButton,
  NDataTable,
  NSpace,
  NPopconfirm,
  NTag,
  useMessage,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSwitch,
} from 'naive-ui';
import { useTaskStore } from '@/stores/task';
import type { TaskConfig, CreateTaskInput } from '@photo-processor/shared';

const router = useRouter();
const message = useMessage();
const taskStore = useTaskStore();

const loading = ref(true);
const showCreateModal = ref(false);
const creating = ref(false);

const newTask = ref<CreateTaskInput>({
  name: '',
  targetUrl: '',
  dropboxPath: '/PhotoProcessor',
  checkInterval: 60,
  browserHeadless: true,
  browserTimeout: 30000,
});

const columns = [
  { title: '名称', key: 'name' },
  { title: '目标 URL', key: 'targetUrl', ellipsis: { tooltip: true } },
  {
    title: '检查间隔',
    key: 'checkInterval',
    render: (row: TaskConfig) => `${row.checkInterval}秒`,
  },
  {
    title: '状态',
    key: 'isActive',
    render: (row: TaskConfig) =>
      row.isActive
        ? h(NTag, { type: 'success' }, { default: () => '运行中' })
        : h(NTag, { type: 'default' }, { default: () => '已停止' }),
  },
  {
    title: '操作',
    key: 'actions',
    render: (row: TaskConfig) =>
      h(NSpace, null, {
        default: () => [
          h(
            NButton,
            {
              size: 'small',
              onClick: () => router.push(`/tasks/${row.id}`),
            },
            { default: () => '详情' }
          ),
          row.isActive
            ? h(
                NButton,
                {
                  size: 'small',
                  type: 'warning',
                  onClick: () => handleStop(row),
                },
                { default: () => '停止' }
              )
            : h(
                NButton,
                {
                  size: 'small',
                  type: 'primary',
                  onClick: () => handleStart(row),
                },
                { default: () => '启动' }
              ),
          h(
            NPopconfirm,
            {
              onPositiveClick: () => handleDelete(row),
            },
            {
              trigger: () =>
                h(
                  NButton,
                  { size: 'small', type: 'error' },
                  { default: () => '删除' }
                ),
              default: () => '确定要删除这个任务吗？',
            }
          ),
        ],
      }),
  },
];

import { h } from 'vue';

onMounted(async () => {
  try {
    await taskStore.fetchTasks();
  } finally {
    loading.value = false;
  }
});

async function handleCreate() {
  if (!newTask.value.name || !newTask.value.targetUrl || !newTask.value.dropboxPath) {
    message.warning('请填写完整信息');
    return;
  }

  creating.value = true;
  try {
    await taskStore.createTask(newTask.value);
    message.success('任务创建成功');
    showCreateModal.value = false;
    newTask.value = {
      name: '',
      targetUrl: '',
      dropboxPath: '/PhotoProcessor',
      checkInterval: 60,
      browserHeadless: true,
      browserTimeout: 30000,
    };
  } catch (error: any) {
    message.error(error.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function handleStart(task: TaskConfig) {
  try {
    await taskStore.startTask(task.id);
    message.success('任务已启动');
    await taskStore.fetchTasks();
  } catch (error: any) {
    message.error(error.message || '启动失败');
  }
}

async function handleStop(task: TaskConfig) {
  try {
    await taskStore.stopTask(task.id);
    message.success('任务已停止');
    await taskStore.fetchTasks();
  } catch (error: any) {
    message.error(error.message || '停止失败');
  }
}

async function handleDelete(task: TaskConfig) {
  try {
    await taskStore.deleteTask(task.id);
    message.success('任务已删除');
  } catch (error: any) {
    message.error(error.message || '删除失败');
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold">任务管理</h2>
      <NButton type="primary" @click="showCreateModal = true">
        创建任务
      </NButton>
    </div>

    <NCard>
      <NDataTable
        :columns="columns"
        :data="taskStore.tasks"
        :loading="loading"
        :bordered="false"
      />
    </NCard>

    <NModal
      v-model:show="showCreateModal"
      preset="card"
      title="创建任务"
      style="width: 600px"
    >
      <NForm :model="newTask" label-placement="left" label-width="100">
        <NFormItem label="任务名称" required>
          <NInput v-model:value="newTask.name" placeholder="例如：直播间照片下载" />
        </NFormItem>

        <NFormItem label="目标 URL" required>
          <NInput
            v-model:value="newTask.targetUrl"
            placeholder="直播页面的完整 URL"
          />
        </NFormItem>

        <NFormItem label="Dropbox 路径" required>
          <NInput
            v-model:value="newTask.dropboxPath"
            placeholder="/PhotoProcessor"
          />
        </NFormItem>

        <NFormItem label="检查间隔">
          <NInputNumber
            v-model:value="newTask.checkInterval"
            :min="10"
            :max="3600"
          >
            <template #suffix>秒</template>
          </NInputNumber>
        </NFormItem>

        <NFormItem label="无头模式">
          <NSwitch v-model:value="newTask.browserHeadless" />
        </NFormItem>
      </NForm>

      <template #footer>
        <NSpace justify="end">
          <NButton @click="showCreateModal = false">取消</NButton>
          <NButton type="primary" :loading="creating" @click="handleCreate">
            创建
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
