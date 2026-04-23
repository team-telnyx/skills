import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export interface ProxyOptions {
  apiKey: string;
  remoteUrl: string;
}

/**
 * Creates a bidirectional proxy between a local stdio MCP transport
 * and a remote Telnyx MCP server over Streamable HTTP.
 */
export async function createProxy(options: ProxyOptions): Promise<void> {
  const { apiKey, remoteUrl } = options;

  const stdioTransport = new StdioServerTransport();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": `telnyx-mcp-proxy/0.2.0`,
  };

  const remoteTransport = new StreamableHTTPClientTransport(
    new URL(remoteUrl),
    { requestInit: { headers } }
  );

  // Forward messages from stdio client to remote server
  stdioTransport.onmessage = async (message: JSONRPCMessage) => {
    await remoteTransport.send(message);
  };

  // Forward messages from remote server to stdio client
  remoteTransport.onmessage = async (message: JSONRPCMessage) => {
    await stdioTransport.send(message);
  };

  // Handle close from either side
  stdioTransport.onclose = async () => {
    await remoteTransport.close();
  };

  remoteTransport.onclose = async () => {
    await stdioTransport.close();
  };

  // Handle errors
  stdioTransport.onerror = (error: Error) => {
    console.error("[proxy] stdio error:", error);
  };

  remoteTransport.onerror = (error: Error) => {
    console.error("[proxy] remote error:", error);
  };

  // Start both transports
  await stdioTransport.start();
  await remoteTransport.start();
}

export { resolveEndpoint, SHARED_MCP_URL } from "./endpoint.js";
export type { ResolveResult } from "./endpoint.js";
