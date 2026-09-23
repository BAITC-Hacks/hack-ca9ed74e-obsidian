import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app';
import { loadCatalog } from '../src/server/catalog';

const server = createApp(loadCatalog());
let origin: string;
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

describe('HTTP API', () => {
  it('reports catalog and operational health', async () => {
    expect(await (await fetch(`${origin}/api/health`)).json()).toEqual({ status: 'ok', profiles: 66 });
    const meta = await (await fetch(`${origin}/api/catalog`)).json();
    expect(meta.count).toBe(66);
    expect(meta.aiConfigured).toBe(false);
    expect(meta.categories).toContain('Банкетный зал');
  });
  it('serves a complete recommendation without any AI account', async () => {
    const response = await fetch(`${origin}/api/recommend`, { method: 'POST', body: JSON.stringify({
      city: 'Алматы', category: 'Ведущий', format: 'корпоратив', date: '2026-10-10', budget: 1_000_000,
    }) });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe('matched');
    expect(result.recommendations).toHaveLength(3);
    expect(result.elapsedMs).toBeLessThan(10000);
    expect(result.explanationMode).toBe('local');
  });
  it('rejects malformed JSON and unsupported query values', async () => {
    expect((await fetch(`${origin}/api/recommend`, { method: 'POST', body: '{' })).status).toBe(400);
    expect((await fetch(`${origin}/api/recommend`, { method: 'POST', body: JSON.stringify({
      city: 'Несуществующий город', category: 'Ведущий', format: 'корпоратив', date: '2026-10-10', budget: 100,
    }) })).status).toBe(400);
  });
});
