import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright 端到端测试配置
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  
  /* 测试文件匹配模式 */
  testMatch: '**/*.spec.js',
  
  /* 测试超时时间 */
  timeout: 30 * 1000,
  
  /* 全局 expect 超时 */
  expect: {
    timeout: 5000
  },
  
  /* 禁止并行执行测试（避免状态冲突） */
  fullyParallel: false,
  
  /* 失败时禁止重试 */
  forbidOnly: !!process.env.CI,
  
  /* 失败时重试次数 */
  retries: process.env.CI ? 2 : 0,
  
  /* 并行工作进程数 */
  workers: process.env.CI ? 1 : undefined,
  
  /* 测试报告器 */
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  
  /* 共享项目配置 */
  use: {
    /* 基础 URL */
    baseURL: 'http://localhost:3000',
    
    /* 收集追踪信息 */
    trace: 'on-first-retry',
    
    /* 截图策略 */
    screenshot: 'only-on-failure',
    
    /* 视频录制策略 */
    video: 'on-first-retry',
    
    /* 视口大小 */
    viewport: { width: 1280, height: 720 },
    
    /* 忽略 HTTPS 错误 */
    ignoreHTTPSErrors: true,
    
    /* 启用 JavaScript */
    javaScriptEnabled: true
  },
  
  /* 项目配置 */
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-web-security']
        }
      }
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox']
      }
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari']
      }
    },
    /* 移动端测试 */
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5']
      }
    },
    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 12']
      }
    }
  ],
  
  /* 本地开发服务器配置 */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  }
})
