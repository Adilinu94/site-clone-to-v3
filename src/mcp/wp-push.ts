/**
 * WordPress Push stage.
 *
 * Injects a complete V3 element tree into an Elementor page via the
 * novamira-adrianv2/elementor-inject-calibrated-page MCP ability.
 *
 * CRITICAL: Never use batch-build-page for V3 nested trees — it silently
 * ignores nested elements and only saves top-level sections. Always use
 * elementor-inject-calibrated-page with the full _elementor_data array.
 */
import type { McpAdapter } from './mcp-adapter.js';
import type { V3Element } from '../builder/v3-builder.js';

export interface WpPushOptions {
  /** Existing post ID to update. If undefined, a new page is created via execute-php. */
  postId?: number;
  title: string;
  status: 'draft' | 'publish';
  pageTemplate: 'elementor_canvas' | 'elementor_full_width' | 'default';
  dryRun?: boolean;
  /**
   * Override the inject ability name.
   * Default: novamira-adrianv2/elementor-inject-calibrated-page
   */
  injectAbility?: string;
}

export interface WpPushResult {
  postId: number;
  permalink: string;
  /** True when a new WP page was created (no postId in options). */
  created: boolean;
  dryRun: boolean;
}

const DEFAULT_INJECT_ABILITY = 'novamira-adrianv2/elementor-inject-calibrated-page';

/** Shape of the Novamira execute-php ability response. */
interface ExecutePhpResponse {
  success: boolean;
  data?: { output?: string };
  output?: string;
}

function getPhpOutput(res: ExecutePhpResponse): string {
  return (res.data?.output ?? res.output ?? '').trim();
}

async function createPage(
  adapter: McpAdapter,
  title: string,
  status: 'draft' | 'publish',
): Promise<{ postId: number; permalink: string }> {
  // JSON.stringify ensures the title is a valid PHP double-quoted string literal.
  const php = `
$id = wp_insert_post(['post_title' => ${JSON.stringify(title)}, 'post_status' => ${JSON.stringify(status)}, 'post_type' => 'page']);
if (is_wp_error($id)) { throw new Exception($id->get_error_message()); }
echo json_encode(['post_id' => (int) $id, 'permalink' => (string) get_permalink($id)]);
`;
  const res = await adapter.executeAbility<ExecutePhpResponse>('novamira/execute-php', { code: php });
  const raw = getPhpOutput(res);
  if (!raw) throw new Error('[wp-push] execute-php returned empty output for createPage');
  const parsed = JSON.parse(raw) as { post_id: number; permalink: string };
  return { postId: parsed.post_id, permalink: parsed.permalink };
}

async function getPermalink(adapter: McpAdapter, postId: number): Promise<string> {
  const php = `echo get_permalink(${postId.toString()});`;
  const res = await adapter.executeAbility<ExecutePhpResponse>('novamira/execute-php', { code: php });
  return getPhpOutput(res);
}

/**
 * Push a V3 element tree to a WordPress/Elementor page via MCP.
 *
 * Uses elementor-inject-calibrated-page (NOT batch-build-page) so that the
 * full nested V3 tree (section > column > widget) is preserved.
 *
 * @param adapter  - Configured MCP adapter pointing at the target WordPress
 * @param content  - V3 element array (V3PageData.content)
 * @param options  - Push options
 */
export async function pushToWordPress(
  adapter: McpAdapter,
  content: V3Element[],
  options: WpPushOptions,
): Promise<WpPushResult> {
  if (options.dryRun) {
    console.log(
      `[wp-push] DRY-RUN — would inject ${content.length} sections into post ${options.postId ?? '(new page)'}`,
    );
    return {
      postId: options.postId ?? 0,
      permalink: '',
      created: options.postId === undefined,
      dryRun: true,
    };
  }

  let postId: number;
  let permalink: string;
  let created: boolean;

  if (options.postId !== undefined) {
    postId = options.postId;
    created = false;
    permalink = await getPermalink(adapter, postId);
  } else {
    const page = await createPage(adapter, options.title, options.status);
    postId = page.postId;
    permalink = page.permalink;
    created = true;
  }

  await adapter.executeAbility<unknown>(options.injectAbility ?? DEFAULT_INJECT_ABILITY, {
    post_id: postId,
    _elementor_data: content,
    elementor_version: '3.0.0',
    wp_page_template: options.pageTemplate,
  });

  console.log(`[wp-push] ✓ ${created ? 'created' : 'updated'} post ${postId} → ${permalink}`);
  return { postId, permalink, created, dryRun: false };
}
