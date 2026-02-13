import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || "";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "8080");

let currentSessionId: string | null = null;
let totalTokensUsed = 0;
let totalRequests = 0;
let currentModel = "minimax-m2.5-free";

const AVAILABLE_MODELS = [
  { id: "minimax-m2.5-free", name: "MiniMax M2.5 Free", provider: "OpenCode" },
  { id: "anthropic/claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "Anthropic" },
  { id: "anthropic/claude-opus-4-5-20250929", name: "Claude Opus 4.5", provider: "Anthropic" },
  { id: "anthropic/claude-haiku-4-5-20250929", name: "Claude Haiku 4.5", provider: "Anthropic" },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "google/gemini-2-flash", name: "Gemini 2 Flash", provider: "Google" },
  { id: "google/gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google" },
  { id: "ollama/llama3", name: "Llama 3", provider: "Ollama" },
  { id: "ollama/codellama", name: "CodeLlama", provider: "Ollama" },
];

async function createSession(workspace: string): Promise<string> {
  const response = await fetch(`${OPENCODE_SERVER_URL}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENCODE_PASSWORD ? { "Authorization": `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}` } : {})
    },
    body: JSON.stringify({
      workspace,
      mode: "agent"
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

function extractTextFromContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(c => typeof c === "string" ? c : c?.text || "").join("");
  }
  return "";
}

async function sendMessage(sessionId: string, messages: any[]): Promise<{ text: string; tokens: number }> {
  const reversed = [...messages].reverse();
  let lastUserMessage = null;
  
  for (const m of reversed) {
    if (m.role === "user") {
      const content = extractTextFromContent(m.content);
      if (content && content.length > 2 && content !== "count") {
        lastUserMessage = m;
        break;
      }
    }
  }
  
  if (!lastUserMessage) {
    return { text: "OK", tokens: 0 };
  }
  
  const combinedContent = extractTextFromContent(lastUserMessage.content);

  const response = await fetch(`${OPENCODE_SERVER_URL}/session/${sessionId}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENCODE_PASSWORD ? { "Authorization": `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}` } : {})
    },
    body: JSON.stringify({
      parts: [{ type: "text", text: combinedContent }]
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`);
  }

  const data = await response.json();
  
  let fullResponse = "";
  let tokens = 0;
  
  if (data.parts && Array.isArray(data.parts)) {
    for (const part of data.parts) {
      if (part.type === "text") {
        fullResponse += part.text;
      }
    }
  }
  
  if (data.info?.tokens) {
    tokens = data.info.tokens.total || 0;
  }
  
  return { text: fullResponse, tokens };
}

const app = express();

app.use(express.json());

// CORS for web UI
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Serve static web UI
app.get("/", (req, res) => {
  res.send(HTML);
});

// API endpoints for web UI
app.get("/api/status", (req, res) => {
  res.json({
    proxyPort: PROXY_PORT,
    opencodePort: 4096,
    currentModel,
    totalRequests,
    totalTokensUsed,
    sessionId: currentSessionId ? "active" : "inactive"
  });
});

app.get("/api/models", (req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

app.post("/api/model", (req, res) => {
  const { modelId } = req.body;
  const model = AVAILABLE_MODELS.find(m => m.id === modelId);
  if (model) {
    currentModel = modelId;
    currentSessionId = null; // Reset session to use new model
    res.json({ success: true, model });
  } else {
    res.status(400).json({ success: false, error: "Model not found" });
  }
});

app.post("/api/reset-stats", (req, res) => {
  totalTokensUsed = 0;
  totalRequests = 0;
  res.json({ success: true });
});

app.post("/api/reset-session", async (req, res) => {
  currentSessionId = await createSession(process.cwd());
  res.json({ success: true, sessionId: currentSessionId });
});

// Claude Code checks these endpoints for authentication
app.get("/v1/authenticate", (req, res) => {
  res.json({ type: "authentication", authenticated: true });
});

app.get("/v1/whoami", (req, res) => {
  res.json({ 
    type: "user",
    id: "opencode-user",
    email: "opencode@local"
  });
});

// List available models
app.get("/v1/models", (req, res) => {
  res.json({
    data: AVAILABLE_MODELS.map(m => ({
      id: m.id,
      type: "model",
      name: m.name,
      supports_cached_previews: true,
      supports_system_instructions: true
    }))
  });
});

app.get("/v1/models/list", (req, res) => {
  res.json({
    data: AVAILABLE_MODELS.map(m => ({
      id: m.id,
      type: "model",
      name: m.name,
      supports_cached_previews: true,
      supports_system_instructions: true
    }))
  });
});

// Anthropic Messages API endpoint
app.post("/v1/messages", async (req, res) => {
  try {
    if (req.body?.max_tokens === undefined && req.body?.messages) {
      const messages = req.body.messages;
      let totalTokens = 0;
      for (const msg of messages) {
        const content = extractTextFromContent(msg.content);
        totalTokens += Math.ceil(content.length / 4);
      }
      return res.json({ tokens: totalTokens });
    }

    const { messages, model, system, max_tokens } = req.body;

    if (!currentSessionId) {
      currentSessionId = await createSession(process.cwd());
    }

    const { text, tokens } = await sendMessage(currentSessionId, messages);
    
    totalRequests++;
    totalTokensUsed += tokens;

    res.json({
      id: `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model: currentModel,
      stop_reason: "end_turn",
      usage: {
        input_tokens: Math.ceil((JSON.stringify(messages).length) / 4),
        output_tokens: Math.ceil(text.length / 4)
      }
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: { type: "api_error", message: error instanceof Error ? error.message : String(error) }
    });
  }
});

