import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || "";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "8100");

let currentSessionId: string | null = null;
let totalTokensUsed = 0;
let totalRequests = 0;
let currentModel = "minimax-m2.5-free";

interface Model {
  id: string;
  name: string;
  provider: string;
  providerID: string;
  cost?: { input: number; output: number };
}

let availableModels: Model[] = [];
let providers: Record<string, { name: string; source: string }> = {};

async function fetchModelsFromOpenCode() {
  try {
    const response = await fetch(`${OPENCODE_SERVER_URL}/provider`);
    const data = await response.json();
    
    if (data.all) {
      providers = {};
      availableModels = [];
      
      for (const [providerID, providerData] of Object.entries(data.all as Record<string, any>)) {
        const p = providerData as { name: string; source: string; models: Record<string, any> };
        providers[providerID] = { name: p.name, source: p.source };
        
        if (p.models) {
          for (const [modelID, modelData] of Object.entries(p.models)) {
            const m = modelData as any;
            availableModels.push({
              id: `${providerID}/${modelID}`,
              name: m.name || modelID,
              provider: p.name,
              providerID,
              cost: m.cost
            });
          }
        }
      }
      
      // Sort by provider name, then by model name
      availableModels.sort((a, b) => {
        if (a.provider !== b.provider) {
          return a.provider.localeCompare(b.provider);
        }
        return a.name.localeCompare(b.name);
      });
      
      console.error(`Loaded ${availableModels.length} models from ${Object.keys(providers).length} providers`);
    }
  } catch (e) {
    console.error("Failed to fetch models from OpenCode:", e);
  }
}

// Initial fetch
fetchModelsFromOpenCode();

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
  res.send(generateHTML());
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
  // Group models by provider
  const grouped: Record<string, Model[]> = {};
  for (const model of availableModels) {
    if (!grouped[model.provider]) {
      grouped[model.provider] = [];
    }
    grouped[model.provider].push(model);
  }
  
  res.json({ 
    models: availableModels,
    grouped,
    providers: Object.entries(providers).map(([id, p]) => ({ id, ...p }))
  });
});

app.post("/api/model", (req, res) => {
  const { modelId } = req.body;
  const model = availableModels.find(m => m.id === modelId);
  if (model) {
    currentModel = modelId;
    currentSessionId = null;
    res.json({ success: true, model });
  } else {
    res.status(400).json({ success: false, error: "Model not found" });
  }
});

