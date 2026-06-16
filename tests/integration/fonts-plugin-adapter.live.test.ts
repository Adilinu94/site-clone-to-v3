import { describe, it, expect } from 'vitest';
import { createFontsPluginAdapter } from '../../src/lib/fonts-plugin-adapter.js';

const mcp = (ability_name: string, parameters: Record<string, unknown>) =>
  (globalThis as any).mcp__novamira_test4_nick_webde__mcp_adapter_execute_ability({
    ability_name,
    parameters,
  });

const hasMcp = (): boolean =>
  typeof (globalThis as any).mcp__novamira_test4_nick_webde__mcp_adapter_execute_ability ===
  'function';

describe.skipIf(!hasMcp())('Fonts-Plugin adapter (live test4)', () => {
  it('detects the Fonts Plugin v4.1.3', async () => {
    const adapter = createFontsPluginAdapter(mcp);
    const info = await adapter.detectFontsPlugin();
    expect(info.active).toBe(true);
    expect(info.version).toBe('4.1.3');
    expect(info.taxonomy).toBe('ogf_custom_fonts');
  });

  it('uploads a custom font and cleans up', async () => {
    const adapter = createFontsPluginAdapter(mcp);
    const result = await adapter.uploadCustomFont({
      family: 'CloneV3LiveTest',
      weight: 700,
      woff2Url: 'https://test4.nick-webdesign.de/wp-content/uploads/2026/06/nonexistent.woff2',
      preload: false,
    });
    expect(result.termId).toBeGreaterThan(0);
    expect(result.termSlug).toMatch(/^clonev3livetest-700$/);

    await adapter.deleteFont(result.termSlug);
  });

  it('registers a Google font in theme_mods', async () => {
    const adapter = createFontsPluginAdapter(mcp);
    await adapter.registerGoogleFont({ family: 'Roboto', weights: [400] });
    // No assertion on state since we don't have direct access; the call should not throw.
  });
});
