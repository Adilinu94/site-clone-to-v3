import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpAdapter, setupV4Foundation, listVariables, listGlobalClasses, listMedia } from '../../src/mcp/mcp-adapter.js';

let server: Server;
let baseUrl: string;
let receivedRequests: Array<{ method: string; body: unknown; sessionId: string | null }> = [];
let responseQueue: Array<{ status: number; body: unknown; setSession?: string }> = [];
let defaultResponse: { status: number; body: unknown; setSession?: string } = { status: 200, body: { jsonrpc: '2.0', id: 1, result: {} } };

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      let body: unknown = raw;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        // not JSON
      }
      receivedRequests.push({ method: req.method ?? 'GET', body, sessionId: (req.headers['mcp-session-id'] as string) ?? null });

      const next = responseQueue.shift() ?? defaultResponse;
      res.statusCode = next.status;
      if (next.setSession) res.setHeader('Mcp-Session-Id', next.setSession);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(next.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function resetMock() {
  receivedRequests = [];
  responseQueue = [];
  defaultResponse = { status: 200, body: { jsonrpc: '2.0', id: 1, result: {} } };
}

function queueResponse(resp: { status: number; body: unknown; setSession?: string }) {
  responseQueue.push(resp);
}

function mcpResult(result: unknown, id = 1) {
  return { jsonrpc: '2.0', id, result };
}

function mcpError(code: number, message: string, id = 1) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function makeContent(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

describe('McpAdapter — basics', () => {
  it('initializes and captures Mcp-Session-Id', async () => {
    resetMock();
    queueResponse({ status: 200, body: mcpResult({ serverInfo: { name: 'mock' } }), setSession: 'sess-abc-123' });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();

    expect(receivedRequests).toHaveLength(1);
    expect(receivedRequests[0].body).toMatchObject({ method: 'initialize' });
  });

  it('reuses session id on subsequent calls', async () => {
    resetMock();
    queueResponse({ status: 200, body: mcpResult({}, 1), setSession: 'sess-xyz' });
    queueResponse({ status: 200, body: mcpResult({ ok: true }, 2) });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();
    await adapter.call('tools/list', {});

    expect(receivedRequests[1].sessionId).toBe('sess-xyz');
  });

  it('throws McpRpcError on JSON-RPC error', async () => {
    resetMock();
    queueResponse({ status: 200, body: mcpError(-32600, 'Invalid Request') });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await expect(adapter.call('initialize', {})).rejects.toThrow(/Invalid Request/);
  });

  it('retries on 5xx and eventually throws', async () => {
    resetMock();
    queueResponse({ status: 500, body: { error: 'server' } });
    queueResponse({ status: 500, body: { error: 'server' } });
    queueResponse({ status: 500, body: { error: 'server' } });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test', maxRetries: 3, backoffMs: 10 });
    await expect(adapter.call('initialize', {})).rejects.toThrow(/HTTP 500/);
    expect(receivedRequests.length).toBe(3);
  });

  it('throws on 401 auth failure', async () => {
    resetMock();
    queueResponse({ status: 401, body: { code: 'unauthorized', message: 'Bad token' } });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer wrong', maxRetries: 1, backoffMs: 1 });
    await expect(adapter.call('initialize', {})).rejects.toThrow(/Auth failed/);
  });
});

describe('McpAdapter — executeAbility indirection', () => {
  it('wraps mcp-adapter-execute-ability with ability_name + parameters', async () => {
    resetMock();
    queueResponse({ status: 200, body: mcpResult({}, 1), setSession: 'sess-1' });
    queueResponse({
      status: 200,
      body: mcpResult(makeContent({ success: true, data: { result: 'ok' } }), 2),
    });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();
    const result = await adapter.executeAbility<{ success: boolean; data: { result: string } }>('novamira/some-ability', { foo: 'bar' });

    expect(result.data.result).toBe('ok');
    const secondCall = receivedRequests[1];
    expect(secondCall.body).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'mcp-adapter-execute-ability',
        arguments: { ability_name: 'novamira/some-ability', parameters: { foo: 'bar' } },
      },
    });
  });

  it('unwraps content[0].text and parses JSON', async () => {
    resetMock();
    queueResponse({ status: 200, body: mcpResult({}, 1), setSession: 'sess-1' });
    queueResponse({
      status: 200,
      body: mcpResult({ content: [{ type: 'text', text: JSON.stringify({ success: true, data: { count: 42 } }) }] }, 2),
    });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();
    const result = await adapter.executeAbility<{ success: boolean; data: { count: number } }>('any/ability');
    expect(result.data.count).toBe(42);
  });

  it('throws on isError: true', async () => {
    resetMock();
    queueResponse({ status: 200, body: mcpResult({}, 1), setSession: 'sess-1' });
    queueResponse({
      status: 200,
      body: mcpResult({ content: [{ type: 'text', text: 'Tool not found' }], isError: true }, 2),
    });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();
    await expect(adapter.executeAbility('missing/ability')).rejects.toThrow(/Tool not found/);
  });
});

