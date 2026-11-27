<template>
  <!-- 手动输入表单 -->
  <NForm
    :model="importForm"
    label-placement="top"
    size="large"
    :show-label="true"
  >
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

    <NFormItem label="角色命名格式" :show-label="true">
      <NInput
        v-model:value="importForm.nameTemplate"
        placeholder="{name}-{index}-{id}"
      />
      <template #feedback>
        支持变量: {name}角色名, {id}角色ID, {index}角色序号, {server}区服
      </template>
    </NFormItem>

    <ServerRoleList
      :data="serverListData"
      max-height="50vh"
      @add="addSelectedRole"
      @download="handleDownload"
    />

    <a-list>
      <a-list-item v-for="(role, roleIndex) in roleList" :key="roleIndex">
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
          "
        >
          <div>
            <strong>角色名称:</strong> {{ role.name || "未命名角色" }}<br />
            <strong>服务器:</strong> {{ role.server || "未指定" }}<br />
            <strong>角色序号:</strong> {{ role.roleIndex }}
          </div>
          <NButton type="error" size="small" @click="removeRole(roleIndex)">
            删除
          </NButton>
        </div>
      </a-list-item>
    </a-list>

    <div class="form-actions">
      <NButton
        type="primary"
        size="large"
        block
        :loading="isImporting"
        :disabled="isPickingBin"
        @click="handleImport"
      >
        <template #icon>
          <NIcon>
            <CloudUpload />
          </NIcon>
        </template>
        添加Token
      </NButton>

      <NButton v-if="tokenStore.hasTokens" size="large" block @click="cancel">
        取消
      </NButton>
    </div>
  </NForm>
</template>

<script lang="ts" setup>
import { CloudUpload } from "@vicons/ionicons5";
import { NButton, NForm, NFormItem, NIcon, NInput, useMessage } from "naive-ui";
import PQueue from "p-queue";

import { reactive, ref } from "vue";

import useIndexedDB from "@/hooks/useIndexedDB";
import { useTokenStore } from "@/stores/tokenStore";
import {
  buildRoleBin,
  downloadBinFile,
  getRoleBinFileName,
} from "@/utils/binFile";
import { useBinFilePicker } from "@/utils/binFilePicker";
import { g_utils } from "@/utils/bonProtocol";
import { getServerList, getTokenId, transformToken } from "@/utils/token";

const $emit = defineEmits(["cancel", "ok"]);

const { storeArrayBuffer } = useIndexedDB();

const cancel = () => {
  roleList.value = [];
  $emit("cancel");
};

const removeRole = (index: number) => {
  roleList.value.splice(index, 1);
};

const tokenStore = useTokenStore();
const message = useMessage();
const isImporting = ref(false);
const importForm = reactive({
  name: "",
  server: "",
  wsUrl: "",
  importMethod: "",
  nameTemplate: "{name}-{index}-{id}",
});
const roleList = ref<
  Array<{
    id: string;
    name: string;
    roleId: string;
    token: string;
    server: string;
    roleIndex?: number;
    wsUrl: string;
    importMethod: string;
  }>
>([]);
const serverListData = ref<any[]>([]);
const originalBinData = ref<any>(null);

const tQueue = new PQueue({ concurrency: 1, interval: 1000 });

const handleDownload = (roleInfo: any) => {
  if (!originalBinData.value) {
    message.error("Bin数据丢失，请重新上传");
    return;
  }
  try {
    const newBinBuffer = buildRoleBin(originalBinData.value, roleInfo.serverId);
    const fileName = getRoleBinFileName(roleInfo);
    downloadBinFile(fileName, newBinBuffer);
    message.success(`已开始下载: ${fileName}`);
  } catch (e: any) {
    message.error(`下载失败: ${e.message}`);
  }
};

