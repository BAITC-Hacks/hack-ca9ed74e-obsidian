import 'dotenv/config';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { loadCatalog } from './catalog';
import { getAIConfig } from './ai';

const production = process.argv.includes('--production');
const staticDir = production ? fileURLToPath(new URL('../../dist/', import.meta.url)) : undefined;
if (production && !existsSync(`${staticDir}/index.html`)) throw new Error('Сначала выполните pnpm build');
const profiles = loadCatalog();
const config = getAIConfig();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const app = createApp(profiles, config, staticDir);
app.listen(port, host, () => {
  console.log(`Firebird: http://${host}:${port} | ${profiles.length} профилей | объяснения: ${config ? 'AI с локальным резервом' : 'локальные'}`);
});
app.on('error', error => { console.error(`Ошибка запуска: ${error.message}`); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => app.close(() => process.exit(0)));
