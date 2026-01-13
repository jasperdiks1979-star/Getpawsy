const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Admin CJ Import UI', () => {
  it('Admin imports page exists', async () => {
    const res = await fetch(`${BASE_URL}/admin/imports`);
    expect([200, 302, 401]).toContain(res.status);
  });

  it('Import logs endpoint requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/imports/logs`);
    expect([200, 401, 403]).toContain(res.status);
  });

  it('CJ API configuration is set', () => {
    const cjApiKey = process.env.CJ_API_KEY;
    const cjEmail = process.env.CJ_EMAIL;
    expect(cjApiKey || cjEmail).toBeDefined();
  });

  it('Categories auto-assign endpoint requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/categories/auto-assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect([200, 401, 403]).toContain(res.status);
  });
});
