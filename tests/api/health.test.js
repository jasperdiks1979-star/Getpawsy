const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('API Health Endpoints', () => {
  it('GET /health returns 200', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
  });

  it('GET /healthz returns 200', async () => {
    const res = await fetch(`${BASE_URL}/healthz`);
    expect(res.status).toBe(200);
  });

  it('GET /api/health returns JSON', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('GET /readyz returns ready status', async () => {
    const res = await fetch(`${BASE_URL}/readyz`);
    expect([200, 503]).toContain(res.status);
  });
});
