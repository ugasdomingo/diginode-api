import process from 'node:process';
import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'tests/public-flows.test.js'],
  { stdio: 'inherit', env: { ...process.env, PUBLIC_REVIEW_SERVER: 'true' } }
);
child.on('exit', (code) => {
  process.exitCode = code;
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
