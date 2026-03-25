<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :title="isEdit ? '编辑任务' : '新增任务'"
    style="width: 90%; max-width: 600px"
    :mask-closable="false"
    @close="handleClose"
  >
    <n-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      label-placement="left"
      label-width="100px"
      require-mark-placement="right-hanging"
    >
      <n-form-item label="任务名称" path="name">
        <n-input 
          v-model:value="formData.name" 
          placeholder="请输入任务名称"
          clearable
        />
      </n-form-item>
      
      <n-form-item label="任务描述" path="description">
        <n-input 
          v-model:value="formData.description" 
          type="textarea"
          placeholder="请输入任务描述（可选）"
          :rows="2"
        />
      </n-form-item>
      
      <n-form-item label="执行时间" path="cronExpression">
        <n-input-group>
          <n-input 
            v-model:value="formData.cronExpression" 
            placeholder="例如: 0 3,10,15,19 * * *"
            clearable
          />
          <n-button @click="showCronHelper = true">
            <template #icon>
              <n-icon :component="HelpCircleOutline" />
            </template>
            帮助
          </n-button>
        </n-input-group>
        <template #feedback>
          <n-text v-if="cronValidation.message" :type="cronValidation.valid ? 'success' : 'error'">
            {{ cronValidation.message }}
          </n-text>
        </template>
      </n-form-item>
      
      <n-form-item label="下次执行">
        <n-text v-if="nextRunTimePreview" type="info">
          {{ formatNextRunTimePreview(nextRunTimePreview) }}
        </n-text>
        <n-text v-else depth="3">
          请输入有效的Cron表达式以预览下次执行时间
        </n-text>
      </n-form-item>
      
      <n-form-item label="任务模板" path="templateId">
        <n-select
          v-model:value="formData.templateId"
          :options="templateOptions"
          placeholder="选择任务模板"
          clearable
        />
      </n-form-item>
      
      <n-form-item label="关联账号" path="associatedAccounts">
        <n-select
          v-model:value="formData.associatedAccounts"
          :options="tokenOptions"
          placeholder="选择要执行任务的账号"
          multiple
          clearable
          :max-tag-count="3"
        />
      </n-form-item>
      
      <n-form-item label="初始状态" path="status">
        <n-radio-group v-model:value="formData.status">
          <n-radio-button value="running">立即启动</n-radio-button>
          <n-radio-button value="paused">暂停</n-radio-button>
        </n-radio-group>
      </n-form-item>
    </n-form>
    
    <template #footer>
      <n-space justify="end">
        <n-button @click="handleClose">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存' : '创建' }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
  
  <!-- Cron表达式帮助弹窗 -->
  <n-modal
    v-model:show="showCronHelper"
    preset="card"
    title="Cron表达式帮助"
    style="width: 90%; max-width: 500px"
  >
    <div class="cron-help-content">
      <p class="help-text">
        Cron表达式格式：<code>分 时 日 月 周</code>
      </p>
      
      <n-table :bordered="false" :single-line="false" size="small">
        <thead>
          <tr>
            <th>字段</th>
            <th>范围</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>分</td>
            <td>0-59</td>
            <td>分钟</td>
          </tr>
          <tr>
            <td>时</td>
            <td>0-23</td>
            <td>小时</td>
          </tr>
          <tr>
            <td>日</td>
            <td>1-31</td>
            <td>日期</td>
          </tr>
          <tr>
            <td>月</td>
            <td>1-12</td>
            <td>月份</td>
          </tr>
          <tr>
            <td>周</td>
            <td>0-7</td>
            <td>星期（0和7都是周日）</td>
          </tr>
        </tbody>
      </n-table>
      
      <div class="examples">
        <h4>常用示例：</h4>
        <ul>
          <li><code>0 8 * * *</code> - 每天上午8点</li>
          <li><code>0 3,10,15,19 * * *</code> - 每天3、10、15、19点</li>
          <li><code>0 4 11,17,23 * *</code> - 每月11、17、23号4点</li>
          <li><code>0 */4 * * *</code> - 每4小时</li>
          <li><code>0 11 * * 1,3,5</code> - 每周一、三、五11点</li>
        </ul>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useMessage } from 'naive-ui';
import { HelpCircleOutline } from '@vicons/ionicons5';
import { validateCronExpression, calculateNextExecutionTime } from '@/utils/batch/cronUtils';
import { useTokenStore } from '@/stores/tokenStore';
import { useScheduledTaskStore } from '@/stores/scheduledTaskStore';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  task: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:show', 'save']);

