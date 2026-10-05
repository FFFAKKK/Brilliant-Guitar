/**
 * `@google/genai` exposes an optional MCP integration in its declaration file.
 * The Pi adapter does not enable MCP in this prototype, so the optional peer
 * dependency is represented locally for type resolution only.
 */
declare module "@modelcontextprotocol/sdk/client/index.js" {
  export interface Client {
    readonly [key: string]: unknown;
  }
}
