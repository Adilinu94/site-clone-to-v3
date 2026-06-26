# Conventions — site-clone-to-v3

Naming rules, CLI flag conventions, and architectural decisions.
Read before adding new commands, flags, or modules.

---

## CLI flag conventions

### Flag naming
| Pattern | Rule | Example |
|---|---|---|
| `--kebab-case` | All flags use kebab-case | `--dry-run`, `--post-id` |
| `--no-<flag>` | Negation via Commander.js | `--no-wizard`, `--no-color` |
| Short aliases | Only for the 4 most-used flags | `-u`, `-t`, `-a`, `-f` |
| Boolean flags | Default false, presence = true | `--dry-run`, `--qa-auto-fix` |
| Value flags | Always require an argument | `--target solar-local`, `--strictness balanced` |

### Canonical flag names (never add aliases for these)
| Flag | Type | Description |
|---|---|---|
| `--url <url>` | string | Source URL to clone |
| `--target <name>` | string | WP target profile name |
| `--post-id <id>` | number | WordPress post ID |
| `--dry-run` | boolean | No MCP writes, plan only |
| `--resume <file>` | string | Path to state.json for resume |
| `--output <dir>` | string | Research output directory |
| `--strictness <level>` | `draft\|balanced\|pixel-perfect` | QA threshold |
| `--extractor <mode>` | `local\|browserbase` | Browser backend |
| `--mcp-url <url>` | string | MCP endpoint URL |
| `--mcp-auth <user:pass>` | string | Basic auth for MCP |

### Adding new flags
1. Add to `src/cli/clone-v3.ts` on the relevant sub-command.
2. Pass through `WizardOptions` or `PipelineOptions` — never read `process.argv` directly in non-CLI code.
3. Document in `EXAMPLES.md` if user-facing.
4. Add a test in `tests/unit/phase11-cli.test.ts` for the new option.

---

## Module naming

### Source files
- One concept per file. No `utils.ts`, no `helpers.ts`.
- Name files after what they export: `color-extractor.ts` exports `extractColorFrequency`.
- Barrel exports (`index.ts`) only for domain boundaries (`src/qa/index.ts`, `src/validator/index.ts`).

### Class/function naming
- Functions: camelCase verbs (`buildDesignTokens`, `runV3Guards`).
- Types/interfaces: PascalCase nouns (`DesignTokens`, `GuardReport`).
- Constants: SCREAMING_SNAKE for module-level config (`DEFAULT_STATE_PATH`, `PIPELINE_PHASES`).

---

## TypeScript rules

### Strict typing
- `noImplicitAny: true` — every parameter needs a type.
- `strictNullChecks: true` — handle `null`/`undefined` explicitly.
- Avoid `any`. Use `unknown` + type narrowing instead.
- Avoid `as Type` casts unless unavoidable (explain why with a comment).

### Imports
- Always use `.js` extension in imports (Node16 ESM resolution):
  ```typescript
  import { foo } from './foo.js'; // ✓
  import { foo } from './foo';    // ✗
  ```
- Type-only imports use `import type`:
  ```typescript
  import type { DesignTokens } from '../analyzer/design-token-extractor.js';
  ```

### No circular dependencies
- `src/cli/` may import from `src/*`.
- `src/orchestrator/` may import from `src/builder/`, `src/qa/`, `src/mcp/`.
- `src/qa/` and `src/validator/` must NOT import from `src/orchestrator/` or `src/cli/`.
- `src/lib/` is the bottom layer — no imports from upper layers.

---

## Testing rules

### File location
```
tests/unit/<module-name>.test.ts      # Unit tests (no I/O, no network)
tests/integration/<module>.live.test.ts  # Live tests (require INTEGRATION_LIVE=1)
tests/e2e/cli-e2e.test.ts            # Full CLI end-to-end
```

### What to test
- Every exported public function needs at least one test.
- Happy path + at least 2 edge cases (empty input, null input).
- Guard/validator modules: one test per guard + score engine tests.

### What not to mock
- `fs` operations in unit tests: use `tmp` directories instead of mocking.
- Time: use real `Date.now()` in tests, never fake timers unless testing timing logic.

### Naming
```typescript
describe('functionName', () => {
  it('does X when Y', () => { ... });
  it('returns null when input is empty', () => { ... });
  it('throws on invalid argument', () => { ... });
});
```

---

## MCP / WordPress conventions

### Always use `elementor-inject-calibrated-page`
Never use `batch-build-page` for V3 nested trees — it silently drops nested elements.

```typescript
// ✓ Correct
adapter.executeAbility('novamira-adrianv2/elementor-inject-calibrated-page', {
  post_id: postId,
  _elementor_data: content,  // full V3Element[] array
  elementor_version: '3.0.0',
});

// ✗ Wrong — drops inner elements
adapter.executeAbility('novamira-adrianv2/batch-build-page', { ... });
```

### Target profiles
Target credentials are read from `src/lib/wp-target.ts` (env vars or future `~/.config/clone-v3/targets.json`). Never hardcode URLs or credentials in source files.

---

## Guard / Validation thresholds

| System | Threshold | Configurable? |
|---|---|---|
| V3 Guards (`runV3Guards`) | 85/100 | Yes (2nd arg to `runV3Guards`) |
| V4 Guards (`runV4Guards`) | 85/100 | Yes |
| Cross-Validator | No threshold (drift counter) | N/A |
| QA strictness: draft | 70% pixel similarity | Per-target |
| QA strictness: balanced | 85% pixel similarity | Per-target |
| QA strictness: pixel-perfect | 95% pixel similarity | Per-target |

Thresholds must not be lowered in CI. Lower them locally only for debugging.

---

## Git commit format

```
type(scope): short description

- bullet point detail
- another detail

Closes #123
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
Scope: module name (`validator`, `qa`, `builder`, `cli`, `orchestrator`).
