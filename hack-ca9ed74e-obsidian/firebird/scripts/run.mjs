import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const paths = {
  tsc: 'node_modules/typescript/bin/tsc',
  vite: 'node_modules/vite/bin/vite.js',
  tsx: 'node_modules/tsx/dist/cli.mjs',
  vitest: 'node_modules/vitest/vitest.mjs',
};
const children = new Set();
function run(tool, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [paths[tool], ...args], { stdio: 'inherit', windowsHide: true });
    children.add(child);
    child.on('error', reject);
    child.on('exit', code => {
      children.delete(child);
      code === 0 ? resolve() : reject(new Error(`${tool}: exit ${code}`));
    });
  });
}
function stop() { for (const child of children) child.kill(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  switch (process.argv[2]) {
    case 'dev':
      await Promise.race([run('tsx', ['watch', 'src/server/index.ts']), run('vite', ['--host', '127.0.0.1'])]);
      stop(); break;
    case 'build': await run('tsc', ['--noEmit']); await run('vite', ['build']); break;
    case 'start': await run('tsx', ['src/server/index.ts', '--production']); break;
    case 'test': await run('vitest', ['run']); break;
    case 'check': await run('tsc', ['--noEmit']); await run('vitest', ['run']); break;
    default: throw new Error('Use: node scripts/run.mjs dev|build|start|test|check');
  }
} catch (error) { console.error(error.message); stop(); process.exitCode = 1; }
