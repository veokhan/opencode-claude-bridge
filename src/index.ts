import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || "";

let currentSessionId: string | null = null;

async function createSession(): Promise<string> {
  const response = await fetch(`${OPENCODE_SERVER_URL}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENCODE_PASSWORD ? { "Authorization": `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}` } : {})
    },
    body: JSON.stringify({
      workspace: process.cwd(),
      mode: "agent"
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

async function sendMessage(sessionId: string, message: string): Promise<string> {
  const response = await fetch(`${OPENCODE_SERVER_URL}/session/${sessionId}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      ...(OPENCODE_PASSWORD ? { "Authorization": `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}` } : {})
    },
    body: JSON.stringify({
      message
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  let fullResponse = "";
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content" && parsed.content) {
            for (const content of parsed.content) {
              if (content.type === "text") {
                fullResponse += content.text;
              }
            }
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  return fullResponse;
}

async function runOpenCodeTask(task: string): Promise<string> {
  if (!currentSessionId) {
    currentSessionId = await createSession();
  }

  return await sendMessage(currentSessionId, task);
}

const server = new Server(
  {
    name: "opencode-bridge",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "opencode_task",
        description: "Use OpenCode AI to perform coding tasks. OpenCode supports multiple models including Claude, GPT, Gemini, and local models. Use this when you need OpenCode's capabilities.",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The coding task to perform (e.g., 'Write a function to sort an array', 'Review this code', 'Fix this bug')"
            }
          },
          required: ["task"]
        }
      },
      {
        name: "opencode_new_session",
        description: "Create a new OpenCode session (clears previous context)",
        inputSchema: {
          type: "object",
          properties: {
            workspace: {
              type: "string",
              description: "The workspace directory to use (defaults to current directory)"
            }
          }
        }
      },
      {
        name: "opencode_list_models",
        description: "List available models in OpenCode",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params as { name: string; arguments: Record<string, unknown> };

  try {
    switch (name) {
      case "opencode_task": {
        const result = await runOpenCodeTask(args.task as string);
        return {
          content: [
            {
              type: "text",
              text: result || "Task completed (no output)"
            }
          ]
        };
      }

      case "opencode_new_session": {
        currentSessionId = await createSession();
        return {
          content: [
            {
              type: "text",
              text: `New OpenCode session created: ${currentSessionId}`
            }
          ]
        };
      }

      case "opencode_list_models": {
        return {
          content: [
            {
              type: "text",
              text: "Configure models in OpenCode's opencode.json. Use /models command in OpenCode TUI to select models. Supported: Claude, GPT, Gemini, Ollama, OpenRouter, and 75+ providers."
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OpenCode Bridge MCP server running on stdio");
}

main().catch(console.error);
