// 任务状态
export type TaskStatus = 'running' | 'paused' | 'error' | 'completed';

// 触发类型
export type TriggerType = 'manual' | 'scheduled' | 'auto';

// 执行状态
export type ExecutionStatus = 'success' | 'failed' | 'partial' | 'pending';

// 日志类型
export type LogType = 'info' | 'success' | 'error' | 'warning';

// 任务模板
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultCron: string;
  command: string;
  params?: Record<string, any>;
}

// 运行统计
export interface RunCount {
  total: number;
  today: number;
  todaySuccess: number;
  todayFailed: number;
}

// 定时任务
export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  templateId: string;
  cronExpression: string;
  associatedAccounts: string[];
  status: TaskStatus;
  nextRunTime?: string;
  lastRunTime?: string;
  runCount: RunCount;
  createdAt: string;
  updatedAt: string;
}

// 账号执行结果
export interface AccountExecutionResult {
  tokenId: string;
  tokenName: string;
  success: boolean;
  message: string;
  executedAt: string;
}

// 任务执行记录
export interface TaskExecutionRecord {
  id: string;
  taskId: string;
  taskName: string;
  templateId: string;
  triggerType: TriggerType;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  totalAccounts: number;
  successCount: number;
  failedCount: number;
  error?: string;
  results: AccountExecutionResult[];
}

// 执行日志
export interface ExecutionLog {
  time: string;
  message: string;
  type: LogType;
}

// 历史记录筛选
export interface HistoryFilter {
  status?: ExecutionStatus | 'all';
  startDate?: string;
  endDate?: string;
  keyword?: string;
}

// 通知类型
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

// 通知渠道
export type NotificationChannel = 'browser' | 'sound' | 'sms' | 'email' | 'webhook';

// 通知规则条件
export interface NotificationRuleConditions {
  eventType: 'task_success' | 'task_failed' | 'task_partial' | 'execution_error' | 'system_error';
  taskIds?: string[];
  minFailedCount?: number;
  consecutiveFailures?: number;
}

// 通知规则
export interface NotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: NotificationRuleConditions;
  channels: NotificationChannel[];
  cooldown: number;
  lastTriggered?: string;
}

// 通知消息
export interface NotificationMessage {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  taskId?: string;
  taskName?: string;
  createdAt: string;
  read: boolean;
}

// 通知设置
export interface NotificationSettings {
  browserEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  desktopEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  webhookUrl?: string;
  webhookEnabled: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

// 任务执行器状态
export interface TaskExecutorState {
  isExecuting: boolean;
  currentTask?: ScheduledTask;
  progress: number;
  logs: ExecutionLog[];
}

// 统计卡片数据
export interface StatisticCardData {
  title: string;
  value: number;
  icon: string;
  color: string;
  trend?: number;
}

// 分页参数
export interface PaginationParams {
  page: number;
  pageSize: number;
  total: number;
}

// API 响应
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// WebSocket 消息
export interface WebSocketMessage {
  type: 'command' | 'response' | 'error' | 'status';
  payload: any;
  timestamp: string;
}

// Cron 表达式解析结果
export interface CronExpression {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

// 任务创建/更新参数
export interface TaskFormData {
  name: string;
  description?: string;
  templateId: string;
  cronExpression: string;
  associatedAccounts: string[];
}

// 导出选项
export interface ExportOptions {
  format: 'json' | 'csv';
  dateRange?: { start: string; end: string };
  taskIds?: string[];
}

// 移动端触摸事件
export interface TouchEventData {
  startY: number;
  startX: number;
  currentY: number;
  currentX: number;
  deltaY: number;
  deltaX: number;
}
