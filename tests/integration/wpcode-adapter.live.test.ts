import { describe, it, expect } from 'vitest';
import { createWPCodeAdapter } from '../../src/lib/wpcode-adapter.js';

/**
 * Live-Integration-Test gegen test4.nick-webdesign.de via novamira MCP.
 * Voraussetzung: MCP-Server "novamira-test4-nick-webdesign-de" ist im aktiven
 * Tool-Set des Agent-Tests verfügbar.
 *
 * Aufruf: vitest run --config vitest.config.ts tests/integration
 *
 * Diese Tests prüfen die echten Round-Trips, nicht die Mock-PHP-Generierung.
 * Im Mock-Test (tests/unit/wpcode-adapter.test.ts) wird geprüft, dass der
 * PHP-Code korrekt gebaut wird; hier wird geprüft, dass er auch wirklich
 * funktioniert.
 */

const mcp = (ability_name: string, parameters: Record<string, unknown>) =>
  (globalThis as any).mcp__novamira_test4_nick_webde__mcp_adapter_execute_ability({
    ability_name,
    parameters,
  });

const hasMcp = (): boolean =>
  typeof (globalThis as any).mcp__novamira_test4_nick_webde__mcp_adapter_execute_ability ===
  'function';

describe.skipIf(!hasMcp())('WPCode adapter (live test4)', () => {
  it('detects the WPCode CPT slug', async () => {
    const adapter = createWPCodeAdapter(mcp);
    const slug = await adapter.detectCptSlug();
    expect(slug).toBe('wpcode');
  });

  it('creates and deletes a snippet round-trip', async () => {
    const adapter = createWPCodeAdapter(mcp);
    const id = await adapter.createSnippet({
      title: 'Clone-V3 LIVE TEST (will be deleted)',
      code: 'console.log("live round-trip test");',
      type: 'js',
      location: 'site-wide-footer',
      priority: 99,
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);

    const meta = await adapter.getSnippetMeta(id);
    expect(meta?._wpcode_code).toEqual(['console.log("live round-trip test");']);

    await adapter.activateSnippet(id);
    const meta2 = await adapter.getSnippetMeta(id);
    expect(meta2?._wpcode_auto_insert).toEqual(['1']);

    await adapter.deleteSnippet(id);
  });
});
