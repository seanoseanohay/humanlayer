import OpenAI from "openai";
import { TOOL_DEFINITIONS, executeTool } from "./tools.js";
import type { AgentWSClient } from "./ws-client.js";

const SYSTEM_PROMPT = `You are a coding agent. You have access to a workspace directory where you can read, write, and execute files.

Your available tools:
- read_file: Read file contents
- write_file: Write/create files
- list_files: List directory contents
- shell_exec: Run shell commands (only allowlisted commands)

Work step by step. Use tools to explore the workspace, understand the task, make changes, and verify your work.
Be concise in your responses. Focus on completing the task.`;

export interface AgentLoopOptions {
  sessionId: string;
  prompt: string;
  wsClient: AgentWSClient;
  shouldStop: () => boolean;
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<void> {
  const { sessionId, prompt, wsClient, shouldStop } = opts;

  const provider = process.env["LLM_PROVIDER"] ?? "openai";
  let client: OpenAI;

  if (provider === "anthropic") {
    client = new OpenAI({
      apiKey: process.env["ANTHROPIC_API_KEY"],
      baseURL: "https://api.anthropic.com/v1/",
    });
  } else if (provider === "openai") {
    client = new OpenAI({
      apiKey: process.env["OPENAI_API_KEY"],
    });
  } else {
    client = new OpenAI({
      apiKey: process.env["OPENAI_API_KEY"],
    });
  }

  const model = process.env["LLM_MODEL"] ?? "gpt-4o-mini";

  // Notify server we're running
  wsClient.sendSessionUpdate(sessionId, "running");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];

  const MAX_ITERATIONS = 20;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Check for stop signal
    if (shouldStop()) {
      console.log(`[agent-loop] stop signal received for session ${sessionId}`);
      wsClient.sendEvent(sessionId, "session_stopped", {
        reason: "User requested stop",
      });
      wsClient.sendSessionUpdate(sessionId, "stopped");
      return;
    }

    // Send thinking event
    wsClient.sendEvent(sessionId, "thinking_delta", {
      content: `Step ${i + 1}: Calling LLM...`,
    });

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      });
    } catch (err) {
      console.error(`[agent-loop] LLM error:`, err);
      wsClient.sendEvent(sessionId, "error", {
        message: `LLM API error: ${err instanceof Error ? err.message : String(err)}`,
      });
      wsClient.sendSessionUpdate(sessionId, "failed");
      return;
    }

    const choice = response.choices[0];
    if (!choice) {
      wsClient.sendEvent(sessionId, "error", { message: "No response from LLM" });
      wsClient.sendSessionUpdate(sessionId, "failed");
      return;
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // Stream assistant text content
    if (assistantMessage.content) {
      wsClient.sendEvent(sessionId, "assistant_message_delta", {
        content: assistantMessage.content,
      });
      wsClient.sendEvent(sessionId, "assistant_message_completed", {
        content: assistantMessage.content,
      });
    }

    // Handle tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        if (shouldStop()) {
          wsClient.sendEvent(sessionId, "session_stopped", {
            reason: "User requested stop",
          });
          wsClient.sendSessionUpdate(sessionId, "stopped");
          return;
        }

        // Only handle function-type tool calls
        if (toolCall.type !== "function") continue;

        const fnName = toolCall.function.name;
        let fnArgs: Record<string, string>;
        try {
          fnArgs = JSON.parse(toolCall.function.arguments) as Record<string, string>;
        } catch {
          fnArgs = {};
        }

        wsClient.sendEvent(sessionId, "tool_call_started", {
          toolCallId: toolCall.id,
          name: fnName,
          arguments: fnArgs,
        });

        console.log(`[agent-loop] executing tool: ${fnName}`, fnArgs);
        const result = executeTool(fnName, fnArgs);

        wsClient.sendEvent(sessionId, "tool_call_output", {
          toolCallId: toolCall.id,
          name: fnName,
          output: result.output,
          error: result.error,
        });

        wsClient.sendEvent(sessionId, "tool_call_completed", {
          toolCallId: toolCall.id,
          name: fnName,
        });

        // Add tool result to conversation
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.error
            ? `Error: ${result.error}\n${result.output}`
            : result.output,
        });
      }

      // Continue the loop to let the LLM process tool results
      continue;
    }

    // No tool calls — LLM is done
    if (choice.finish_reason === "stop") {
      console.log(`[agent-loop] session ${sessionId} completed`);
      wsClient.sendEvent(sessionId, "session_completed", {
        message: "Agent completed the task",
      });
      wsClient.sendSessionUpdate(sessionId, "completed");
      return;
    }
  }

  // Max iterations reached
  wsClient.sendEvent(sessionId, "session_completed", {
    message: `Reached maximum iterations (${MAX_ITERATIONS})`,
  });
  wsClient.sendSessionUpdate(sessionId, "completed");
}
