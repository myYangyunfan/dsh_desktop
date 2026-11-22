#!/usr/bin/env node
// stdio MCP server. Protocol messages go to stdout; diagnostics go to stderr.
import readline from "node:readline";
import { createMcpHandler } from "../lib/mcp_server.js";

const handle = createMcpHandler();

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", async (line) => {
  const text = line.trim();
  if (text === "") return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } })}\n`);
    return;
  }
  try {
    const response = await handle(message);
    if (response !== undefined) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    process.stderr.write(`mcp: ${error?.stack ?? error}\n`);
    if (message?.id !== undefined) {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "internal error" } })}\n`
      );
    }
  }
});