describe('McpAdapter — high-level helpers', () => {
  it('setupV4Foundation returns V4FoundationData', async () => {
    resetMock();
    const foundationData = {
      success: true,
      base_classes: { 'e-flexbox-base': { status: 'exists', id: 'gc-1' }, 'e-div-block-base': { status: 'exists', id: 'gc-2' } },
      variables: { colors: { primary: 'e-gv-1' }, fonts: { body: 'e-gv-2' }, sizes: {} },
      classes: { btn: 'g-1' },
    };
    queueResponse({ status: 200, body: mcpResult({}, 1), setSession: 'sess-1' });
    queueResponse({
      status: 200,
      body: mcpResult({ content: [{ type: 'text', text: JSON.stringify({ success: true, data: foundationData }) }] }, 2),
    });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();
    const result = await setupV4Foundation(adapter, { create_missing: false });
    expect(result.base_classes['e-flexbox-base']?.id).toBe('gc-1');
    expect(result.variables.colors.primary).toBe('e-gv-1');
  });

  it('listVariables returns VariableEntry[]', async () => {
    resetMock();
    const variables = [
      { id: 'e-gv-1', label: 'primary', type: 'color', value: '#fff' },
      { id: 'e-gv-2', label: 'body', type: 'font', value: 'Inter' },
    ];
    queueResponse({ status: 200, body: mcpResult({}, 1), setSession: 'sess-1' });
    queueResponse({
      status: 200,
      body: mcpResult({ content: [{ type: 'text', text: JSON.stringify({ success: true, data: { variables } }) }] }, 2),
    });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();
    const result = await listVariables(adapter);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe('#fff');
  });

  it('listGlobalClasses returns GlobalClassEntry[]', async () => {
    resetMock();
    const classes = [
      { id: 'g-1', label: 'btn', type: 'global', variants: [{ meta: { breakpoint: 'desktop', state: null }, props: { color: '#000' } }] },
    ];
    queueResponse({ status: 200, body: mcpResult({}, 1), setSession: 'sess-1' });
    queueResponse({
      status: 200,
      body: mcpResult({ content: [{ type: 'text', text: JSON.stringify({ success: true, data: { classes } }) }] }, 2),
    });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();
    const result = await listGlobalClasses(adapter);
    expect(result[0].label).toBe('btn');
    expect(result[0].variants[0].meta.breakpoint).toBe('desktop');
  });

  it('listMedia returns ListMediaItem[]', async () => {
    resetMock();
    const media = [{ id: 1, title: 'hero.jpg', mime: 'image/jpeg', width: 1920, height: 1080 }];
    queueResponse({ status: 200, body: mcpResult({}, 1), setSession: 'sess-1' });
    queueResponse({
      status: 200,
      body: mcpResult({ content: [{ type: 'text', text: JSON.stringify({ success: true, data: { media } }) }] }, 2),
    });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();
    const result = await listMedia(adapter, { per_page: 5 });
    expect(result[0].id).toBe(1);
    expect(result[0].width).toBe(1920);
  });

  it('listAbilities returns string[]', async () => {
    resetMock();
    queueResponse({ status: 200, body: mcpResult({}, 1), setSession: 'sess-1' });
    queueResponse({
      status: 200,
      body: mcpResult({ content: [{ type: 'text', text: JSON.stringify({ abilities: [{ name: 'a/b' }, { name: 'c/d' }] }) }] }, 2),
    });

    const adapter = new McpAdapter({ baseUrl, authHeader: 'Bearer test' });
    await adapter.initialize();
    const result = await adapter.listAbilities();
    expect(result).toEqual(['a/b', 'c/d']);
  });
});
