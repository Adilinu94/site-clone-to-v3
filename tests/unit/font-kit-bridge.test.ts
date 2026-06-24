import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractFamilies, syncFontsToKit } from '../../src/analysis/font-kit-bridge.js';
import type { FontIntercept } from '../../src/extractor/types.js';
import type { McpAdapter } from '../../src/mcp/mcp-adapter.js';

function intercept(overrides: Partial<FontIntercept>): FontIntercept {
  return { url: 'https://example.com/font.woff2', type: 'woff2', ...overrides };
}

function mockAdapter(output: string): McpAdapter {
  return {
    executeAbility: vi.fn().mockResolvedValue({ success: true, data: { output } }),
  } as unknown as McpAdapter;
}

// ---------------------------------------------------------------------------
// extractFamilies
// ---------------------------------------------------------------------------
describe('font-kit-bridge: extractFamilies', () => {
  it('returns empty array for empty input', () => {
    expect(extractFamilies([])).toEqual([]);
  });

  it('uses family field when present', () => {
    const fonts = [intercept({ family: 'Manrope', weight: 600, type: 'woff2' })];
    const result = extractFamilies(fonts);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Manrope');
    expect(result[0].weight).toBe(600);
  });

  it('deduplicates fonts with the same family (case-insensitive)', () => {
    const fonts = [
      intercept({ family: 'Roboto', weight: 400 }),
      intercept({ family: 'roboto', weight: 700 }),
      intercept({ family: 'ROBOTO', weight: 400 }),
    ];
    const result = extractFamilies(fonts);
    expect(result).toHaveLength(1);
  });

  it('picks dominant weight (most frequent)', () => {
    const fonts = [
      intercept({ family: 'Inter', weight: 400 }),
      intercept({ family: 'Inter', weight: 400 }),
      intercept({ family: 'Inter', weight: 700 }),
    ];
    const result = extractFamilies(fonts);
    expect(result[0].weight).toBe(400); // 400 appears twice
  });

  it('handles multiple unique families', () => {
    const fonts = [
      intercept({ family: 'Manrope', weight: 600 }),
      intercept({ family: 'Roboto', weight: 400 }),
    ];
    const result = extractFamilies(fonts);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name)).toContain('Manrope');
    expect(result.map((f) => f.name)).toContain('Roboto');
  });

  it('parses family from Google Fonts CSS URL', () => {
    const fonts = [
      intercept({
        url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;700',
        type: 'google-fonts-css',
        family: undefined,
      }),
    ];
    const result = extractFamilies(fonts);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Manrope');
  });

  it('parses family from Google Fonts URL with + encoding', () => {
    const fonts = [
      intercept({
        url: 'https://fonts.googleapis.com/css?family=Open+Sans:400,700',
        type: 'google-fonts-css',
        family: undefined,
      }),
    ];
    const result = extractFamilies(fonts);
    expect(result[0].name).toBe('Open Sans');
  });

  it('parses family from woff2 filename', () => {
    const fonts = [
      intercept({
        url: 'https://example.com/fonts/Merriweather-Bold.woff2',
        type: 'woff2',
        family: undefined,
      }),
    ];
    const result = extractFamilies(fonts);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Merriweather');
  });

  it('skips intercepts with no resolvable family', () => {
    const fonts = [
      intercept({ url: 'https://example.com/some.woff2', type: 'woff2', family: undefined }),
    ];
    const result = extractFamilies(fonts);
    expect(result).toHaveLength(0);
  });

  it('defaults weight to 400 when not specified', () => {
    const fonts = [intercept({ family: 'Lato', weight: undefined })];
    const result = extractFamilies(fonts);
    expect(result[0].weight).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// syncFontsToKit
// ---------------------------------------------------------------------------
describe('font-kit-bridge: syncFontsToKit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns dryRun result without calling MCP', async () => {
    const adapter = mockAdapter('');
    const fonts = [intercept({ family: 'Manrope', weight: 600 })];
    const result = await syncFontsToKit(fonts, adapter, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.added).toContain('Manrope');
    expect(adapter.executeAbility).not.toHaveBeenCalled();
  });

  it('returns empty result when no families can be extracted', async () => {
    const adapter = mockAdapter('');
    const result = await syncFontsToKit([], adapter);
    expect(result.added).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(adapter.executeAbility).not.toHaveBeenCalled();
  });

  it('calls execute-php with extracted families', async () => {
    const output = JSON.stringify({ added: ['Manrope'], skipped: [] });
    const adapter = mockAdapter(output);
    const fonts = [intercept({ family: 'Manrope', weight: 600 })];

    const result = await syncFontsToKit(fonts, adapter);
    expect(adapter.executeAbility).toHaveBeenCalledWith(
      'novamira/execute-php',
      expect.objectContaining({ code: expect.stringContaining('Manrope') }),
    );
    expect(result.added).toContain('Manrope');
    expect(result.skipped).toHaveLength(0);
  });

  it('reports skipped families from PHP response', async () => {
    const output = JSON.stringify({ added: ['Roboto'], skipped: ['Manrope'] });
    const adapter = mockAdapter(output);
    const fonts = [
      intercept({ family: 'Manrope', weight: 600 }),
      intercept({ family: 'Roboto', weight: 400 }),
    ];

    const result = await syncFontsToKit(fonts, adapter);
    expect(result.added).toContain('Roboto');
    expect(result.skipped).toContain('Manrope');
    expect(result.dryRun).toBe(false);
  });

  it('throws when execute-php returns empty output', async () => {
    const adapter = mockAdapter('');
    const fonts = [intercept({ family: 'Manrope', weight: 600 })];

    await expect(syncFontsToKit(fonts, adapter)).rejects.toThrow('empty output');
  });
});
