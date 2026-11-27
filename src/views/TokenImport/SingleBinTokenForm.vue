<template>
  <!-- 手动输入表单 -->
  <NForm
    :model="importForm"
    label-placement="top"
    size="large"
    :show-label="true"
  >
    <NFormItem label="游戏角色名称" :show-label="true">
      <NInput
        v-model:value="importForm.name"
        placeholder="例如：主号战士"
        clearable
      />
    </NFormItem>

    <NFormItem label="BIN 文件" :show-label="true">
      <NButton v-if="nativeBinPicker" :loading="isPickingBin" :disabled="isImporting" @click="pickBinFiles">
        选择 BIN 文件
      </NButton>
      <a-upload
        v-else
        multiple
        accept=".bin,.dmp"
        @before-upload="uploadBin"
        draggable
        dropzone
        placeholder="粘贴Token字符串..."
        clearable
      >
        <!-- <div class="dropzone-content">
          请点击上传或将bind文件拖拽到此处
        </div> -->
      </a-upload>
    </NFormItem>
    <a-list v-if="files.length">
      <a-list-item v-for="item in files" :key="item.id">
        <div>
          <strong>{{ item.role?.name || item.fileName }}</strong><br />
          <span role="status">{{ item.status }}</span>
        </div>
      </a-list-item>
    </a-list>
    <NButton v-if="isReading" size="small" @click="stopReading">
      停止读取
    </NButton>

    <!-- 角色详情 -->
    <NCollapse>
      <NCollapseItem title="角色详情 (可选)" name="optional">
        <div class="optional-fields">
          <NFormItem label="服务器">
            <NInput
              v-model:value="importForm.server"
              placeholder="服务器名称"
            />
          </NFormItem>

          <NFormItem label="自定义连接地址">
            <NInput
              v-model:value="importForm.wsUrl"
              placeholder="留空使用默认连接"
            />
          </NFormItem>
        </div>
      </NCollapseItem>
    </NCollapse>

    <div class="form-actions">
      <NButton
        type="primary"
        size="large"
        block
        :loading="isImporting"
        :disabled="isPickingBin || isReading || !readyCount"
        @click="handleImport"
      >
        <template #icon>
          <NIcon>
            <CloudUpload />
          </NIcon>
        </template>
        添加Token
      </NButton>

      <NButton v-if="tokenStore.hasTokens" size="large" block :disabled="isImporting" @click="cancel">
        取消
      </NButton>
    </div>
  </NForm>
</template>

<script lang="ts" setup>
import { CloudUpload } from "@vicons/ionicons5";
import {
  NButton,
  NCollapse,
  NCollapseItem,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  useMessage,
} from "naive-ui";
import PQueue from "p-queue";

import { computed, onBeforeUnmount, reactive, ref } from "vue";

import useIndexedDB from "@/hooks/useIndexedDB";
import { useTokenStore } from "@/stores/tokenStore";
import { throwIfAborted } from "@/utils/abortSignal.js";
import { useBinFilePicker } from "@/utils/binFilePicker";
import { prepareBinToken, saveBinToken } from "@/utils/binTokenImport.js";
import { getTokenId, transformToken } from "@/utils/token";
import { getTokenErrorMessage } from "@/utils/tokenLogin.js";

const emit = defineEmits(["cancel", "ok"]);
const { storeArrayBuffer } = useIndexedDB();
const tokenStore = useTokenStore();
const message = useMessage();
const isImporting = ref(false);
const importForm = reactive({ name: "", server: "", wsUrl: "" });
type BinRole = Awaited<ReturnType<typeof prepareBinToken>>;
interface FileStatus {
  id: number;
  fileName: string;
  status: string;
  role: BinRole | null;
}
const files = ref<FileStatus[]>([]);
const queue = new PQueue({ concurrency: 1 });
const pendingIds = new Set<string>();
let sequence = 0;
let reading = new AbortController();

const isReading = computed(() =>
  files.value.some(({ status }) => status === "等待读取" || status === "读取中" || status === "校验中"),
);
const readyCount = computed(() => files.value.filter(({ role }) => role).length);

const stopReading = () => {
  reading.abort();
  reading = new AbortController();
  queue.clear();
  for (const item of files.value) {
    if (["等待读取", "读取中", "校验中"].includes(item.status)) item.status = "已停止";
  }
};

const cancel = () => {
  stopReading();
  emit("cancel");
};
onBeforeUnmount(stopReading);

const uploadBin = (file: File) => {
  if (isImporting.value) return false;
  const item = reactive<FileStatus>({
    id: ++sequence,
    fileName: file.name,
    status: "等待读取",
    role: null,
  });
  files.value.push(item);
  const signal = reading.signal;
  const options = { ...importForm, pendingIds, signal };
  void queue.add(async () => {
    try {
      item.status = "读取中";
      const role = await prepareBinToken(file, options, {
        getTokenId,
        transformToken,
        onAuthenticating: () => { item.status = "校验中"; },
      });
      throwIfAborted(signal);
      pendingIds.add(role.id);
      item.role = role;
      item.status = tokenStore.gameTokens.some(({ id }) => id === role.id)
        ? "已校验，提交后更新已有账号"
        : "已校验，等待提交";
    } catch (error) {
      if (!signal.aborted) item.status = getTokenErrorMessage(error);
    }
  });
  return false;
};

const { nativeBinPicker, isPickingBin, pickBinFiles } = useBinFilePicker(uploadBin, message.error);

const handleImport = async () => {
  if (isImporting.value || isReading.value || !readyCount.value) return;
  isImporting.value = true;
  let saved = 0;
  try {
    for (const item of files.value) {
      if (!item.role) continue;
      try {
        const result = await saveBinToken(item.role, tokenStore, storeArrayBuffer);
        item.role = null;
        item.status = result === "updated" ? "账号已更新" : "账号已添加";
        saved++;
      } catch (error) {
        item.status = getTokenErrorMessage(error);
      }
    }
    if (saved) message.success(`已保存 ${saved} 个账号`);
    if (saved === files.value.length) emit("ok");
  } finally {
    isImporting.value = false;
  }
};
</script>

<style scoped lang="scss">
.optional-fields {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;

  n-form-item {
    flex: 1;
    min-width: 200px;
  }
}

.form-actions {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dropzone-content {
  width: 100%;
  border: 1px dashed #fcc;
  border-radius: 8px;
  text-align: center;
  color: #888;
  padding: 40px 20px;
  font-size: 12px;
}
</style>

<route lang="json">
{
  "name": "/TokenImport/singlebin",
  "path": "/TokenImport/singlebin"
}
</route>