const message = useMessage();
const tokenStore = useTokenStore();
const taskStore = useScheduledTaskStore();

const formRef = ref(null);
const saving = ref(false);
const showCronHelper = ref(false);

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
});

const isEdit = computed(() => !!props.task);

const formData = ref({
  name: '',
  description: '',
  cronExpression: '',
  templateId: null,
  associatedAccounts: [],
  status: 'running'
});

const rules = {
  name: [
    { required: true, message: '请输入任务名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  cronExpression: [
    { required: true, message: '请输入Cron表达式', trigger: 'blur' },
    { 
      validator: (rule, value) => {
        if (!value) return true;
        const result = validateCronExpression(value);
        return result.valid;
      },
      message: 'Cron表达式格式不正确',
      trigger: 'blur'
    }
  ],
  templateId: [
    { required: true, message: '请选择任务模板', trigger: 'change' }
  ],
  associatedAccounts: [
    { 
      type: 'array',
      required: true, 
      message: '请选择至少一个关联账号', 
      trigger: 'change',
      min: 1
    }
  ]
};

const cronValidation = computed(() => {
  if (!formData.value.cronExpression) {
    return { valid: false, message: '' };
  }
  return validateCronExpression(formData.value.cronExpression);
});

const nextRunTimePreview = computed(() => {
  if (!cronValidation.value.valid) return null;
  
  const result = calculateNextExecutionTime({
    runType: 'cron',
    cronExpression: formData.value.cronExpression
  });
  
  return result;
});

const templateOptions = computed(() => {
  return taskStore.templates.map(t => ({
    label: t.name,
    value: t.id
  }));
});

const tokenOptions = computed(() => {
  return tokenStore.gameTokens.map(t => ({
    label: `${t.name} (${t.server})`,
    value: t.id
  }));
});

const formatNextRunTimePreview = (date) => {
  if (!date) return '无法计算';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const resetForm = () => {
  formData.value = {
    name: '',
    description: '',
    cronExpression: '',
    templateId: null,
    associatedAccounts: [],
    status: 'running'
  };
  if (formRef.value) {
    formRef.value.restoreValidation();
  }
};

const handleClose = () => {
  visible.value = false;
  resetForm();
};

const handleSave = async () => {
  try {
    await formRef.value?.validate();
    
    saving.value = true;
    
    const saveData = {
      ...formData.value,
      templateName: taskStore.templates.find(t => t.id === formData.value.templateId)?.name
    };
    
    emit('save', saveData, isEdit.value ? props.task.id : null);
    
    message.success(isEdit.value ? '任务已更新' : '任务已创建');
    handleClose();
  } catch (error) {
    console.error('表单验证失败:', error);
    message.error('请检查表单填写是否正确');
  } finally {
    saving.value = false;
  }
};

// 监听编辑任务变化
watch(() => props.task, (newTask) => {
  if (newTask) {
    nextTick(() => {
      formData.value = {
        name: newTask.name || '',
        description: newTask.description || '',
        cronExpression: newTask.cronExpression || '',
        templateId: newTask.templateId || null,
        associatedAccounts: newTask.associatedAccounts || [],
        status: newTask.status || 'running'
      };
    });
  } else {
    resetForm();
  }
}, { immediate: true });

// 监听显示状态
watch(() => props.show, (show) => {
  if (show) {
    // 加载模板和Token列表
    taskStore.loadTemplates();
  }
});
</script>

<style scoped lang="scss">
.cron-help-content {
  .help-text {
    margin-bottom: 16px;
    font-size: 14px;
    
    code {
      background: var(--bg-secondary, #f3f4f6);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }
  }
  
  .examples {
    margin-top: 20px;
    
    h4 {
      margin-bottom: 12px;
      font-size: 14px;
      font-weight: 600;
    }
    
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      
      li {
        padding: 6px 0;
        font-size: 13px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
        
        &:last-child {
          border-bottom: none;
        }
        
        code {
          background: var(--bg-secondary, #f3f4f6);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          margin-right: 8px;
        }
      }
    }
  }
}

// 深色模式适配
[data-theme="dark"] {
  .cron-help-content {
    .help-text code,
    .examples ul li code {
      background: var(--bg-tertiary, #374151);
    }
    
    .examples ul li {
      border-color: var(--border-light, #4b5563);
    }
  }
}
</style>
