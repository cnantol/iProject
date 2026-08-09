import { spawn } from 'node:child_process';

const procs = [
  { name: 'server', cmd: process.execPath, args: [process.argv[1].replace(/dev\\.mjs$/, 'dev-server.mjs')] },
  { name: 'client', cmd: process.execPath, args: [process.argv[1].replace(/dev\\.mjs$/, 'dev-client.mjs')] }
];

const children = procs.map(({ name, cmd, args }) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text.split(/\n/).filter(Boolean).map((line) => `[${name}] ${line}\n`).join(''));
  };
  child.stdout.on('data', tag);
  child.stderr.on('data', tag);
  child.on('exit', (code, signal) => {
    if (signal === 'SIGINT' || signal === 'SIGTERM') return;
    console.error(`[${name}] exited with code ${code}; killing siblings…`);
    children.forEach((c) => c !== child && c.kill('SIGTERM'));
    process.exit(code ?? 1);
  });
  return child;
});

const shutdown = () => {
  children.forEach((c) => c.kill('SIGINT'));
  setTimeout(() => process.exit(0), 200);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
