import { request as undiciRequest } from 'undici';

export interface McpAdapterOptions {
  baseUrl: string;
  authHeader: string;
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolContent {
  type: string;
  text: string;
}

export class McpAdapter {
  private reqId = 0;
  private sessionId: string | null = null;
  private readonly options: Required<McpAdapterOptions>;

  constructor(opts: McpAdapterOptions) {
    this.options = {
      timeoutMs: 30_000,
      maxRetries: 3,
      backoffMs: 500,
      ...opts,
    };
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.reqId,
      method,
      params,
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: this.options.authHeader,
        };
        if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

        const res = await undiciRequest(this.options.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          headersTimeout: this.options.timeoutMs,
          bodyTimeout: this.options.timeoutMs,
        });

        if (res.statusCode >= 500) {
          lastError = new Error(`HTTP ${res.statusCode}`);
          await this.sleep(this.options.backoffMs * Math.pow(2, attempt));
          continue;
        }

        const text = await res.body.text();
        let json: JsonRpcResponse<T>;
        try {
          json = JSON.parse(text) as JsonRpcResponse<T>;
        } catch (parseErr) {
          lastError = new Error(`Invalid JSON: ${text.slice(0, 200)}`);
          continue;
        }

        const sessionHeader = res.headers['mcp-session-id'];
        if (typeof sessionHeader === 'string') this.sessionId = sessionHeader;

        if (json.error && typeof json.error === 'object') {
          throw new McpRpcError(json.error.code, json.error.message, json.error.data);
        }

        if (res.statusCode === 401 || res.statusCode === 403) {
          throw new Error(`Auth failed: HTTP ${res.statusCode}`);
        }

        if (res.statusCode >= 400) {
          throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`);
        }

        return json.result as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof McpRpcError) throw err;
        if (attempt < this.options.maxRetries - 1) {
          await this.sleep(this.options.backoffMs * Math.pow(2, attempt));
        }
      }
    }
    throw lastError ?? new Error('MCP call failed after retries');
  }

  async initialize(): Promise<void> {
    if (this.sessionId) return;
    await this.call<unknown>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'site-clone-to-v3', version: '0.1.0' },
    });
  }

  async callTool<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.call<{ content?: McpToolContent[]; isError?: boolean }>('tools/call', {
      name: toolName,
      arguments: args,
    });
    if (result.isError) {
      const errorText = result.content?.[0]?.text ?? 'Unknown MCP error';
      throw new Error(`MCP tool ${toolName} failed: ${errorText}`);
    }
    return result as T;
  }

  async executeAbility<T = unknown>(abilityName: string, parameters: Record<string, unknown> = {}): Promise<T> {
    const result = await this.callTool<{ content?: McpToolContent[] }>('mcp-adapter-execute-ability', {
      ability_name: abilityName,
      parameters,
    });
    const text = result.content?.[0]?.text ?? '{}';
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`executeAbility(${abilityName}) returned non-JSON: ${text.slice(0, 200)}`);
    }
  }

  async listAbilities(): Promise<string[]> {
    const result = await this.callTool<{ content?: McpToolContent[] }>('mcp-adapter-discover-abilities', {});
    const text = result.content?.[0]?.text ?? '{}';
    const parsed = JSON.parse(text) as { abilities: Array<{ name: string }> };
    return (parsed.abilities ?? []).map((a) => a.name);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class McpRpcError extends Error {
  constructor(public code: number, message: string, public data?: unknown) {
    super(`MCP RPC ${code}: ${message}`);
    this.name = 'McpRpcError';
  }
}

export interface AbilityMeta {
  name: string;
  label?: string;
  description?: string;
}

export async function listAbilities(adapter: McpAdapter): Promise<string[]> {
  return adapter.listAbilities();
}

export interface V4FoundationData {
  success: boolean;
  base_classes: Record<string, { status: 'created' | 'exists'; id: string }>;
  variables: { colors: Record<string, string>; fonts: Record<string, string>; sizes: Record<string, string> };
  classes: Record<string, string>;
  quick_ref?: {
    base_classes: { flexbox_base: string; div_block_base: string };
    colors: Record<string, string | null>;
    fonts: Record<string, string | null>;
  };
}

export async function setupV4Foundation(adapter: McpAdapter, params: { create_missing?: boolean } = {}): Promise<V4FoundationData> {
  const result = await adapter.executeAbility<{ success: boolean; data: V4FoundationData }>(
    'novamira-adrianv2/setup-v4-foundation',
    params
  );
  return result.data;
}

export interface VariableEntry {
  id: string;
  label: string;
  type: 'color' | 'font' | 'size';
  value: string;
}

export async function listVariables(adapter: McpAdapter): Promise<VariableEntry[]> {
  const result = await adapter.executeAbility<{ success: boolean; data: { variables: VariableEntry[] } }>(
    'novamira/elementor-list-variables',
    {}
  );
  return result.data.variables ?? [];
}

export interface GlobalClassEntry {
  id: string;
  label: string;
  type: string;
  variants: Array<{ meta: { breakpoint: string; state: string | null }; props: Record<string, unknown> }>;
}

export async function listGlobalClasses(adapter: McpAdapter): Promise<GlobalClassEntry[]> {
  const result = await adapter.executeAbility<{ success: boolean; data: { classes: GlobalClassEntry[] } }>(
    'novamira/elementor-list-global-classes',
    {}
  );
  return result.data.classes ?? [];
}

export interface ListMediaItem {
  id: number;
  title: string;
  mime: string;
  url?: string;
  width?: number;
  height?: number;
  alt?: string;
}

export async function listMedia(adapter: McpAdapter, params: { per_page?: number; search?: string; mime_type?: string } = {}): Promise<ListMediaItem[]> {
  const result = await adapter.executeAbility<{ success: boolean; data: { media?: ListMediaItem[] } }>(
    'novamira-adrianv2/list-media',
    params
  );
  return result.data.media ?? [];
}

export interface BatchBuildPageParams extends Record<string, unknown> {
  content: unknown[];
  post_id?: number;
  title?: string;
  page_css?: string;
  page_js?: string;
}

export interface BatchBuildPageResult {
  post_id: number;
  permalink: string;
  edit_url: string;
  summary: { total_elements: number; atomic_elements: number; v3_elements: number };
}

export async function batchBuildPage(adapter: McpAdapter, params: BatchBuildPageParams): Promise<BatchBuildPageResult> {
  const result = await adapter.executeAbility<{ success: boolean; data: BatchBuildPageResult }>(
    'novamira-adrianv2/batch-build-page',
    params
  );
  return result.data;
}

export interface ApplyGlobalClassParams extends Record<string, unknown> {
  element_id: string;
  class_id: string;
  post_id: number;
}

export interface ApplyGlobalClassResult {
  element_id: string;
  class_id: string;
}

export async function applyGlobalClass(adapter: McpAdapter, params: ApplyGlobalClassParams): Promise<ApplyGlobalClassResult> {
  const result = await adapter.executeAbility<{ success: boolean; data: ApplyGlobalClassResult }>(
    'novamira/elementor-apply-global-class',
    params
  );
  return result.data;
}
