const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';

describe('Admin Login', () => {
  it('Admin page loads', async () => {
    const res = await fetch(`${BASE_URL}/admin`);
    expect(res.status).toBe(200);
  });

  it('Admin login API accepts POST', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD })
    });
    expect([200, 401]).toContain(res.status);
  });

  it('Admin API returns 401 without auth', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/jobs`);
    expect([401, 403]).toContain(res.status);
  });

  it('Admin me endpoint exists', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/me`);
    expect([200, 401, 403]).toContain(res.status);
  });
});
