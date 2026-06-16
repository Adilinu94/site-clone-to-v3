import { describe, it, expect, vi } from 'vitest';
import { createWPCodeAdapter } from '../../src/lib/wpcode-adapter.js';

function mockMcp(responses: unknown[]): { mcp: any; calls: { name: string; params: any }[] } {
  const calls: { name: string; params: any }[] = [];
  let i = 0;
  const mcp = vi.fn(async (name: string, params: any) => {
    calls.push({ name, params });
    return responses[i++];
  });
  return { mcp, calls };
}

describe('WPCode adapter', () => {
  it('detectCptSlug returns the slug from php return_value', async () => {
    const { mcp } = mockMcp([{ return_value: { slug: 'wpcode', version: '2.3.6', count: {} } }]);
    const adapter = createWPCodeAdapter(mcp);
    const slug = await adapter.detectCptSlug();
    expect(slug).toBe('wpcode');
  });

  it('detectCptSlug returns null when no WPCode CPT exists', async () => {
    const { mcp } = mockMcp([{ return_value: null }]);
    const adapter = createWPCodeAdapter(mcp);
    const slug = await adapter.detectCptSlug();
    expect(slug).toBeNull();
  });

  it('createSnippet uses detected slug and sends PHP with _wpcode_code meta', async () => {
    const { mcp, calls } = mockMcp([
      { return_value: { slug: 'wpcode' } },       // detectCptSlug
      { return_value: { id: 1961 } },             // createSnippet
    ]);
    const adapter = createWPCodeAdapter(mcp);
    const id = await adapter.createSnippet({
      title: 'Test: fadeIn',
      code: 'gsap.from(".hero", { opacity: 0 });',
      type: 'js',
      location: 'site-wide-footer',
      priority: 10,
    });
    expect(id).toBe(1961);
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe('novamira/execute-php');
    expect(calls[1].params.code).toContain("post_type'   => \"wpcode\"");
    expect(calls[1].params.code).toContain('_wpcode_code');
    expect(calls[1].params.code).toContain('gsap.from');
  });

  it('createSnippet throws when no WPCode installed', async () => {
    const { mcp } = mockMcp([{ return_value: null }]);
    const adapter = createWPCodeAdapter(mcp);
    await expect(
      adapter.createSnippet({ title: 'X', code: '', type: 'js', location: 'site-wide-footer' }),
    ).rejects.toThrow(/WPCode plugin not detected/);
  });

  it('createSnippet throws on PHP-side error', async () => {
    const { mcp } = mockMcp([
      { return_value: { slug: 'wpcode' } },
      { return_value: { error: 'permission denied' } },
    ]);
    const adapter = createWPCodeAdapter(mcp);
    await expect(
      adapter.createSnippet({ title: 'X', code: '', type: 'js', location: 'site-wide-footer' }),
    ).rejects.toThrow(/permission denied/);
  });

  it('deleteSnippet sends wp_delete_post with force=true', async () => {
    const { mcp, calls } = mockMcp([{ return_value: { deleted: true } }]);
    const adapter = createWPCodeAdapter(mcp);
    await adapter.deleteSnippet(1961);
    expect(calls[0].params.code).toContain('wp_delete_post(1961, true)');
  });

  it('activateSnippet sets _wpcode_auto_insert=1', async () => {
    const { mcp, calls } = mockMcp([{ return_value: { activated: true } }]);
    const adapter = createWPCodeAdapter(mcp);
    await adapter.activateSnippet(1961);
    expect(calls[0].params.code).toContain("_wpcode_auto_insert', '1'");
  });
});
