import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--watch', 'server/index.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env
});

const prefix = (label) => (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text.split(/\n/).filter(Boolean).map((line) => `[${label}] ${line}\n`).join(''));
};

child.stdout.on('data', prefix('server'));
child.stderr.on('data', prefix('server'));

child.on('exit', (code, signal) => {
  if (signal === 'SIGINT' || signal === 'SIGTERM') {
    process.exit(0);
  }
  console.error(`[server] exited with code ${code}; restarting in 1s…`);
  setTimeout(() => process.exit(1), 1000);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
