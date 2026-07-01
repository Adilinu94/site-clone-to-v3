import { describe, it, expect, vi } from 'vitest';
import { upgradePageToV4 } from '../../src/mcp/upgrade-v4.js';
import type { McpAdapter } from '../../src/mcp/mcp-adapter.js';

function mockAdapter(executeAbility: ReturnType<typeof vi.fn>): McpAdapter {
  return { executeAbility } as unknown as McpAdapter;
}

describe('upgradePageToV4', () => {
  it('sends post_ids as a single-element array and dry_run defaulting to false', async () => {
    const executeAbility = vi.fn().mockResolvedValue({
      success: true,
      results: { '42': { status: 'upgraded', converted: 12, kept_v3: 0 } },
    });
    await upgradePageToV4(mockAdapter(executeAbility), { postId: 42 });
    expect(executeAbility).toHaveBeenCalledWith('novamira-adrianv2/upgrade-page-to-v4', {
      post_ids: [42],
      dry_run: false,
    });
  });

  it('passes dry_run through when set', async () => {
    const executeAbility = vi.fn().mockResolvedValue({
      success: true,
      results: { '42': { status: 'upgraded' } },
    });
    await upgradePageToV4(mockAdapter(executeAbility), { postId: 42, dryRun: true });
    expect(executeAbility).toHaveBeenCalledWith('novamira-adrianv2/upgrade-page-to-v4', {
      post_ids: [42],
      dry_run: true,
    });
  });

  it('returns success:true for status "upgraded"', async () => {
    const executeAbility = vi.fn().mockResolvedValue({
      success: true,
      results: { '42': { status: 'upgraded', converted: 8, kept_v3: 1, warnings: ['1 nested repeater kept as V3'] } },
    });
    const result = await upgradePageToV4(mockAdapter(executeAbility), { postId: 42 });
    expect(result).toEqual({
      success: true,
      status: 'upgraded',
      converted: 8,
      keptV3: 1,
      warnings: ['1 nested repeater kept as V3'],
      error: undefined,
    });
  });

  it('returns success:true for status "already_v4"', async () => {
    const executeAbility = vi.fn().mockResolvedValue({
      success: true,
      results: { '42': { status: 'already_v4' } },
    });
    const result = await upgradePageToV4(mockAdapter(executeAbility), { postId: 42 });
    expect(result.success).toBe(true);
    expect(result.status).toBe('already_v4');
  });

  it('returns success:false for status "skipped" (e.g. strategy=skip)', async () => {
    const executeAbility = vi.fn().mockResolvedValue({
      success: true,
      results: { '42': { status: 'skipped' } },
    });
    const result = await upgradePageToV4(mockAdapter(executeAbility), { postId: 42 });
    expect(result.success).toBe(false);
    expect(result.status).toBe('skipped');
  });

  it('returns success:false with error for status "failed"', async () => {
    const executeAbility = vi.fn().mockResolvedValue({
      success: true,
      results: { '42': { status: 'failed', error: 'invalid _elementor_data' } },
    });
    const result = await upgradePageToV4(mockAdapter(executeAbility), { postId: 42 });
    expect(result).toEqual({
      success: false,
      status: 'failed',
      converted: undefined,
      keptV3: undefined,
      warnings: undefined,
      error: 'invalid _elementor_data',
    });
  });

  it('returns success:false when the ability call itself fails', async () => {
    const executeAbility = vi.fn().mockResolvedValue({
      success: false,
      error: 'permission denied',
    });
    const result = await upgradePageToV4(mockAdapter(executeAbility), { postId: 42 });
    expect(result).toEqual({ success: false, status: 'failed', error: 'permission denied' });
  });

  it('returns success:false when the response has no result for the given post_id', async () => {
    const executeAbility = vi.fn().mockResolvedValue({
      success: true,
      results: { '99': { status: 'upgraded' } },
    });
    const result = await upgradePageToV4(mockAdapter(executeAbility), { postId: 42 });
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/no result for post_id/);
  });
});
