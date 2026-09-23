import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { querySchema } from '../shared/schema';
import type { Profile } from '../shared/types';
import { match } from '../domain/match';
import { catalogMeta } from './catalog';
import { enhanceExplanations, type AIConfig } from './ai';

const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new Error('Запрос слишком большой');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createApp(profiles: Profile[], config: AIConfig | null = null, staticDir?: string) {
  const meta = catalogMeta(profiles, Boolean(config));
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { status: 'ok', profiles: profiles.length });
      if (url.pathname === '/api/catalog' && req.method === 'GET') return json(res, 200, meta);
      if (url.pathname === '/api/recommend' && req.method === 'POST') {
        const started = performance.now();
        let input: unknown;
        try { input = await body(req); } catch { return json(res, 400, { error: 'Ожидается корректный JSON размером до 16 КБ.' }); }
        const parsed = querySchema.safeParse(input);
        if (!parsed.success) return json(res, 400, { error: 'Проверьте параметры: положительный бюджет, дата 23.09–31.12.2026, длительность 0,5–24 ч.', issues: parsed.error.issues });
        const query = parsed.data;
        if (!meta.cities.includes(query.city) || !meta.categories.includes(query.category) || !meta.formats.includes(query.format) ||
          (query.language && !meta.languages.includes(query.language))) return json(res, 400, { error: 'Используйте город, категорию, формат и язык из каталога.' });
        const result = await enhanceExplanations(match(profiles, query), config);
        result.elapsedMs = Math.round(performance.now() - started);
        return json(res, 200, result);
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Метод API не найден.' });
      if (staticDir && req.method === 'GET') {
        const root = resolve(staticDir);
        const pathname = decodeURIComponent(url.pathname);
        const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
        if (!path.startsWith(root + sep)) return json(res, 403, { error: 'Недопустимый путь.' });
        try {
          const content = await readFile(path);
          res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
          return res.end(content);
        } catch { return json(res, 404, { error: 'Файл не найден. Выполните сборку приложения.' }); }
      }
      return json(res, 404, { error: 'Интерфейс разработки: http://127.0.0.1:5173' });
    } catch {
      if (!res.headersSent) json(res, 500, { error: 'Не удалось обработать запрос. Попробуйте ещё раз.' });
      else res.end();
    }
  });
}
