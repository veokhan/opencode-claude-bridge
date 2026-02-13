import express from "express";

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || "";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "8080");

let currentSessionId: string | null = null;

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
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(c => {
      if (typeof c === "string") return c;
      return c?.text || "";
    }).join("");
  }
  return "";
}

async function sendMessage(sessionId: string, messages: any[]): Promise<string> {
  // Get only the last meaningful user message
  const reversed = [...messages].reverse();
  let lastUserMessage = null;
  
  for (const m of reversed) {
    if (m.role === "user") {
      const content = extractTextFromContent(m.content);
      // Skip if it's just "count" or very short system messages
      if (content && content.length > 2 && content !== "count") {
        lastUserMessage = m;
        break;
      }
    }
  }
  
  if (!lastUserMessage) {
    return "OK";
  }
  
  const combinedContent = extractTextFromContent(lastUserMessage.content);

  console.error("Sending to OpenCode:", combinedContent.substring(0, 200));

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

  // OpenCode returns JSON directly (not SSE for this endpoint)
  const data = await response.json();
  
  // Extract text from parts
  let fullResponse = "";
  if (data.parts && Array.isArray(data.parts)) {
    for (const part of data.parts) {
      if (part.type === "text") {
        fullResponse += part.text;
      }
    }
  }

  return fullResponse;
}

const app = express();

app.use(express.json());

// Middleware to log requests
app.use((req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
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
    data: [
      {
        id: "claude-sonnet-4-5-20250929",
        type: "model",
        name: "Claude Sonnet 4.5",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-opus-4-5-20250929",
        type: "model",
        name: "Claude Opus 4.5",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-haiku-4-5-20250929",
        type: "model",
        name: "Claude Haiku 4.5",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-haiku-4-5-20251001",
        type: "model",
        name: "Claude Haiku 4.5",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-sonnet-4-5",
        type: "model",
        name: "Claude Sonnet 4.5",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-opus-4",
        type: "model",
        name: "Claude Opus 4",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-3-5-sonnet-20240229",
        type: "model",
        name: "Claude 3.5 Sonnet",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-3-opus-20240229",
        type: "model",
        name: "Claude 3 Opus",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-3-haiku-20240307",
        type: "model",
        name: "Claude 3 Haiku",
        supports_cached_previews: true,
        supports_system_instructions: true
      }
    ]
  });
});

app.get("/v1/models/list", (req, res) => {
  res.json({
    data: [
      {
        id: "claude-sonnet-4-5-20250929",
        type: "model",
        name: "Claude Sonnet 4.5",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-opus-4-5-20250929",
        type: "model",
        name: "Claude Opus 4.5",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-haiku-4-5-20250929",
        type: "model",
        name: "Claude Haiku 4.5",
        supports_cached_previews: true,
        supports_system_instructions: true
      },
      {
        id: "claude-haiku-4-5-20251001",
        type: "model",
        name: "Claude Haiku 4.5",
        supports_cached_previews: true,
        supports_system_instructions: true
      }
    ]
  });
});

// Anthropic Messages API endpoint
app.post("/v1/messages", async (req, res) => {
  try {
    // Handle count_tokens endpoint
    if (req.body?.max_tokens === undefined && req.body?.messages) {
      // This is a count_tokens request
      const messages = req.body.messages;
      let totalTokens = 0;
      for (const msg of messages) {
        const content = typeof msg.content === "string" ? msg.content : "";
        totalTokens += Math.ceil(content.length / 4);
      }
      return res.json({
        tokens: totalTokens
      });
    }

    const { messages, model, system, max_tokens } = req.body;

    // Create or reuse session
    if (!currentSessionId) {
      currentSessionId = await createSession(process.cwd());
    }

    // Send to OpenCode
    const response = await sendMessage(currentSessionId, messages);

    // Return in Anthropic format
    res.json({
      id: `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: response
        }
      ],
      model: model,
      stop_reason: "end_turn",
      usage: {
        input_tokens: 0,
        output_tokens: response.length / 4
      }
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: {
        type: "api_error",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

// Count tokens endpoint
app.post("/v1/messages/count_tokens", (req, res) => {
  const { messages } = req.body;
  let totalTokens = 0;
  for (const msg of messages || []) {
    const content = typeof msg.content === "string" ? msg.content : msg.content?.[0]?.text || "";
    totalTokens += Math.ceil(content.length / 4);
  }
  res.json({
    tokens: totalTokens
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Reset session
app.post("/v1/session/reset", async (req, res) => {
  currentSessionId = await createSession(process.cwd());
  res.json({ status: "reset", sessionId: currentSessionId });
});

app.listen(PROXY_PORT, () => {
  console.error(`OpenCode Anthropic Proxy running on http://localhost:${PROXY_PORT}`);
  console.error(`Configure Claude Code to use this as ANTHROPIC_BASE_URL`);
});
