import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";

const WORKSPACE = process.env["WORKSPACE_DIR"] ?? "/workspace";

/** Allowlisted shell commands */
const ALLOWED_COMMANDS = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "find",
  "grep",
  "wc",
  "echo",
  "mkdir",
  "touch",
  "cp",
  "mv",
  "rm",
  "pwd",
  "tree",
  "git",
  "node",
  "npx",
  "npm",
  "tsc",
  "curl",
  "jq",
  "diff",
  "sort",
  "uniq",
  "sed",
  "awk",
]);

function resolveWorkspacePath(filePath: string): string {
  const resolved = resolve(WORKSPACE, filePath);
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return resolved;
}

export interface ToolResult {
  output: string;
  error?: string;
}

export interface WriteFileResult extends ToolResult {
  fileMeta?: { path: string; size: number };
}

export function readFile(path: string): ToolResult {
  try {
    const resolved = resolveWorkspacePath(path);
    const content = readFileSync(resolved, "utf-8");
    return { output: content };
  } catch (err) {
    return { output: "", error: String(err) };
  }
}

export function writeFile(path: string, content: string): WriteFileResult {
  try {
    const resolved = resolveWorkspacePath(path);
    const dir = dirname(resolved);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(resolved, content, "utf-8");
    const stat = statSync(resolved);
    return {
      output: `Wrote ${stat.size} bytes to ${path}`,
      fileMeta: { path, size: stat.size },
    };
  } catch (err) {
    return { output: "", error: String(err) };
  }
}

export function listFiles(path: string): ToolResult {
  try {
    const resolved = resolveWorkspacePath(path || ".");
    const result = execSync(`ls -la "${resolved}"`, {
      encoding: "utf-8",
      timeout: 10_000,
      cwd: WORKSPACE,
    });
    return { output: result };
  } catch (err) {
    return { output: "", error: String(err) };
  }
}

export function shellExec(command: string): ToolResult {
  // Validate command against allowlist
  const baseCmd = command.trim().split(/\s+/)[0];
  if (!baseCmd || !ALLOWED_COMMANDS.has(baseCmd)) {
    return {
      output: "",
      error: `Command not allowed: ${baseCmd}. Allowed: ${[...ALLOWED_COMMANDS].join(", ")}`,
    };
  }

  try {
    const result = execSync(command, {
      encoding: "utf-8",
      timeout: 30_000,
      cwd: WORKSPACE,
      maxBuffer: 1024 * 1024,
    });
    return { output: result };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    return {
      output: execErr.stdout ?? "",
      error: execErr.stderr ?? execErr.message ?? String(err),
    };
  }
}

/** Tool definitions for the LLM */
export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the contents of a file in the workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path within workspace" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Write content to a file in the workspace. Creates directories if needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path within workspace" },
          content: { type: "string", description: "File content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List files in a directory within the workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative directory path (default: workspace root)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "shell_exec",
      description: "Execute a shell command in the workspace. Only allowlisted commands are permitted.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
];

/** Max output size sent back to LLM to avoid context overflow */
const MAX_OUTPUT_SIZE = 8000;

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_SIZE) return output;
  return (
    output.slice(0, MAX_OUTPUT_SIZE) +
    `\n...[truncated ${output.length - MAX_OUTPUT_SIZE} chars]`
  );
}

/** Execute a tool by name, with output truncation */
export function executeTool(
  name: string,
  args: Record<string, string>
): ToolResult | WriteFileResult {
  let result: ToolResult | WriteFileResult;
  try {
    switch (name) {
      case "read_file":
        result = readFile(args["path"] ?? "");
        break;
      case "write_file":
        result = writeFile(args["path"] ?? "", args["content"] ?? "");
        break;
      case "list_files":
        result = listFiles(args["path"] ?? ".");
        break;
      case "shell_exec":
        result = shellExec(args["command"] ?? "");
        break;
      default:
        return { output: "", error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { output: "", error: `Tool execution error: ${err}` };
  }

  const truncated: ToolResult | WriteFileResult = {
    output: truncateOutput(result.output),
    error: result.error,
  };
  if ("fileMeta" in result && result.fileMeta) {
    (truncated as WriteFileResult).fileMeta = result.fileMeta;
  }
  return truncated;
}
