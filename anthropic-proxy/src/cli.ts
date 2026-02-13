#!/usr/bin/env node

import { spawn, execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROXY_PORT = 8300;
const OPENCODE_PORT = 4096;

const isWindows = process.platform === 'win32';
const OPENCODE_CMD = isWindows ? 'opencode.cmd' : 'opencode';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '';
}

function getClaudeSettingsPath() {
  const home = getHomeDir();
  return join(home, '.claude', 'settings.json');
}

function getOpencodeSettingsPath() {
  const home = getHomeDir();
  return join(home, '.config', 'opencode', 'opencode.json');
}

function ensureDir(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJson(path: string): any {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

function writeJson(path: string, data: any) {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

async function configureClaudeCode(port: number) {
  log('\n📝 Configuring Claude Code...', colors.cyan);
  
  const settingsPath = getClaudeSettingsPath();
  const settings = readJson(settingsPath);
  
  settings.env = settings.env || {};
  settings.env.ANTHROPIC_BASE_URL = `http://localhost:${port}`;
  settings.env.ANTHROPIC_API_KEY = 'test-key';
  
  writeJson(settingsPath, settings);
  
  log('✅ Claude Code configured!', colors.green);
  log(`   Settings: ${settingsPath}`, colors.yellow);
}

async function unconfigureClaudeCode() {
  log('\n📝 Removing Claude Code configuration...', colors.cyan);
  
  const settingsPath = getClaudeSettingsPath();
  const settings = readJson(settingsPath);
  
  if (settings.env) {
    delete settings.env.ANTHROPIC_BASE_URL;
    delete settings.env.ANTHROPIC_API_KEY;
  }
  
  if (Object.keys(settings.env || {}).length === 0) {
    delete settings.env;
  }
  
  if (Object.keys(settings).length > 0) {
    writeJson(settingsPath, settings);
  } else if (existsSync(settingsPath)) {
    const fs = await import('fs');
    fs.unlinkSync(settingsPath);
  }
  
  log('✅ Claude Code configuration removed!', colors.green);
}

function checkOpenCode() {
  log('\n🔍 Checking OpenCode...', colors.cyan);
  
  try {
    const result = execSync(OPENCODE_CMD + ' --version', { encoding: 'utf-8' });
    log(`✅ OpenCode found: ${result.trim()}`, colors.green);
    return true;
  } catch (e) {
    log('❌ OpenCode not found!', colors.yellow);
    log('   Install: npm install -g opencode-ai', colors.yellow);
    return false;
  }
}

async function startOpenCode() {
  log('\n🚀 Starting OpenCode server...', colors.cyan);
  
  return new Promise((resolve) => {
    const proc = spawn(OPENCODE_CMD, ['serve', '--port', OPENCODE_PORT.toString()], {
      stdio: 'pipe',
      detached: false,
      shell: true
    });
    
    proc.stdout.on('data', (data) => {
      if (data.toString().includes('listening')) {
        log('✅ OpenCode server running on port ' + OPENCODE_PORT, colors.green);
        resolve(proc);
      }
    });
    
    proc.stderr.on('data', (data) => {
      if (data.toString().includes('listening')) {
        log('✅ OpenCode server running on port ' + OPENCODE_PORT, colors.green);
        resolve(proc);
      }
    });
    
    setTimeout(() => resolve(proc), 3000);
  });
}

async function startProxy() {
  log('\n🚀 Starting Bridge server...', colors.cyan);
  
  const proxyPath = join(__dirname, 'proxy.js');
  
  return new Promise((resolve) => {
    const proc = spawn('node', [proxyPath], {
      stdio: 'pipe',
      env: { ...process.env, PROXY_PORT: PROXY_PORT.toString() },
      detached: false
    });
    
    proc.stdout.on('data', (data) => {
      if (data.toString().includes('running')) {
        log('✅ Bridge server running!', colors.green);
        resolve(proc);
      }
    });
    
    proc.stderr.on('data', (data) => {
      const str = data.toString();
      if (str.includes('running')) {
        log('✅ Bridge server running!', colors.green);
        resolve(proc);
      }
      console.error(str);
    });
    
    setTimeout(() => resolve(proc), 2000);
  });
}

async function setup() {
  log('\n🛠️  Setting up OpenCode Bridge...', colors.blue);
  
  // Check if OpenCode is installed
  if (!checkOpenCode()) {
    log('\n⚠️  Please install OpenCode first:', colors.yellow);
    log('   npm install -g opencode-ai', colors.yellow);
    process.exit(1);
  }
  
  // Configure Claude Code
  await configureClaudeCode(PROXY_PORT);
  
  log('\n✅ Setup complete!', colors.green);
}

async function start() {
  log('\n🚀 Starting OpenCode Bridge...', colors.blue);
  
  // Check if OpenCode is installed
  if (!checkOpenCode()) {
    log('\n⚠️  Please install OpenCode first:', colors.yellow);
    log('   npm install -g opencode-ai', colors.yellow);
    process.exit(1);
  }
  
  // Start OpenCode server
  await startOpenCode();
  
  // Start proxy
  await startProxy();
  
  log('\n' + '='.repeat(50), colors.green);
  log('🎉 All services running!', colors.green);
  log('='.repeat(50), colors.green);
  log('\n📊 Dashboard: http://localhost:' + PROXY_PORT, colors.cyan);
  log('🤖 Claude Code: claude --print', colors.cyan);
  log('\nPress Ctrl+C to stop all services\n', colors.yellow);
}

async function stop() {
  log('\n🛑 Stopping OpenCode Bridge...', colors.yellow);
  
  // Kill processes on ports
  try {
    execSync('taskkill /F /IM node.exe 2>nul', { stdio: 'ignore' });
  } catch (e) {}
  
  try {
    execSync('taskkill /F /IM opencode.exe 2>nul', { stdio: 'ignore' });
  } catch (e) {}
  
  log('✅ Services stopped!', colors.green);
}

async function remove() {
  log('\n🗑️  Removing OpenCode Bridge...', colors.yellow);
  
  // Unconfigure Claude Code
  await unconfigureClaudeCode();
  
  log('✅ Bridge removed from Claude Code!', colors.green);
}

// CLI Commands
const command = process.argv[2];

switch (command) {
  case 'setup':
    setup();
    break;
  case 'start':
    start();
    break;
  case 'stop':
    stop();
    break;
  case 'remove':
    remove();
    break;
  case 'install':
    setup().then(() => start());
    break;
  default:
    log('\n📖 OpenCode Bridge CLI', colors.blue);
    log('\nUsage:', colors.cyan);
    log('  opencode-bridge setup    - Configure Claude Code', colors.reset);
    log('  opencode-bridge start   - Start all services', colors.reset);
    log('  opencode-bridge install - Setup + Start (all in one)', colors.reset);
    log('  opencode-bridge stop    - Stop all services', colors.reset);
    log('  opencode-bridge remove - Remove configuration', colors.reset);
    log('\nOr run with npx:', colors.yellow);
    log('  npx opencode-bridge install\n', colors.yellow);
    process.exit(1);
}
