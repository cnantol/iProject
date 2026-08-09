import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, '..', 'client');

const child = spawn('pnpm', ['dev'], {
  cwd: clientDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env
});

const prefix = (label) => (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text.split(/\n/).filter(Boolean).map((line) => `[${label}] ${line}\n`).join(''));
};

child.stdout.on('data', prefix('client'));
child.stderr.on('data', prefix('client'));

child.on('exit', (code, signal) => {
  if (signal === 'SIGINT' || signal === 'SIGTERM') {
    process.exit(0);
  }
  console.error(`[client] exited with code ${code}`);
  process.exit(code ?? 1);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
