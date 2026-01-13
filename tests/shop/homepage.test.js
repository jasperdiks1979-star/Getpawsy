const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Shop Homepage', () => {
  it('Homepage loads with 200 status', async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('<!doctype html');
  });

  it('Homepage contains GetPawsy branding', async () => {
    const res = await fetch(`${BASE_URL}/`);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('getpawsy');
  });

  it('Homepage contains hero section', async () => {
    const res = await fetch(`${BASE_URL}/`);
    const html = await res.text();
    expect(html).toContain('hero');
  });

  it('Homepage contains product grid', async () => {
    const res = await fetch(`${BASE_URL}/`);
    const html = await res.text();
    expect(html).toMatch(/product|grid|card/i);
  });
});
