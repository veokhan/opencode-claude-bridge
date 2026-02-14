#!/usr/bin/env node
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWindows = process.platform === 'win32';
const entryPoint = join(__dirname, 'dist', 'cli.js');

// Use npx to run - this handles all platform issues
const args = ['npx', 'tsx', 'src/cli.ts', ...process.argv.slice(2)];

const proc = spawn(args[0], args.slice(1), {
  stdio: 'inherit',
  cwd: __dirname,
  shell: isWindows
});

proc.on('exit', (code) => process.exit(code || 0));
