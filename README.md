# OpenCode Claude Bridge

**✅ Use OpenCode AI models directly in Claude Code with one command!**

## Quick Install (Recommended)

```bash
# Install globally
npm install -g opencode-claude-bridge

# OR use npx (no install needed)
npx opencode-claude-bridge install
```

That's it! The `install` command will:
1. Check OpenCode is installed
2. Configure Claude Code automatically
3. Start all services

## Usage

```bash
# Start everything (after install)
opencode-bridge start

# Or use npx
npx opencode-bridge start
```

### Available Commands

| Command | Description |
|---------|-------------|
| `opencode-bridge install` | Setup + Start (all in one) |
| `opencode-bridge start` | Start all services |
| `opencode-bridge stop` | Stop all services |
| `opencode-bridge setup` | Configure Claude Code only |
| `opencode-bridge remove` | Remove configuration |

## After Installation

1. **Dashboard:** http://localhost:8100
   - Switch models with one click
   - View usage stats
   - Reset session/stats

2. **Use Claude Code:**
   ```bash
   claude --print
   ```

## Features

- 🌐 **Beautiful Web Dashboard** - Monitor usage, switch models
- 🔄 **One-Click Model Switching** - 10+ models available
- 📊 **Usage Tracking** - Requests and tokens
- ⚡ **Auto-Configuration** - No manual editing needed

## Manual Installation

If you prefer to install from source:

```bash
# Clone
git clone https://github.com/veokhan/opencode-claude-bridge.git
cd opencode-claude-bridge/anthropic-proxy

# Install & Build
npm install
npm run build

# Configure Claude Code (one command!)
node dist/cli.js setup

# Start
node dist/cli.js start
```

## Available Models

| Model | Provider |
|-------|----------|
| MiniMax M2.5 Free | OpenCode |
| Claude Sonnet 4.5 | Anthropic |
| Claude Opus 4.5 | Anthropic |
| Claude Haiku 4.5 | Anthropic |
| GPT-4o | OpenAI |
| GPT-4o Mini | OpenAI |
| Gemini 2 Flash | Google |
| Gemini 1.5 Pro | Google |
| Llama 3 | Ollama |
| CodeLlama | Ollama |

## How It Works

```
Claude Code → Bridge → OpenCode → Any LLM
```

The bridge makes Claude Code think it's talking to Anthropic, but requests go to OpenCode instead!

## Troubleshooting

**OpenCode not found?**
```bash
npm install -g opencode-ai
```

**Port already in use?**
```bash
opencode-bridge stop
opencode-bridge start
```

**Reset everything:**
```bash
opencode-bridge remove
npx opencode-claude-bridge install
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
