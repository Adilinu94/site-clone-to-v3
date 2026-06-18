import { describe, it, expect, beforeEach } from 'vitest';
import { createRealFixers, type McpCallFn, type ElementResolver } from '../../../src/qa/real-fixers.js';
import type { Issue } from '../../../src/qa/issue-detector.js';
import type { AutoFixFixer } from '../../../src/qa/auto-fix.js';

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  type: 'color-mismatch',
  severity: 'medium',
  region: { x: 100, y: 200, width: 300, height: 100 },
  diffPixels: 1234,
  description: 'Color difference detected at (100,200)',
  suggestedFix: 'Adjust background color',
  ...overrides,
});

const makeResolver = (overrides: Partial<ElementResolver> = {}): ElementResolver => ({
  resolve: () => ({ sectionId: 'sec-1', widgetId: 'w-1' }),
  ...overrides,
});

const makeMcpRecorder = () => {
  const calls: Array<{ ability: string; params: Record<string, unknown> }> = [];
  const mcp: McpCallFn = async (ability, params) => {
    calls.push({ ability, params });
    return { success: true };
  };
  return { mcp, calls };
};

describe('createRealFixers', () => {
  let mcp: ReturnType<typeof makeMcpRecorder>;
  let resolver: ElementResolver;
  let fixers: AutoFixFixer[];

  beforeEach(() => {
    mcp = makeMcpRecorder();
    resolver = makeResolver();
    fixers = createRealFixers({
      mcp: mcp.mcp,
      postId: 42,
      resolver,
      dryRun: false,
    });
  });

  it('returns six fixers covering the V1 issue-types', () => {
    expect(fixers).toHaveLength(6);
    const types = fixers.map((f) => f.type);
    expect(types).toContain('color-mismatch');
    expect(types).toContain('font-missing');
    expect(types).toContain('layout-shift');
    expect(types).toContain('image-broken');
    expect(types).toContain('size-mismatch');
    expect(types).toContain('animation-inactive');
  });

  describe('color-mismatch fixer', () => {
    it('calls novamira/elementor-edit-element with element id and color setting', async () => {
      const fixer = fixers.find((f) => f.type === 'color-mismatch')!;
      const r = await fixer.apply({
        issue: makeIssue(),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(r.ok).toBe(true);
      expect(mcp.calls).toHaveLength(1);
      expect(mcp.calls[0].ability).toBe('novamira/elementor-edit-element');
      expect(mcp.calls[0].params.post_id).toBe(42);
      expect(mcp.calls[0].params.element_id).toBe('w-1');
      expect(mcp.calls[0].params.section_id).toBe('sec-1');
      expect(mcp.calls[0].params.setting).toBe('_background_color');
    });

    it('uses sectionId as element_id when no widget is mapped', async () => {
      const secOnlyResolver = makeResolver({ resolve: () => ({ sectionId: 'sec-only', widgetId: null }) });
      const secOnlyFixers = createRealFixers({
        mcp: mcp.mcp,
        postId: 7,
        resolver: secOnlyResolver,
        dryRun: false,
      });
      const fixer = secOnlyFixers.find((f) => f.type === 'color-mismatch')!;
      await fixer.apply({ issue: makeIssue(), round: 1, attempt: 1, previousAttempts: 0 });
      expect(mcp.calls[0].params.element_id).toBe('sec-only');
      expect(mcp.calls[0].params.widget_id).toBeUndefined();
    });

    it('returns skipped when resolver returns null', async () => {
      const nullResolver = makeResolver({ resolve: () => null });
      const noMapFixers = createRealFixers({
        mcp: mcp.mcp,
        postId: 1,
        resolver: nullResolver,
        dryRun: false,
      });
      const fixer = noMapFixers.find((f) => f.type === 'color-mismatch')!;
      const r = await fixer.apply({ issue: makeIssue(), round: 1, attempt: 1, previousAttempts: 0 });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/no element mapped/);
      expect(mcp.calls).toHaveLength(0);
    });
  });

  describe('font-missing fixer', () => {
    it('calls novamira/execute-php with register_google PHP code', async () => {
      const fixer = fixers.find((f) => f.type === 'font-missing')!;
      const r = await fixer.apply({
        issue: makeIssue({
          type: 'font-missing',
          description: 'Font rendering differs at (100,200) — font-family: Roboto Slab mismatch',
        }),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(r.ok).toBe(true);
      expect(mcp.calls[0].ability).toBe('novamira/execute-php');
      expect(mcp.calls[0].params.code).toContain('Roboto Slab');
      expect(mcp.calls[0].params.code).toContain("ogf_load_fonts");
    });

    it('uses Unknown when description has no font-family', async () => {
      const fixer = fixers.find((f) => f.type === 'font-missing')!;
      await fixer.apply({
        issue: makeIssue({ type: 'font-missing', description: 'no family hint here' }),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(mcp.calls[0].params.code).toContain('Unknown');
    });
  });

  describe('layout-shift fixer', () => {
    it('sends padding/margin reset to elementor-edit-element', async () => {
      const fixer = fixers.find((f) => f.type === 'layout-shift')!;
      await fixer.apply({
        issue: makeIssue({ type: 'layout-shift' }),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(mcp.calls[0].ability).toBe('novamira/elementor-edit-element');
      expect(mcp.calls[0].params.settings).toHaveProperty('padding');
      expect(mcp.calls[0].params.settings).toHaveProperty('margin');
    });
  });

  describe('image-broken fixer', () => {
    it('uploads asset then edits element with image setting', async () => {
      const fixer = fixers.find((f) => f.type === 'image-broken')!;
      await fixer.apply({
        issue: makeIssue({
          type: 'image-broken',
          description: 'broken image src="https://example.com/hero.jpg"',
        }),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(mcp.calls).toHaveLength(2);
      expect(mcp.calls[0].ability).toBe('novamira/upload_asset');
      expect(mcp.calls[0].params.asset_url).toBe('https://example.com/hero.jpg');
      expect(mcp.calls[1].ability).toBe('novamira/elementor-edit-element');
      expect(mcp.calls[1].params.setting).toBe('image');
    });

    it('skips upload when no src is in description', async () => {
      const fixer = fixers.find((f) => f.type === 'image-broken')!;
      await fixer.apply({
        issue: makeIssue({ type: 'image-broken', description: 'broken image no url' }),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(mcp.calls[0].params.asset_url).toBe('');
    });
  });

  describe('size-mismatch fixer', () => {
    it('sets width and height from issue.region', async () => {
      const fixer = fixers.find((f) => f.type === 'size-mismatch')!;
      await fixer.apply({
        issue: makeIssue({ type: 'size-mismatch', region: { x: 0, y: 0, width: 250, height: 80 } }),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(mcp.calls[0].ability).toBe('novamira/elementor-edit-element');
      expect(mcp.calls[0].params.settings.width).toEqual({ size: 250, unit: 'px' });
      expect(mcp.calls[0].params.settings.height).toEqual({ size: 80, unit: 'px' });
    });
  });

  describe('animation-inactive fixer', () => {
    it('creates wpcode snippet with @keyframes via execute-php', async () => {
      const fixer = fixers.find((f) => f.type === 'animation-inactive')!;
      await fixer.apply({
        issue: makeIssue({ type: 'animation-inactive', description: '@keyframes fadeIn missing' }),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(mcp.calls[0].ability).toBe('novamira/execute-php');
      expect(mcp.calls[0].params.code).toContain('wpcode');
      expect(mcp.calls[0].params.code).toContain('@keyframes');
      expect(mcp.calls[0].params.code).toContain('fadeIn');
      expect(mcp.calls[0].params.code).toContain('_wpcode_code');
    });
  });

  describe('dry-run mode', () => {
    it('does not call MCP, returns descriptive message', async () => {
      const dryRunMcp = makeMcpRecorder();
      const dryFixers = createRealFixers({
        mcp: dryRunMcp.mcp,
        postId: 1,
        resolver,
        dryRun: true,
      });
      const fixer = dryFixers.find((f) => f.type === 'color-mismatch')!;
      const r = await fixer.apply({
        issue: makeIssue(),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(r.ok).toBe(true);
      expect(r.message).toContain('[DRY-RUN]');
      expect(dryRunMcp.calls).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('returns ok:false when MCP throws', async () => {
      const failMcp: McpCallFn = async () => {
        throw new Error('connection refused');
      };
      const failFixers = createRealFixers({
        mcp: failMcp,
        postId: 1,
        resolver,
        dryRun: false,
      });
      const fixer = failFixers.find((f) => f.type === 'color-mismatch')!;
      const r = await fixer.apply({
        issue: makeIssue(),
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(r.ok).toBe(false);
      expect(r.message).toContain('connection refused');
    });
  });
});
