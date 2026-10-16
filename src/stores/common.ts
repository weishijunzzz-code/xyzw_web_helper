import { useLocalStorage } from "@vueuse/core";

export const gameTokens = useLocalStorage<any[]>("gameTokens", []);
export const wsConnections = ref({}); // WebSocket连接状态
export const connectionLocks = ref(new Map()); // 连接操作锁，防止竞态条件
export const activeConnections = ref(new Map()); // 跨标签页连接协调

// Token管理