// Count tokens endpoint
app.post("/v1/messages/count_tokens", (req, res) => {
  const { messages } = req.body;
  let totalTokens = 0;
  for (const msg of messages || []) {
    const content = extractTextFromContent(msg.content);
    totalTokens += Math.ceil(content.length / 4);
  }
  res.json({ tokens: totalTokens });
});

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenCode Bridge Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .gradient-bg { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }
    .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
    .glow { box-shadow: 0 0 30px rgba(99,102,241,0.3); }
  </style>
</head>
<body class="gradient-bg min-h-screen text-white">
  <div class="container mx-auto px-4 py-8 max-w-6xl">
    <!-- Header -->
    <div class="text-center mb-12">
      <h1 class="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
        OpenCode Bridge
      </h1>
      <p class="text-gray-400 text-lg">Use OpenCode models in Claude Code</p>
    </div>
    
    <!-- Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="card rounded-2xl p-6 glow">
        <div class="text-gray-400 text-sm mb-2">Current Model</div>
        <div id="currentModel" class="text-2xl font-bold text-blue-400">-</div>
      </div>
      <div class="card rounded-2xl p-6">
        <div class="text-gray-400 text-sm mb-2">Total Requests</div>
        <div id="totalRequests" class="text-2xl font-bold text-green-400">0</div>
      </div>
      <div class="card rounded-2xl p-6">
        <div class="text-gray-400 text-sm mb-2">Tokens Used</div>
        <div id="totalTokens" class="text-2xl font-bold text-purple-400">0</div>
      </div>
      <div class="card rounded-2xl p-6">
        <div class="text-gray-400 text-sm mb-2">Session Status</div>
        <div id="sessionStatus" class="text-2xl font-bold text-yellow-400">-</div>
      </div>
    </div>
    
    <!-- Model Selection -->
    <div class="card rounded-2xl p-8 mb-8">
      <h2 class="text-2xl font-bold mb-6 flex items-center">
        <span class="w-2 h-8 bg-blue-500 rounded mr-3"></span>
        Select Model
      </h2>
      <div id="modelList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Models will be loaded here -->
      </div>
    </div>
    
    <!-- Quick Actions -->
    <div class="card rounded-2xl p-8 mb-8">
      <h2 class="text-2xl font-bold mb-6 flex items-center">
        <span class="w-2 h-8 bg-green-500 rounded mr-3"></span>
        Quick Actions
      </h2>
      <div class="flex flex-wrap gap-4">
        <button onclick="resetSession()" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold transition">
          Reset Session
        </button>
        <button onclick="resetStats()" class="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-semibold transition">
          Reset Statistics
        </button>
        <button onclick="refreshStatus()" class="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-xl font-semibold transition">
          Refresh
        </button>
      </div>
    </div>
    
    <!-- Setup Instructions -->
    <div class="card rounded-2xl p-8">
      <h2 class="text-2xl font-bold mb-6 flex items-center">
        <span class="w-2 h-8 bg-yellow-500 rounded mr-3"></span>
        Setup Instructions
      </h2>
      <div class="space-y-4 text-gray-300">
        <p><strong class="text-white">1.</strong> Make sure OpenCode server is running:</p>
        <code class="block bg-gray-800 p-4 rounded-lg text-green-400">opencode serve --port 4096</code>
        
        <p><strong class="text-white">2.</strong> Configure Claude Code to use this proxy:</p>
        <p class="text-sm text-gray-400">Add to <code class="text-green-400">~/.claude/settings.json</code>:</p>
        <pre class="bg-gray-800 p-4 rounded-lg text-green-400 overflow-x-auto">{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:${PROXY_PORT}",
    "ANTHROPIC_API_KEY": "test-key"
  }
}</pre>
        
        <p><strong class="text-white">3.</strong> Run Claude Code:</p>
        <code class="block bg-gray-800 p-4 rounded-lg text-green-400">claude --print</code>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="text-center mt-12 text-gray-500">
      <p>OpenCode Bridge Dashboard | Using OpenCode API</p>
    </div>
  </div>

  <script>
    const PROXY_PORT = ${PROXY_PORT};
    let currentModelId = null;
    
    async function loadModels() {
      const res = await fetch('/api/models');
      const { models } = await res.json();
      
      const container = document.getElementById('modelList');
      container.innerHTML = models.map(model => \`
        <div onclick="selectModel('\${model.id}')" 
             class="model-card p-4 rounded-xl cursor-pointer transition border-2 hover:border-blue-500"
             style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1);"
             id="model-\${model.id}">
          <div class="font-semibold text-white">\${model.name}</div>
          <div class="text-sm text-gray-400">\${model.provider}</div>
        </div>
      \`).join('');
    }
    
    async function selectModel(modelId) {
      const res = await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      });
      const data = await res.json();
      if (data.success) {
        currentModelId = modelId;
        loadStatus();
        updateModelSelection();
      }
    }
    
    function updateModelSelection() {
      document.querySelectorAll('.model-card').forEach(card => {
        const id = card.id.replace('model-', '');
        if (id === currentModelId) {
          card.style.borderColor = '#3b82f6';
          card.style.background = 'rgba(59,130,246,0.2)';
        } else {
          card.style.borderColor = 'rgba(255,255,255,0.1)';
          card.style.background = 'rgba(255,255,255,0.05)';
        }
      });
    }
    
    async function loadStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      
      document.getElementById('currentModel').textContent = data.currentModel || 'Default';
      document.getElementById('totalRequests').textContent = data.totalRequests.toLocaleString();
      document.getElementById('totalTokens').textContent = data.totalTokensUsed.toLocaleString();
      document.getElementById('sessionStatus').textContent = data.sessionId === 'active' ? 'Active' : 'Inactive';
      document.getElementById('sessionStatus').className = 'text-2xl font-bold ' + (data.sessionId === 'active' ? 'text-green-400' : 'text-red-400');
      
      currentModelId = data.currentModel;
      updateModelSelection();
    }
    
    async function resetSession() {
      await fetch('/api/reset-session', { method: 'POST' });
      loadStatus();
    }
    
    async function resetStats() {
      await fetch('/api/reset-stats', { method: 'POST' });
      loadStatus();
    }
    
    function refreshStatus() {
      loadStatus();
    }
    
    // Auto refresh
    loadModels();
    loadStatus();
    setInterval(loadStatus, 5000);
  </script>
</body>
</html>`;

app.listen(PROXY_PORT, () => {
  console.error(`OpenCode Bridge running on http://localhost:${PROXY_PORT}`);
  console.error(`Dashboard: http://localhost:${PROXY_PORT}`);
  console.error(`Configure Claude Code: ANTHROPIC_BASE_URL=http://localhost:${PROXY_PORT}`);
});
