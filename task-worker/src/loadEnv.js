import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载.env文件
config({ path: join(__dirname, '../.env') });

export const env = {
  FLASK_API_URL: process.env.FLASK_API_URL || 'http://localhost:5000/api/v1',
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || 'xyzw-internal-api-key-2024',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  TASK_CHECK_INTERVAL: parseInt(process.env.TASK_CHECK_INTERVAL || '1'),
  MAX_CONCURRENT_TASKS: parseInt(process.env.MAX_CONCURRENT_TASKS || '5'),
  TASK_TIMEOUT: parseInt(process.env.TASK_TIMEOUT || '300000'),
};

export default env;
