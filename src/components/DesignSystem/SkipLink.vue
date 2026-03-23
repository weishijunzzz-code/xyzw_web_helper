<template>
  <a
    href="#main-content"
    class="skip-link"
    @click="handleClick"
  >
    <slot>跳转到主要内容</slot>
  </a>
</template>

<script setup>
const handleClick = (e) => {
  e.preventDefault();
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.focus();
    mainContent.scrollIntoView({ behavior: 'smooth' });
  }
};
</script>

<style scoped lang="scss">
.skip-link {
  position: absolute;
  top: -100%;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-skip-link);
  padding: var(--space-3) var(--space-5);
  background: var(--primary-600);
  color: white;
  text-decoration: none;
  border-radius: var(--radius-lg);
  font-weight: var(--font-weight-medium);
  transition: top var(--transition-fast);
  
  &:focus {
    top: var(--space-4);
    outline: 2px solid white;
    outline-offset: 2px;
  }
}
</style>
