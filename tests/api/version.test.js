const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('API Version Endpoints', () => {
  it('GET /api/version returns version info', async () => {
    const res = await fetch(`${BASE_URL}/api/version`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.version).toBeDefined();
  });

  it('GET /api/build returns build info', async () => {
    const res = await fetch(`${BASE_URL}/api/build`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeDefined();
  });

  it('GET /api/deploy-info returns deployment info', async () => {
    const res = await fetch(`${BASE_URL}/api/deploy-info`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeDefined();
  });
});
