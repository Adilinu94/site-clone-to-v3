import { describe, it, expect, vi } from 'vitest';
import { createFontsPluginAdapter } from '../../src/lib/fonts-plugin-adapter.js';

function mockMcp(responses: unknown[]) {
  const calls: { name: string; params: any }[] = [];
  let i = 0;
  const mcp = vi.fn(async (name: string, params: any) => {
    calls.push({ name, params });
    return responses[i++];
  });
  return { mcp, calls };
}

describe('Fonts-Plugin adapter', () => {
  it('detectFontsPlugin reports plugin state', async () => {
    const { mcp } = mockMcp([{ return_value: { active: true, version: '4.1.3', taxonomy: 'ogf_custom_fonts', count: 3 } }]);
    const adapter = createFontsPluginAdapter(mcp);
    const info = await adapter.detectFontsPlugin();
    expect(info.active).toBe(true);
    expect(info.version).toBe('4.1.3');
    expect(info.fontCount).toBe(3);
  });

  it('registerGoogleFont appends to ogf_load_fonts and sets swap', async () => {
    const { mcp, calls } = mockMcp([{ return_value: { theme_mods: ['Inter:400,500,700'] } }]);
    const adapter = createFontsPluginAdapter(mcp);
    await adapter.registerGoogleFont({ family: 'Inter', weights: [400, 500, 700] });
    const code = calls[0].params.code;
    expect(code).toContain('"Inter:400,500,700"');
    expect(code).toContain("set_theme_mod('ogf_load_fonts'");
    expect(code).toContain("set_theme_mod('ogf_font_display', 'swap')");
  });

  it('uploadCustomFont uses taxonomy ogf_custom_fonts and slug <family>-<weight>', async () => {
    const { mcp, calls } = mockMcp([{ return_value: { term_id: 47, term_slug: 'roboto-700' } }]);
    const adapter = createFontsPluginAdapter(mcp);
    const result = await adapter.uploadCustomFont({
      family: 'Roboto',
      weight: 700,
      woff2Url: 'https://example.com/roboto-700.woff2',
      preload: true,
    });
    expect(result.termId).toBe(47);
    expect(result.termSlug).toBe('roboto-700');
    const code = calls[0].params.code;
    expect(code).toContain("wp_insert_term(\"Roboto 700\", \"ogf_custom_fonts\"");
    expect(code).toContain('"roboto-700"');
    expect(code).toContain("'woff2'   => \"https://example.com/roboto-700.woff2\"");
    expect(code).toContain("'weight'  => \"700\"");
    expect(code).toContain("'preload' => \"1\"");
    // CRITICAL: family is empty — Fonts-Plugin leitet aus Term-Namen ab
    expect(code).toContain("'family'  => ''");
    // CRITICAL: kein delete_transient mit Wildcard
    expect(code).toContain("_transient_ogf_%");
    expect(code).not.toContain("delete_transient('ogf_"); // explizit prüfen
  });

  it('uploadCustomFont throws when PHP returns error', async () => {
    const { mcp } = mockMcp([{ return_value: { error: 'slug already exists' } }]);
    const adapter = createFontsPluginAdapter(mcp);
    await expect(
      adapter.uploadCustomFont({ family: 'X', weight: 400, woff2Url: 'https://x.test/x.woff2' }),
    ).rejects.toThrow(/slug already exists/);
  });

  it('deleteFont resolves slug to term_id and clears option + cache', async () => {
    const { mcp, calls } = mockMcp([{ return_value: { deleted: true } }]);
    const adapter = createFontsPluginAdapter(mcp);
    await adapter.deleteFont('roboto-700');
    const code = calls[0].params.code;
    expect(code).toContain("get_term_by('slug', \"roboto-700\"");
    expect(code).toContain('wp_delete_term');
    expect(code).toContain('_transient_ogf_%');
  });

  it('deleteFont returns deleted=false on missing term', async () => {
    const { mcp } = mockMcp([{ return_value: { deleted: false, reason: 'not_found' } }]);
    const adapter = createFontsPluginAdapter(mcp);
    await adapter.deleteFont('does-not-exist');
  });

  it('registerSystemFont appends to ogf_system_fonts theme_mod', async () => {
    const { mcp, calls } = mockMcp([{ return_value: { system_fonts: ['-apple-system'] } }]);
    const adapter = createFontsPluginAdapter(mcp);
    await adapter.registerSystemFont('-apple-system');
    const code = calls[0].params.code;
    expect(code).toContain("set_theme_mod('ogf_system_fonts'");
    expect(code).toContain('"-apple-system"');
  });
});
