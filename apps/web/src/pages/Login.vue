<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useMessage } from 'naive-ui';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const message = useMessage();
const authStore = useAuthStore();

const loading = ref(false);
const username = ref('');
const password = ref('');

async function handleLogin() {
  if (!username.value || !password.value) {
    message.warning('请输入用户名和密码');
    return;
  }

  loading.value = true;
  try {
    await authStore.login({ username: username.value, password: password.value });
    message.success('登录成功');
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (error: any) {
    message.error(error.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-800">PhotoProcessor</h1>
        <p class="text-gray-500 mt-2">照片自动下载工具</p>
      </div>

      <n-form @submit.prevent="handleLogin">
        <n-form-item label="用户名">
          <n-input
            v-model:value="username"
            placeholder="请输入用户名"
            size="large"
          />
        </n-form-item>

        <n-form-item label="密码">
          <n-input
            v-model:value="password"
            type="password"
            placeholder="请输入密码"
            size="large"
            show-password-on="click"
            @keyup.enter="handleLogin"
          />
        </n-form-item>

        <n-button
          type="primary"
          block
          size="large"
          :loading="loading"
          @click="handleLogin"
        >
          登录
        </n-button>
      </n-form>
    </div>
  </div>
</template>
