<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { NCard, NList, NListItem, NThing, NIcon } from 'naive-ui';
import { CloudOutline, PersonOutline } from '@vicons/ionicons5';
</script>

<template>
  <div>
    <h2 class="text-xl font-bold mb-6">设置</h2>

    <NCard>
      <NList hoverable clickable>
        <NListItem>
          <RouterLink to="/settings/dropbox" class="block">
            <NThing>
              <template #avatar>
                <NIcon :size="24">
                  <CloudOutline />
                </NIcon>
              </template>
              <template #header>Dropbox 设置</template>
              <template #description>
                管理 Dropbox 连接和授权
              </template>
            </NThing>
          </RouterLink>
        </NListItem>

        <NListItem>
          <NThing>
            <template #avatar>
              <NIcon :size="24">
                <PersonOutline />
              </NIcon>
            </template>
            <template #header>账户设置</template>
            <template #description>
              修改密码和账户信息
            </template>
          </NThing>
        </NListItem>
      </NList>
    </NCard>
  </div>
</template>
