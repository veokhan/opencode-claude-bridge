# OpenCode Claude Bridge

**✅ WORKING** - Use OpenCode's AI models directly in Claude Code!

## How It Works

```
Claude Code <-> Anthropic Proxy <-> OpenCode Server <-> Any LLM Provider
```

Claude Code thinks it's talking to Anthropic, but the proxy forwards requests to OpenCode, which uses whatever model you configured.

## Quick Start

### 1. Start OpenCode Server

```bash
opencode serve --port 4096
```

### 2. Start the Proxy

```bash
cd opencode-claude-bridge/anthropic-proxy
npm install
npm run build
node dist/proxy.js
```

### 3. Configure Claude Code

Create `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:8097",
    "ANTHROPIC_API_KEY": "test-key"
  }
}
```

### 4. Use Claude Code!

```bash
claude --print
# Or just run claude
claude
```

## How to Run Both Services

**Terminal 1:**
```bash
opencode serve --port 4096
```

**Terminal 2:**
```bash
cd opencode-claude-bridge/anthropic-proxy
node dist/proxy.js
```

## Configure OpenCode Models

Edit your project's `opencode.json` to choose which model to use:

```json
{
  "model": "anthropic/claude-sonnet-4-5-20250929"
}
```

Or use any of the 75+ providers OpenCode supports:
- OpenAI (GPT models)
- Google (Gemini)
- Ollama (local)
- OpenRouter (many models)
- And more...

## How It Works

The proxy:
1. Accepts requests meant for Anthropic API
2. Forwards them to your local OpenCode server
3. Returns OpenCode's response in Anthropic format

This means Claude Code uses OpenCode's model configuration - not Claude's!

## Testing

```bash
# Test the proxy directly
curl -X POST http://localhost:8097/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "messages": [{"role": "user", "content": "Say hi"}],
    "max_tokens": 10
  }'

# Test via Claude Code
echo "Hello" | claude --print
```

## Current Limitations

- Uses OpenCode's default model (minimax-m2.5-free unless configured)
- Some Claude Code features may not work perfectly
- Session persistence is limited

## Files

- `anthropic-proxy/src/proxy.ts` - Main proxy server
- `src/index.ts` - MCP bridge (alternative approach)
