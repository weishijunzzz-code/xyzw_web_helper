<template>
  <div class="uni-input-wrapper" :class="{ 'uni-input--error': hasError }">
    <label v-if="label" class="uni-input__label">{{ label }}</label>
    <div class="uni-input__container">
      <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        class="uni-input"
        @input="handleInput"
        @blur="handleBlur"
        @focus="handleFocus"
      />
      <span v-if="suffix" class="uni-input__suffix">{{ suffix }}</span>
    </div>
    <span v-if="errorMessage" class="uni-input__error">{{ errorMessage }}</span>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  suffix: { type: String, default: '' },
  errorMessage: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue', 'blur', 'focus']);

const hasError = computed(() => !!props.errorMessage);

const handleInput = (e) => {
  emit('update:modelValue', e.target.value);
};

const handleBlur = (e) => {
  emit('blur', e);
};

const handleFocus = (e) => {
  emit('focus', e);
};
</script>

<script>
import { computed } from 'vue';
export default { name: 'UniInput' };
</script>

<style scoped lang="scss">
.uni-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.uni-input__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.uni-input__container {
  display: flex;
  align-items: center;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-primary);
  transition: all var(--transition-fast);
  
  &:focus-within {
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100);
  }
}

.uni-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-base);
  color: var(--text-primary);
  outline: none;
  
  &::placeholder {
    color: var(--text-tertiary);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.uni-input__suffix {
  padding-right: var(--space-4);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.uni-input__error {
  font-size: var(--font-size-xs);
  color: var(--error-500);
}

.uni-input--error .uni-input__container {
  border-color: var(--error-500);
  
  &:focus-within {
    box-shadow: 0 0 0 3px var(--error-100);
  }
}
</style>
