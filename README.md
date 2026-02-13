# OpenCode Claude Bridge

**✅ WORKING** - Use OpenCode's AI models directly in Claude Code with a beautiful Web Dashboard!

## Features

- 🌐 **Beautiful Web Dashboard** - Monitor usage, switch models, track stats
- 🔄 **Model Switching** - Switch between 10+ models with one click
- 📊 **Usage Tracking** - Track requests and token usage
- 🔌 **Seamless Integration** - Claude Code thinks it's talking to Anthropic

## Quick Start

### 1. Start OpenCode Server

```bash
opencode serve --port 4096
```

### 2. Start the Bridge

```bash
cd anthropic-proxy
npm install
npm run build
node dist/proxy.js
```

### 3. Open the Dashboard

Visit: **http://localhost:8100**

### 4. Configure Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:8100",
    "ANTHROPIC_API_KEY": "test-key"
  }
}
```

### 5. Use Claude Code!

```bash
claude --print
```

## Web Dashboard Features

- **Current Model** - See which model is active
- **Total Requests** - Count of API requests
- **Tokens Used** - Total tokens consumed
- **Session Status** - Active/Inactive
- **Model Selection** - Click to switch models
- **Quick Actions** - Reset session, reset stats

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
Claude Code <-> Bridge (Web UI) <-> OpenCode Server <-> Any LLM
```

The bridge:
1. Accepts requests meant for Anthropic API
2. Forwards them to your local OpenCode server
3. Returns OpenCode's response in Anthropic format
4. Tracks usage in the dashboard

## API Endpoints

- `GET /` - Web Dashboard
- `GET /api/status` - Current status
- `GET /api/models` - List available models
- `POST /api/model` - Switch model
- `POST /api/reset-session` - Reset session
- `POST /api/reset-stats` - Reset statistics

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_SERVER_URL` | http://127.0.0.1:4096 | OpenCode server |
| `OPENCODE_SERVER_PASSWORD` | (none) | Server password |
| `PROXY_PORT` | 8080 | Proxy port |

## Example

```bash
# Test directly
curl -X POST http://localhost:8100/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[{"role":"user","content":"Hi"}],"max_tokens":10}'
```

## Current Status

- ✅ Working with Claude Code CLI
- ✅ Web Dashboard functional
- ✅ Model switching works
- ✅ Usage tracking works
- ✅ Session management works

## Tech Stack

- TypeScript
- Express.js
- Tailwind CSS (via CDN)
- OpenCode API

## License

MIT
