import { useLocalStorage } from "@vueuse/core";
import { watch } from "vue";

export const accentOptions = [
  { value: "violet", label: "现代紫", color: "#7C3AED" },
  { value: "slate", label: "中性灰蓝", color: "#475569" },
  { value: "blue", label: "专业蓝", color: "#2563EB" },
  { value: "emerald", label: "沉稳绿", color: "#059669" },
  { value: "rose", label: "柔和红粉", color: "#E11D48" },
];
const accent = useLocalStorage("accent-theme", "blue", {
  serializer: { read: (value) => value, write: (value) => value },
});
const normalize = (value) =>
  accentOptions.some((option) => option.value === value) ? value : "blue";

/** Apply a validated accent to storage and the root element. */
export function setAccent(value) {
  accent.value = normalize(value);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.accent = accent.value;
  }
}

/** Restore the accent before mounting the application. */
export function initAccent() {
  const migrationKey = "accent-default-blue-v1";
  if (localStorage.getItem(migrationKey) !== "1") {
    setAccent(accent.value === "violet" ? "blue" : accent.value);
    localStorage.setItem(migrationKey, "1");
  } else {
    setAccent(accent.value);
  }
}

watch(accent, setAccent, { flush: "sync" });

/** Share one accent preference between every settings entry point. */
export function useAccent() {
  return { accent, accentOptions, setAccent, initAccent };
}