app.post("/api/refresh-models", async (req, res) => {
  await fetchModelsFromOpenCode();
  res.json({ success: true, count: availableModels.length });
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
    data: availableModels.map(m => ({
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
    data: availableModels.map(m => ({
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

function generateHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenCode Bridge</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .gradient-bg { background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0d1b2a 100%); }
    .glass { background: rgba(255,255,255,0.03); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
    .glass:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15); }
    .glow-blue { box-shadow: 0 0 40px rgba(59,130,246,0.15); }
    .glow-purple { box-shadow: 0 0 40px rgba(139,92,246,0.15); }
    .model-card { transition: all 0.2s ease; }
    .model-card:hover { transform: translateY(-2px); }
    .model-card.selected { border-color: #3b82f6; background: rgba(59,130,246,0.15); }
    .provider-section { animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .pulse { animation: pulse 2s infinite; }
    .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
  </style>
</head>
<body class="gradient-bg min-h-screen text-white">
  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <!-- Header -->
    <div class="text-center mb-10">
      <div class="inline-flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-2xl font-bold">
          ⚡
        </div>
        <h1 class="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          OpenCode Bridge
        </h1>
      </div>
      <p class="text-gray-400 text-lg">Use OpenCode models directly in Claude Code</p>
    </div>
    
    <!-- Status Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="glass rounded-2xl p-5 glow-blue">
        <div class="text-gray-400 text-xs uppercase tracking-wider mb-2">Current Model</div>
        <div id="currentModel" class="text-lg font-semibold text-blue-400 truncate">-</div>
      </div>
      <div class="glass rounded-2xl p-5">
        <div class="text-gray-400 text-xs uppercase tracking-wider mb-2">Requests</div>
        <div id="totalRequests" class="text-2xl font-bold text-green-400">0</div>
      </div>
      <div class="glass rounded-2xl p-5">
        <div class="text-gray-400 text-xs uppercase tracking-wider mb-2">Tokens Used</div>
        <div id="totalTokens" class="text-2xl font-bold text-purple-400">0</div>
      </div>
      <div class="glass rounded-2xl p-5">
        <div class="text-gray-400 text-xs uppercase tracking-wider mb-2">Session</div>
        <div id="sessionStatus" class="text-lg font-semibold text-yellow-400">-</div>
      </div>
    </div>
    
    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Models Panel -->
      <div class="lg:col-span-2">
        <div class="glass rounded-2xl p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold flex items-center gap-2">
              <span class="w-1 h-6 bg-blue-500 rounded"></span>
              Available Models
            </h2>
            <button onclick="refreshModels()" class="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition flex items-center gap-2">
              <span>↻</span> Refresh
            </button>
          </div>
          <div id="modelCount" class="text-sm text-gray-500 mb-4">Loading models...</div>
          <div id="modelList" class="space-y-6 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
            <!-- Models will be loaded here -->
          </div>
        </div>
      </div>
      
      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Quick Actions -->
        <div class="glass rounded-2xl p-6">
          <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
            <span class="w-1 h-6 bg-green-500 rounded"></span>
            Quick Actions
          </h2>
          <div class="space-y-3">
            <button onclick="resetSession()" class="w-full px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-xl transition flex items-center justify-center gap-2">
              <span>🔄</span> Reset Session
            </button>
            <button onclick="resetStats()" class="w-full px-4 py-3 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-xl transition flex items-center justify-center gap-2">
              <span>📊</span> Reset Statistics
            </button>
          </div>
        </div>
        
        <!-- Setup Instructions -->
        <div class="glass rounded-2xl p-6">
          <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
            <span class="w-1 h-6 bg-yellow-500 rounded"></span>
            Setup
          </h2>
          <div class="space-y-3 text-sm text-gray-300">
            <p><strong class="text-white">1.</strong> Claude Code is already configured!</p>
            <p><strong class="text-white">2.</strong> Just run:</p>
            <code class="block bg-black/30 p-3 rounded-lg text-green-400 text-xs">claude --print</code>
            <p><strong class="text-white">Dashboard:</strong> <span class="text-blue-400">http://localhost:${PROXY_PORT}</span></p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="text-center mt-10 text-gray-500 text-sm">
      <p>OpenCode Bridge • Powered by OpenCode API</p>
    </div>
  </div>

  <script>
    const PROXY_PORT = ${PROXY_PORT};
    let currentModelId = null;
    let modelsData = [];
    let groupedModels = {};
    
    async function loadModels() {
      try {
        const res = await fetch('/api/models');
        const data = await res.json();
        
        modelsData = data.models || [];
        groupedModels = data.grouped || {};
        
        document.getElementById('modelCount').textContent = \`\${modelsData.length} models from \${Object.keys(groupedModels).length} providers\`;
        
        const container = document.getElementById('modelList');
        container.innerHTML = '';
        
        // Render by provider
        for (const [provider, models] of Object.entries(groupedModels)) {
          const section = document.createElement('div');
          section.className = 'provider-section';
          
          const providerHeader = document.createElement('div');
          providerHeader.className = 'text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-4 first:mt-0';
          providerHeader.textContent = provider;
          section.appendChild(providerHeader);
          
          const grid = document.createElement('div');
          grid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2';
          
          for (const model of models) {
            const card = document.createElement('div');
            card.className = 'model-card glass rounded-xl p-3 cursor-pointer border border-transparent';
            card.dataset.modelId = model.id;
            card.onclick = () => selectModel(model.id);
            
            const isSelected = model.id === currentModelId;
            if (isSelected) {
              card.classList.add('selected');
            }
            
            const costInfo = model.cost ? \`(\${model.cost.input}/\${model.cost.output})\` : '';
            
            card.innerHTML = \`
              <div class="font-medium text-white text-sm truncate">\${model.name}</div>
              <div class="text-xs text-gray-500 truncate">\${model.id} \${costInfo}</div>
            \`;
            
            grid.appendChild(card);
          }
          
          section.appendChild(grid);
          container.appendChild(section);
        }
      } catch (e) {
        console.error('Failed to load models:', e);
        document.getElementById('modelCount').textContent = 'Failed to load models';
      }
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
        loadModels();
      }
    }
    
    async function loadStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      
      document.getElementById('currentModel').textContent = data.currentModel || 'Default';
      document.getElementById('totalRequests').textContent = data.totalRequests.toLocaleString();
      document.getElementById('totalTokens').textContent = data.totalTokensUsed.toLocaleString();
      
      const statusEl = document.getElementById('sessionStatus');
      const isActive = data.sessionId === 'active';
      statusEl.textContent = isActive ? 'Active' : 'Inactive';
      statusEl.className = 'text-lg font-semibold ' + (isActive ? 'text-green-400' : 'text-red-400');
      
      currentModelId = data.currentModel;
    }
    
    async function resetSession() {
      await fetch('/api/reset-session', { method: 'POST' });
      loadStatus();
    }
    
    async function resetStats() {
      await fetch('/api/reset-stats', { method: 'POST' });
      loadStatus();
    }
    
    async function refreshModels() {
      await fetch('/api/refresh-models', { method: 'POST' });
      loadModels();
    }
    
    // Initialize
    loadModels();
    loadStatus();
    setInterval(() => { loadStatus(); }, 5000);
  </script>
</body>
</html>`;
}

app.listen(PROXY_PORT, () => {
  console.error(`OpenCode Bridge running on http://localhost:${PROXY_PORT}`);
  console.error(`Dashboard: http://localhost:${PROXY_PORT}`);
});
