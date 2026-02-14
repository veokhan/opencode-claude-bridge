# OCB - OpenCode Bridge

**✅ Use OpenCode AI models directly in Claude Code with one command!**

## Quick Install (Recommended)

```bash
# Install globally
npm install -g ocb

# OR use npx (no install needed)
npx ocb install
```

That's it! The `install` command will:
1. Check OpenCode is installed
2. Configure Claude Code automatically
3. Start all services

## Usage

```bash
# Start everything (after install)
ocb start

# Or use npx
npx ocb start
```

### Available Commands

| Command | Description |
|---------|-------------|
| `ocb install` | Setup + Start (all in one) |
| `ocb start` | Start all services |
| `ocb stop` | Stop all services |
| `ocb setup` | Configure Claude Code only |
| `ocb remove` | Remove configuration |

## After Installation

1. **Dashboard:** http://localhost:8400
   - Switch models with one click
   - View usage stats
   - Reset session/stats

2. **Use Claude Code:**
   ```bash
   claude --print
   ```

## Features

- 🌐 **Beautiful Web Dashboard** - OpenCode-style UI
- 🔄 **2540+ Models** from 89 providers
- 📊 **Usage Tracking** - Requests and tokens
- ⚡ **Auto-Configuration** - No manual editing needed

## Manual Installation

If you prefer to install from source:

```bash
# Clone
git clone https://github.com/veokhan/ocb.git
cd ocb/anthropic-proxy

# Install & Build
npm install
npm run build

# Configure Claude Code (one command!)
node dist/cli.js setup

# Start
node dist/cli.js start
```

## How It Works

```
Claude Code → OCB → OpenCode → Any LLM
```

OCB makes Claude Code think it's talking to Anthropic, but requests go to OpenCode instead!

## Troubleshooting

**OpenCode not found?**
```bash
npm install -g opencode-ai
```

**Port already in use?**
```bash
ocb stop
ocb start
```

**Reset everything:**
```bash
ocb remove
npx ocb install
```

## Test Results

```
✅ Claude Code: Working
✅ Web Dashboard: Working  
✅ Model Switching: Working
✅ Usage Tracking: Working
✅ Auto-configuration: Working
```

## Tech Stack

- TypeScript
- Express.js
- Tailwind CSS (via CDN)
- OpenCode API

## License

MIT