const addSelectedRole = async (roleInfo: any) => {
  if (!originalBinData.value) {
    message.error("Bin数据丢失，请重新上传");
    return;
  }

  try {
    const newBinBuffer = buildRoleBin(originalBinData.value, roleInfo.serverId);
    const tokenId = getTokenId(newBinBuffer);
    const roleToken = await transformToken(newBinBuffer);
    const roleName = roleInfo.name || `角色_${roleInfo.roleId}`;

    // 刷新indexDB数据库token数据 (保存原始bin)
    const saved = await storeArrayBuffer(tokenId, newBinBuffer);
    if (!saved) {
      throw new Error("保存BIN数据到IndexedDB失败，请检查浏览器存储空间或权限");
    }

    let sid = Number(roleInfo.serverId);
    let roleIndex = 0;
    if (sid >= 2000000) {
      roleIndex = 2;
      sid -= 2000000;
    } else if (sid >= 1000000) {
      roleIndex = 1;
      sid -= 1000000;
    }
    const serverNum = sid - 27;

    const template = importForm.nameTemplate || "{name}-{index}-{id}";
    const finalName = template
      .replace(/\{name\}/g, () => roleName)
      .replace(/\{index\}/g, () => String(roleIndex))
      .replace(/\{id\}/g, () => String(roleInfo.roleId))
      .replace(/\{server\}/g, () => `${String(serverNum)}服`);

    // 检查是否已存在相同配置 (根据角色名称和roleId)
    const exists = roleList.value.some(
      (r) => r.roleId === roleInfo.roleId && r.name === finalName,
    );

    if (exists) {
      message.warning(`角色 ${finalName} 已在待添加列表中`);
      return;
    }

    roleList.value.push({
      id: tokenId,
      roleId: roleInfo.roleId,
      token: roleToken,
      name: finalName,
      server: `${String(serverNum)}服`,
      roleIndex,
      wsUrl: importForm.wsUrl || "",
      importMethod: "bin",
    });

    message.success(`已添加角色: ${finalName}`);
  } catch {
    message.error("添加角色失败，请检查连接后重试");
  }
};

const uploadBin = (binFile: File) => {
  void tQueue.add(async () => {
    serverListData.value = [];
    originalBinData.value = null;
    try {
      if (!/\.(?:bin|dmp)$/i.test(binFile.name)) {
        message.warning("仅支持 .bin 和 .dmp 文件");
        return;
      }
      const bin = await binFile.arrayBuffer();
      const binMsg = g_utils.parse(bin);
      const rawBin = (binMsg as any)._raw;
      const binData = binMsg.getData() || (rawBin ? { ...rawBin } : null);
      if (!binData) {
        message.warning("文件内容无法识别，请重新选择");
        return;
      }

      const parsedList = JSON.parse(await getServerList(bin));
      originalBinData.value = binData;
      serverListData.value = parsedList && typeof parsedList === "object"
        ? Object.values(parsedList).sort((a: any, b: any) => b.power - a.power)
        : [];
      if (serverListData.value.length) message.success("请选择要添加的角色");
      else message.warning("这个文件没有可导入的角色");
    } catch {
      message.warning("无法读取角色列表，请检查文件和网络后重试");
    }
  });
  return false;
};

const { nativeBinPicker, isPickingBin, pickBinFiles } = useBinFilePicker(uploadBin, message.error);

const handleImport = async () => {
  if (roleList.value.length === 0) {
    message.error("请先上传bin文件！");
    return;
  }
  roleList.value.forEach((role) => {
    // tokenStore.gameTokens中发现已存在的重复名称，则移出token后重新添加
    const gameToken = tokenStore.gameTokens.find((t) => t.id === role.id);
    if (gameToken) {
      // tokenStore.removeToken(gameToken.id);
      tokenStore.updateToken(gameToken.id, {
        ...role,
      });
    } else {
      tokenStore.addToken({
        ...role,
      });
    }
  });
  message.success("Token添加成功");
  roleList.value = [];
  $emit("ok");
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
  "name": "/TokenImport/bin",
  "path": "/TokenImport/bin"
}
</route>
