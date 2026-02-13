import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || "";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "8200");

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
      
      availableModels.sort((a, b) => {
        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
        return a.name.localeCompare(b.name);
      });
      
      console.error(`Loaded ${availableModels.length} models from ${Object.keys(providers).length} providers`);
    }
  } catch (e) {
    console.error("Failed to fetch models:", e);
  }
}

fetchModelsFromOpenCode();

async function createSession(workspace: string): Promise<string> {
  const response = await fetch(`${OPENCODE_SERVER_URL}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENCODE_PASSWORD ? { "Authorization": `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}` } : {})
    },
    body: JSON.stringify({ workspace, mode: "agent" })
  });
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
  
  if (!lastUserMessage) return { text: "OK", tokens: 0 };
  
  const combinedContent = extractTextFromContent(lastUserMessage.content);

  const response = await fetch(`${OPENCODE_SERVER_URL}/session/${sessionId}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENCODE_PASSWORD ? { "Authorization": `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}` } : {})
    },
    body: JSON.stringify({ parts: [{ type: "text", text: combinedContent }] })
  });

  const data = await response.json();
  
  let fullResponse = "";
  let tokens = 0;
  
  if (data.parts && Array.isArray(data.parts)) {
    for (const part of data.parts) {
      if (part.type === "text") fullResponse += part.text;
    }
  }
  
  if (data.info?.tokens) tokens = data.info.tokens.total || 0;
  
  return { text: fullResponse, tokens };
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/", (req, res) => res.send(generateHTML()));

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
  const grouped: Record<string, Model[]> = {};
  for (const model of availableModels) {
    if (!grouped[model.provider]) grouped[model.provider] = [];
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

app.get("/v1/authenticate", (req, res) => res.json({ type: "authentication", authenticated: true }));
app.get("/v1/whoami", (req, res) => res.json({ type: "user", id: "opencode-user", email: "opencode@local" }));

app.get("/v1/models", (req, res) => {
  res.json({ data: availableModels.map(m => ({
    id: m.id, type: "model", name: m.name,
    supports_cached_previews: true, supports_system_instructions: true
  }))});
});

app.get("/v1/models/list", (req, res) => {
  res.json({ data: availableModels.map(m => ({
    id: m.id, type: "model", name: m.name,
    supports_cached_previews: true, supports_system_instructions: true
  }))});
});

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

    const { messages, model } = req.body;

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
    res.status(500).json({ error: { type: "api_error", message: error instanceof Error ? error.message : String(error) } });
  }
});

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
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: #0a0a0f; color: #e4e4e7; min-height: 100vh; }
    
    .app-container { display: flex; height: 100vh; }
    
    /* Sidebar */
    .sidebar { width: 280px; background: #121218; border-right: 1px solid #27272a; display: flex; flex-direction: column; }
    .sidebar-header { padding: 20px; border-bottom: 1px solid #27272a; }
    .logo { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 16px; }
    .logo-icon { width: 28px; height: 28px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 6px; display: flex; align-items: center; justify-content: center; }
    
    /* Search */
    .search-box { padding: 16px 20px; }
    .search-input { width: 100%; padding: 10px 12px; background: #1a1a20; border: 1px solid #27272a; border-radius: 8px; color: #e4e4e7; font-size: 13px; outline: none; transition: border-color 0.2s; }
    .search-input:focus { border-color: #6366f1; }
    .search-input::placeholder { color: #71717a; }
    
    /* Provider List */
    .provider-list { flex: 1; overflow-y: auto; padding: 8px; }
    .provider-item { padding: 10px 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 13px; transition: background 0.15s; }
    .provider-item:hover { background: #1f1f26; }
    .provider-item.active { background: #6366f1/15; color: #a5b4fc; }
    .provider-name { display: flex; align-items: center; gap: 8px; }
    .provider-count { font-size: 11px; color: #71717a; background: #27272a; padding: 2px 6px; border-radius: 4px; }
    
    /* Main Content */
    .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    
    /* Header */
    .main-header { padding: 16px 24px; border-bottom: 1px solid #27272a; display: flex; align-items: center; justify-content: space-between; background: #121218; }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .current-model-badge { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: #6366f1/15; border: 1px solid #6366f1/30; border-radius: 8px; font-size: 13px; }
    .status-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; }
    .status-dot.inactive { background: #ef4444; }
    
    /* Model List */
    .model-list-container { flex: 1; overflow-y: auto; padding: 16px 24px; }
    .model-list-header { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; margin-bottom: 12px; padding: 0 8px; }
    .model-item { padding: 12px 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.15s; border: 1px solid transparent; margin-bottom: 4px; }
    .model-item:hover { background: #1f1f26; }
    .model-item.selected { background: #6366f1/15; border-color: #6366f1/40; }
    .model-info { display: flex; flex-direction: column; gap: 2px; }
    .model-name { font-size: 14px; font-weight: 500; }
    .model-id { font-size: 11px; color: #71717a; font-family: 'JetBrains Mono', monospace; }
    .model-cost { font-size: 11px; color: #a1a1aa; text-align: right; }
    .model-cost span { display: block; }
    
    /* Footer Stats */
    .footer { padding: 12px 24px; border-top: 1px solid #27272a; display: flex; gap: 24px; background: #121218; }
    .stat-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa; }
    .stat-value { color: #e4e4e7; font-weight: 500; }
    
    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #52525b; }
    
    /* Buttons */
    .btn { padding: 8px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; border: none; }
    .btn-primary { background: #6366f1; color: white; }
    .btn-primary:hover { background: #4f46e5; }
    .btn-secondary { background: #27272a; color: #a1a1aa; }
    .btn-secondary:hover { background: #3f3f46; color: #e4e4e7; }
  </style>
</head>
<body>
  <div class="app-container">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <div class="logo-icon">⚡</div>
          <span>OpenCode Bridge</span>
        </div>
      </div>
      
      <div class="search-box">
        <input type="text" class="search-input" placeholder="Search models..." id="searchInput" oninput="filterModels()">
      </div>
      
      <div class="provider-list" id="providerList">
        <!-- Providers loaded here -->
      </div>
    </div>
    
    <!-- Main Content -->
    <div class="main-content">
      <div class="main-header">
        <div class="header-left">
          <div class="current-model-badge">
            <div class="status-dot" id="statusDot"></div>
            <span id="currentModelName">Loading...</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="resetSession()">↻ Session</button>
          <button class="btn btn-secondary" onclick="resetStats()">📊 Reset</button>
        </div>
      </div>
      
      <div class="model-list-container">
        <div class="model-list-header" id="modelListHeader">All Models</div>
        <div id="modelList">
          <!-- Models loaded here -->
        </div>
      </div>
      
      <div class="footer">
        <div class="stat-item">
          <span>Requests:</span>
          <span class="stat-value" id="totalRequests">0</span>
        </div>
        <div class="stat-item">
          <span>Tokens:</span>
          <span class="stat-value" id="totalTokens">0</span>
        </div>
        <div class="stat-item">
          <span>Models:</span>
          <span class="stat-value" id="totalModels">0</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    const PROXY_PORT = ${PROXY_PORT};
    let allModels = [];
    let groupedModels = {};
    let currentProvider = 'all';
    let currentModelId = null;
    
    async function loadModels() {
      const res = await fetch('/api/models');
      const data = await res.json();
      
      allModels = data.models || [];
      groupedModels = data.grouped || {};
      
      renderProviders();
      renderModels(allModels);
      updateStats();
    }
    
    function renderProviders() {
      const container = document.getElementById('providerList');
      const providers = Object.entries(groupedModels);
      
      let html = \`<div class="provider-item \${currentProvider === 'all' ? 'active' : ''}" onclick="selectProvider('all')">
        <span class="provider-name">🏠 All Models</span>
        <span class="provider-count">\${allModels.length}</span>
      </div>\`;
      
      for (const [provider, models] of providers) {
        html += \`<div class="provider-item \${currentProvider === provider ? 'active' : ''}" onclick="selectProvider('\${provider}')">
          <span class="provider-name">📦 \${provider}</span>
          <span class="provider-count">\${models.length}</span>
        </div>\`;
      }
      
      container.innerHTML = html;
    }
    
    function selectProvider(provider) {
      currentProvider = provider;
      renderProviders();
      
      const models = provider === 'all' ? allModels : groupedModels[provider] || [];
      document.getElementById('modelListHeader').textContent = provider === 'all' ? 'All Models' : provider;
      renderModels(models);
    }
    
    function renderModels(models) {
      const container = document.getElementById('modelList');
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      
      let filtered = models;
      if (searchTerm) {
        filtered = models.filter(m => 
          m.name.toLowerCase().includes(searchTerm) || 
          m.id.toLowerCase().includes(searchTerm) ||
          m.provider.toLowerCase().includes(searchTerm)
        );
      }
      
      if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #71717a; padding: 40px;">No models found</div>';
        return;
      }
      
      let html = '';
      for (const model of filtered) {
        const isSelected = model.id === currentModelId;
        const costInfo = model.cost ? \`<span>$\${model.cost.input}/M in</span><span>$\${model.cost.output}/M out</span>\` : '';
        
        html += \`<div class="model-item \${isSelected ? 'selected' : ''}" onclick="selectModel('\${model.id}')">
          <div class="model-info">
            <div class="model-name">\${model.name}</div>
            <div class="model-id">\${model.id}</div>
          </div>
          <div class="model-cost">\${costInfo}</div>
        </div>\`;
      }
      
      container.innerHTML = html;
    }
    
    function filterModels() {
      const models = currentProvider === 'all' ? allModels : groupedModels[currentProvider] || [];
      renderModels(models);
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
        const models = currentProvider === 'all' ? allModels : groupedModels[currentProvider] || [];
        renderModels(models);
      }
    }
    
    async function loadStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      
      const model = allModels.find(m => m.id === data.currentModel);
      document.getElementById('currentModelName').textContent = model ? model.name : data.currentModel;
      
      const statusDot = document.getElementById('statusDot');
      if (data.sessionId === 'active') {
        statusDot.classList.remove('inactive');
      } else {
        statusDot.classList.add('inactive');
      }
      
      document.getElementById('totalRequests').textContent = data.totalRequests.toLocaleString();
      document.getElementById('totalTokens').textContent = data.totalTokensUsed.toLocaleString();
      document.getElementById('totalModels').textContent = allModels.length.toLocaleString();
      
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
    
    // Initialize
    loadModels();
    loadStatus();
    setInterval(loadStatus, 3000);
  </script>
</body>
</html>`;
}

app.listen(PROXY_PORT, () => {
  console.error(`OpenCode Bridge running on http://localhost:${PROXY_PORT}`);
  console.error(`Dashboard: http://localhost:${PROXY_PORT}`);
});
