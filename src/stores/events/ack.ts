import type { EVM } from "./index";

// 处理_ack事件，通常用于确认收到某些重要消息
export const AckPlugin = ({ onSome }: EVM) => {
  onSome(["_sys/ack"], () => {});
};
