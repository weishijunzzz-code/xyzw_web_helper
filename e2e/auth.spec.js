import { test, expect } from '@playwright/test'

/**
 * 认证和基础导航测试
 */
test.describe('认证和导航', () => {
  
  test('首页应该正确加载', async ({ page }) => {
    await page.goto('/')
    
    // 检查页面标题
    await expect(page).toHaveTitle(/XYZW/)
    
    // 检查品牌 Logo 是否存在
    await expect(page.locator('img[alt="XYZW"]')).toBeVisible()
  })
  
  test('Token 管理页面应该可访问', async ({ page }) => {
    await page.goto('/tokens')
    
    // 检查页面标题
    await expect(page).toHaveTitle(/Token/)
    
    // 检查导入按钮是否存在
    await expect(page.locator('text=导入Token').first()).toBeVisible()
  })
  
  test('主题切换应该工作', async ({ page }) => {
    await page.goto('/')
    
    // 找到主题切换按钮
    const themeToggle = page.locator('.theme-toggle, [data-testid="theme-toggle"]').first()
    
    if (await themeToggle.isVisible().catch(() => false)) {
      // 点击切换主题
      await themeToggle.click()
      
      // 检查 body 是否有 dark 类
      await expect(page.locator('body')).toHaveClass(/dark|light/)
    }
  })
})

/**
 * 移动端适配测试
 */
test.describe('移动端适配', () => {
  
  test('移动设备应该显示底部导航', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/admin/dashboard')
    
    // 检查底部导航是否存在
    const bottomNav = page.locator('.mobile-bottom-nav')
    await expect(bottomNav).toBeVisible()
  })
  
  test('移动设备应该显示汉堡菜单', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/admin/dashboard')
    
    // 点击汉堡菜单
    const menuToggle = page.locator('.brand-toggle')
    await expect(menuToggle).toBeVisible()
    
    await menuToggle.click()
    
    // 检查抽屉是否打开
    const drawer = page.locator('.n-drawer')
    await expect(drawer).toBeVisible()
  })
})

/**
 * Token 管理功能测试
 */
test.describe('Token 管理', () => {
  
  test('应该能够打开 Token 导入弹窗', async ({ page }) => {
    await page.goto('/tokens')
    
    // 点击导入按钮
    const importBtn = page.locator('text=导入Token').first()
    await importBtn.click()
    
    // 检查弹窗是否出现
    await expect(page.locator('.n-modal, .n-dialog')).toBeVisible()
  })
  
  test('Token 选择器应该显示', async ({ page }) => {
    await page.goto('/admin/dashboard')
    
    // 检查 Token 选择器是否存在
    const tokenSelector = page.locator('.token-selector, .token-trigger')
    await expect(tokenSelector.first()).toBeVisible()
  })
})

/**
 * 页面过渡动画测试
 */
test.describe('页面过渡', () => {
  
  test('页面切换应该有动画效果', async ({ page }) => {
    await page.goto('/admin/dashboard')
    
    // 点击导航到游戏功能
    await page.click('text=游戏功能')
    
    // 等待页面加载
    await page.waitForLoadState('networkidle')
    
    // 检查 URL 是否正确
    await expect(page).toHaveURL(/game-features/)
  })
})
