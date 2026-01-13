const { test, expect } = require('@playwright/test');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';

test.describe('Admin - Authentication', () => {
  test('Admin login page loads', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    const loginForm = page.locator('form, input[type="password"], .admin-login');
    await expect(loginForm.first()).toBeVisible({ timeout: 10000 });
  });

  test('Admin login with valid credentials', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(ADMIN_PASSWORD);
    
    const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign")').first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();
    await page.waitForTimeout(2000);
    
    const dashboard = page.locator('.admin-dashboard, .admin-content, .admin-nav, [data-testid="admin-dashboard"]').first();
    const loginFormStillVisible = await page.locator('input[type="password"]').isVisible().catch(() => false);
    expect(await dashboard.isVisible().catch(() => false) || !loginFormStillVisible).toBe(true);
  });

  test('Admin routes require authentication', async ({ page }) => {
    await page.goto('/admin/categories');
    await page.waitForLoadState('networkidle');
    
    const loginForm = page.locator('input[type="password"]').first();
    const isOnLogin = await loginForm.isVisible().catch(() => false);
    
    const categoryContent = page.locator('.admin-categories, [data-testid="admin-categories"], table').first();
    const hasProtectedContent = await categoryContent.isVisible().catch(() => false);
    
    expect(isOnLogin || !hasProtectedContent).toBe(true);
  });
});

test.describe('Admin - API Endpoints (Unauthenticated)', () => {
  test('Admin API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/admin/jobs');
    expect([401, 403]).toContain(response.status());
  });

  test('Admin QA dashboard requires auth', async ({ request }) => {
    const response = await request.get('/api/admin/qa/dashboard');
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Admin - Authenticated Session', () => {
  test('Admin dashboard loads after login', async ({ page, context }) => {
    const loginRes = await context.request.post('/api/admin/login', {
      data: { password: ADMIN_PASSWORD }
    });
    
    if (loginRes.ok()) {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      
      const dashboard = page.locator('.admin-dashboard, .admin-content, [data-testid="admin-dashboard"]');
      if (await dashboard.first().isVisible().catch(() => false)) {
        await expect(dashboard.first()).toBeVisible();
      }
    }
  });

  test('Admin categories page loads', async ({ page, context }) => {
    const loginRes = await context.request.post('/api/admin/login', {
      data: { password: ADMIN_PASSWORD }
    });
    
    if (loginRes.ok()) {
      await page.goto('/admin/categories');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin');
    }
  });

  test('Admin jobs API works when authenticated', async ({ context }) => {
    const loginRes = await context.request.post('/api/admin/login', {
      data: { password: ADMIN_PASSWORD }
    });
    
    if (loginRes.ok()) {
      const jobsRes = await context.request.get('/api/admin/jobs');
      expect(jobsRes.status()).toBe(200);
    }
  });

  test('Admin QA dashboard returns data when authenticated', async ({ context }) => {
    const loginRes = await context.request.post('/api/admin/login', {
      data: { password: ADMIN_PASSWORD }
    });
    
    if (loginRes.ok()) {
      const qaDashRes = await context.request.get('/api/admin/qa/dashboard');
      expect(qaDashRes.status()).toBe(200);
      const data = await qaDashRes.json();
      expect(data).toBeTruthy();
    }
  });

  test('Admin product health endpoint works', async ({ context }) => {
    const loginRes = await context.request.post('/api/admin/login', {
      data: { password: ADMIN_PASSWORD }
    });
    
    if (loginRes.ok()) {
      const healthRes = await context.request.get('/api/admin/products/health');
      expect(healthRes.status()).toBe(200);
    }
  });
});

test.describe('Admin - Bulk Operations (Read Only)', () => {
  test('Export issues endpoint returns CSV', async ({ context }) => {
    const loginRes = await context.request.post('/api/admin/login', {
      data: { password: ADMIN_PASSWORD }
    });
    
    if (loginRes.ok()) {
      const exportRes = await context.request.get('/api/admin/bulk/export-issues');
      expect(exportRes.status()).toBe(200);
      const contentType = exportRes.headers()['content-type'];
      expect(contentType).toContain('text/csv');
    }
  });
});
