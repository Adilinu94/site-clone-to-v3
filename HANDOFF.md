# SITE-CLONE-TO-V3 — Handoff für nächste Session

> **Stand:** 2026-06-16, 19:35 — Phasen 0-9B abgeschlossen
> **Letzter verifizierter Commit auf `main`:** `6996941` (Phase 9B)
> **Tests:** 454/454 grün, TS-clean (0 errors)

## TL;DR

`site-clone-to-v3` ist eine Node-CLI, die beliebige URLs nach Elementor V3 (oder V4) klonen kann. Pipeline läuft in 5 Stages: **extract → classify → tokens → build → animations**.

## Was funktioniert (live verifiziert)

| Phase | Commit(s) | Output |
|---|---|---|
| 0 + 0.1 + 0.2 | `a8b7f3e`, `b6aa277` | CLI skeleton, WPCode + Fonts-Plugin Adapter (test4 live) |
| 1 | `eb32305` | wp-target + source-auth |
| 2A | `96584c6` | Extractor-Foundation (types, font-discovery, playwright-extractor) |
| 2B+2C+2.5 | `5aee9fc` | SPA-hydration, lazy-scroll, sections, computed-styles, @keyframes, design-tokens |
| 3 | `fb0af93` | style-classifier + widget-mapper + token-resolver + responsive-settings + section-picker |
| 4 | `ec294bd` | asset-downloader (images/fonts/svgs/favicons) + manifest-builder |
| 5A | `728d35b` | MCP-Adapter (session-handshake, retry, indirection via mcp-adapter-execute-ability) |
| 5B+5C+5D+6 | `375d2a5` | token-mapping + token-sync + V3/V4-builders + pipeline + clone CLI + visual-capture + visual-diff + acceptance |
| 7 | `a65abf1` | animation-injector + WPCode snippet planner + typecheck repair |
| **8** | **`c787ed0`** | **visual-qa + auto-fix + html-report + strictness-profiles** |

## Was noch fehlt (Phase 9+)

Laut `BAUPLAN-SITE-CLONE-TO-V3.md`:

- **Phase 9** — Wizard-Integration (interaktive CLI mit Inquirer)
- **Phase 10** — Tests (E2E gegen echte WP-Targets)
- **Phase 11** — Docs + npm-Package + Veröffentlichung

## Phase-7-Details

**Datei:** `src/builder/animation-injector.ts` (348 LoC)
**Tests:** `tests/unit/animation-injector.test.ts` (12 Tests, alle grün)

### Was Phase 7 liefert

`buildAnimationPlan({ url, animations, sections }) → AnimationPlan`:

| Snippet-Typ | Wann erzeugt? | Inhalt |
|---|---|---|
| `keyframes-bundle` (CSS) | `animations.keyframe_names.length > 0` | Alle `@keyframes` + Section-Klassen-Bindings |
| `transitions-bundle` (CSS) | `animations.transitions.length > 0` | Pro Transition eine `transition: ...`-Regel |
| `gsap-loader` (JS) | `animations.has_gsap === true` | Lädt GSAP + ScrollTrigger von CDN |
| `gsap-trigger` (JS) | `animations.has_gsap && sections.length > 0` | `gsap.from('.section-X', ...)` pro Section |
| `lenis-loader` (JS) | `animations.has_lenis === true` | Lenis smooth-scroll Setup |

**Output-Files** (unter `<outputDir>/animations/`):
- `animation-plan.json` — Full Plan mit Snippets + Targets
- `wpcode-snippets.json` — WPCode-Adapter-Manifest (für späteren `createWPCodeAdapter.createSnippet`)

### V3-Element-Linking

Jede V3-Section bekommt:
- `_css_classes: "section-<section_id>"`
- `custom_css: ".section-<id} { animation-fill-mode: both; }"`

Damit können WPCode-Snippets die cloned Sections direkt targeten, **ohne** V3-Element-Settings zu mutieren.

### Honesty-Discipline (PFLICHT — aufgedeckt + gefixt)

**Befund vor Phase 7:** `npx tsc --noEmit` warf **46 TS-Errors**, die seit `375d2a5` ("Typecheck sauber") unentdeckt waren. Hauptursache: `pipeline.ts` referenzierte Phantom-APIs (`extractedImages`, `writeSpecs`, `r.entries`, `ClassifyResult`), die in der realen Codebase nicht existieren.

**Phase 7 hat das gefixt:**
- `pipeline.ts` neu geschrieben mit echten API-Signaturen
- `SectionSpec` erweitert um optionale Flat-Fields (`widgets`, `layout`, `containerWidth`, `classes`, `selector`, `id`, `title`) für Backward-Compat mit v3-builder-Tests
- `extractor/playwright-extractor.ts` re-exportiert `ExtractionResult`/`ExtractionOptions`/`AnimationInfo`/`FontIntercept`
- `token-sync.ts` typed `idMap` explizit
- `clone.ts` `url`-Field ergänzt, `enableAssets`/`enableDesignTokens` entfernt

**Result:** 0 TS-Errors, 314 Tests grün (vorher 301; +13 für animation-injector + 1 v3-builder).

### Asset-Downloader-Status

Die `pipeline.ts` ruft `downloadImages`/`downloadFonts`/`downloadSvgs`/`downloadFavicons` NICHT mehr in den Build-Stages auf (das war in `375d2a5` broken — die Funktionen hatten komplett andere Signaturen). Die Asset-Downloader-Logik existiert weiterhin unter `src/scraper/` und kann via separatem `clone assets` Subcommand genutzt werden. **Diese Lücke sollte in einer späteren Session als "Asset-Stage-Pipeline-Integration" addressiert werden** — sie war nicht in Phase 7 Scope.

## MCP-Adapter (test4 live)

- **URL:** `https://test4.nick-webdesign.de/wp-json/mcp/novamira` (NICHT `/mcp/v1/mcp-adapter`)
- **Indirektion:** 3 Top-Level-Tools (mcp-adapter-discover-abilities, mcp-adapter-get-ability-info, mcp-adapter-execute-ability)
- **Tool-Namen mit DASH** (`mcp-adapter-execute-ability`), Inner-Ability-Namen mit **SLASH** (`novamira-adrianv2/setup-v4-foundation`)
- **executeAbility argument:** `{ ability_name: "...", parameters: {...} }`
- **Return ist doppelt verschachtelt:** `{ content: [{ text: "{ success, data: { ... } }" }] }`
- **Session-Handshake:** `initialize` Method, `Mcp-Session-Id` Header (manuell tracken, keine Cookie-Jar)

## Test-Commands (für nächste Session)

```bash
cd C:\Users\adini\Umbau\site-clone-to-v3
npx tsc --noEmit                          # Typecheck (0 errors erwartet)
npx vitest run tests/unit                 # 314 Tests

# Pipeline manuell triggern (Stages einzeln)
node dist/cli/clone.js run --url https://test4.nick-webdesign.de --output-dir ./out --stages 1,2,5
```

## Datei-Stand (verifiziert via `dir` am 2026-06-16, 18:55)

```
src/builder/
  ├── animation-injector.ts  (11.853 B) — Phase 7: WPCode snippet planner
  ├── v3-builder.ts          (modifiziert) — sectionClassName-Linking
  └── v4-builder.ts          (modifiziert) — widget-Fallback
src/analysis/
  ├── pipeline.ts            (komplett neu — Stages 1,2,3,4,5)
  ├── token-mapping.ts       (1-zeiliger Fix)
  └── token-sync.ts          (1-zeiliger Fix)
src/cli/
  └── clone.ts               (enableAssets/enableDesignTokens entfernt)
src/extractor/
  └── playwright-extractor.ts  (Re-Exports für ExtractionResult etc.)
src/classifier/
  ├── section-picker.ts      (ClassifyResult-Alias)
  └── types.ts               (SectionSpec erweitert)
src/qa/
  ├── strictness.ts          (Phase 8 — Profile + Severity-Filter)
  ├── ssim.ts                (Phase 8 — SSIM-Berechnung)
  ├── issue-detector.ts      (Phase 8 — Region-Klassifikation)
  ├── auto-fix.ts            (Phase 8 — Round-Loop + fixer-pluggable)
  └── html-report.ts         (Phase 8 — Self-contained HTML-Report)
tests/unit/
  ├── animation-injector.test.ts (7.909 B) — 12 neue Tests
  ├── v3-builder.test.ts         (modifiziert) — +1 Test
  └── qa/                        (Phase 8 — 61 neue Tests in 5 Files)
```

Alle Source-Files physisch auf der Platte verifiziert — **nicht fiktiv**.

## Phase-8-Details (NEU)

**Module:** `src/qa/{strictness,ssim,issue-detector,auto-fix,html-report}.ts`
**Tests:** `tests/unit/qa/*.test.ts` (61 Tests, alle grün)

### Was Phase 8 liefert

| Modul | Output | Zweck |
|---|---|---|
| `strictness.ts` | `STRICTNESS_PROFILES` (draft/balanced/pixel-perfect) | MinMatch%, maxRounds, Severity-Filter, Target-Check |
| `ssim.ts` | `computeSsim()`, `classifySsim()` | SSIM-Score via ssim.js, handles size-differences via cropping |
| `issue-detector.ts` | `detectIssues()` | Region-basiert: color-mismatch / font-missing / layout-shift / image-broken / size-mismatch / animation-inactive / blank-region / size-different |
| `auto-fix.ts` | `runAutoFix()`, `summarizeReport()`, `buildDefaultFixers()` | Round-Loop mit pluggable Fixern (default = placeholders), schreibt `auto-fix-report.json` |
| `html-report.ts` | `renderHtml()`, `writeHtmlReport()` | Self-contained HTML-Report (CSS inline, screenshots als Base64) |

### Strictness-Profile

| Profil | MinMatch | MaxRounds | MaxFixes/Round | Severities |
|---|---|---|---|---|
| `draft` | 70% | 1 | 3 | high |
| `balanced` | 85% | 2 | 5 | high + medium |
| `pixel-perfect` | 95% | 3 | 20 | high + medium + low |

### Auto-Fix-Loop

```
1. captureAndDiff(originalUrl, cloneUrl) → {capture, diff, ssim}
2. passesTarget(matchPercent)? → done (targetReached: true)
3. for round in 1..maxRounds:
     detectIssues(...) → issues[]
     filter: severity ∈ severitiesToFix && attempts < 2
     for issue (max maxFixesPerRound):
       fixer.apply(issue) → ok | failed
     re-captureAndDiff → measure improvement
4. write auto-fix-report.json
```

Default-Fixer sind **placeholders** (return `ok: false`). Sie dokumentieren nur, welche MCP-Ability für welchen Issue-Type nötig wäre (z.B. `color-mismatch` → `token-mapping MCP call`, `font-missing` → `Fonts-Plugin upload`, etc.).

### Honesty-Discipline (PFLICHT — aufgedeckt + gefixt)

**Befund vor Phase 8:** Die untracked QA-Module aus Phase 7-Ende hatten **10 TS-Errors**:
- `auto-fix.ts`: `currentSsim` Variable-Konflikt (number vs SsimResult, doppelte Deklaration)
- `html-report.ts`: Ungenutzter `SEVERITY_COLORS`-Import + `strictness`-Property-Fehler

**Phase 8 hat das gefixt:**
- `auto-fix.ts`: `currentSsim` → `currentSsimResult: SsimResult` (typed)
- `html-report.ts`: `SEVERITY_COLORS` mit `void` markiert, `strictness` optional mit Fallback auf `report.strictness`

**Result:** 0 TS-Errors, 375 Tests grün (vorher 314, +61 für QA-Module).

### Test-Helper

`tests/unit/qa/helpers.ts` — Synthetic-PNG-Factory (`makePng`, `writePngFile`) + Temp-Dir-Management für reproduzierbare Tests ohne echte Screenshots.

## Nächste sinnvolle Schritte (Reihenfolge)

1. **Phase 10 — Tests** (E2E gegen echte WP-Targets, 2.5 Tage)
2. **Phase 11 — Docs + npm-Publish** (2 Tage)
3. **Real-Fixer implementieren** (Phase 8 hat nur Placeholder-Fixer; die echten MCP-Calls für color/font/layout/image-fix müssen in einer späteren Phase kommen)
4. **Pipeline-Runner in `clone` integrieren** — `pipeline-runner.ts` existiert und ist state-aware, wird aber noch nicht vom `clone`-Command aufgerufen (nur dry-run/diff/incremental).

## Phase-9B-Details (NEU — Build-Modi)

### Was Phase 9B liefert

Drei neue Build-Modi aus BAUPLAN §4:

- **`--dry-run`** — Generiert V3+V4+Animation-Specs aus `extraction-result.json` **ohne MCP-Calls**. Output: `dryrun-page-v3.json`, `dryrun-page-v4.json`, `dryrun-build-summary.json`, `dryrun-animations/`.
- **`--diff-only`** — Vergleicht aktuelle Section-Hashes gegen `previous-sections.json`. Output: Added/Modified/Removed/Unchanged-Listen.
- **`--incremental`** — Bestimmt Rebuild-Plan (welche Sections ändern sich vs `previous-sections.json`). Schreibt `incremental-build.json`. Skip wenn nichts geändert.

Alle drei sind **mutually exclusive** (geprüft im CLI).

### Neue Libs (in `src/cli/`)

| Datei | LoC | Zweck |
|---|---|---|
| `dry-run.ts` | 147 | Dry-Run Orchestrator + Format |
| `diff-only.ts` | 162 | Section-Snapshot + Hash + Diff |
| `incremental.ts` | 122 | Rebuild-Plan + State-Loader |
| `pipeline-runner.ts` | 322 | State-aware runPipeline-Wrapper mit Resume + Progress + Review |
| `tests/unit/cli-fixtures.ts` | 41 | Shared makeSection + makeExtractionResult |

### CLI-Beispiele (live verifiziert)

```bash
# Dry-Run: zeigt Build-Plan ohne WP zu berühren
npx tsx src/cli/clone-v3.ts clone --no-wizard --url https://example.com --output research --dry-run

# Diff-Only: vergleicht vs vorheriger Build
npx tsx src/cli/clone-v3.ts diff --url https://example.com --output research

# Diff + neue Baseline speichern
npx tsx src/cli/clone-v3.ts diff --url https://example.com --output research --save-snapshots

# Incremental: nur geänderte Sections neu bauen
npx tsx src/cli/clone-v3.ts clone --no-wizard --url https://example.com --output research --incremental
```

### Honesty-Discipline (PFLICHT — aufgedeckt + gefixt)

- **2 unbenutzte Type-Imports** in `dry-run.ts` (`AssetManifest`, `SyncResult`) wurden vom TSC geflaggt und entfernt.
- **`pipeline-runner.ts`** war seit Sprint uncommitted (in früherer Session gebaut). Verifiziert: nutzt `runPipeline` + `state-manager` + `chalk`. Korrekt verdrahtet, typecheck-clean, läuft mit echter Pipeline.

### Tests (Phase 9B: 54 neue Tests)

| Datei | Tests | Coverage |
|---|---|---|
| `tests/unit/dry-run.test.ts` | 9 | artifact generation, empty extraction, no-tokens warning, sync-op counting, formatDryRunReport |
| `tests/unit/diff-only.test.ts` | 14 | hash generation, snapshot round-trip, computeDiff (added/removed/modified/unchanged), formatDiffReport |
| `tests/unit/incremental.test.ts` | 13 | diffForIncremental logic, loadIncrementalState, runIncremental (skip/rebuild), formatIncrementalReport |
| `tests/unit/collect-assets.test.ts` | 18 | collectAssets() mock-based mit image/SVG/favicon-Szenarien |

## Phase-9A-Details (NEU — Wizard-Integration Teil 1)

### Was Phase 9A liefert

- **`src/cli/state-manager.ts`** (177 LoC) — `CloneState` v1-Schema mit 8 Phasen (`extract`, `tokens`, `classify`, `assets`, `design-system`, `build`, `qa`, `auto-fix`), Resume via `state.json` in `research/<hostname>/`, `reconcile()` findet nächste offene Phase, Section-Approval-List mit Hashes.
- **`src/cli/prompts.ts`** (162 LoC) — Wiederverwendbare `@inquirer/prompts`-Wrapper mit Validation: `promptUrl` (URL-Pattern + URL-Parse), `promptTarget` (Select aus vorhandenen Profiles), `promptViewports` (320–3840 Range), `promptAnimation`/`promptFonts`/`promptStrictness` (Select mit Description), `promptSections` (Checkbox mit `pageSize: 15`), `promptAutoPick`/`promptResume`/`promptPostId`. Plus `summaryFor()` für die finale Plan-Zusammenfassung.
- **`src/cli/wizard.ts`** (175 LoC) — 7-Step-Wizard-Orchestrator (`runWizard`): URL → Target → Viewports → Animations → Fonts → Strictness → Sections. Resume-Detection bei vorhandener `state.json`, Dry-Run-Aware, Plan-Summary + User-Confirmation.
- **`src/cli/clone-v3.ts`** wired — `clone` Subcommand ruft `runWizard()` mit allen BAUPLAN §3 Flags (`--url`, `--target`, `--viewports`, `--animations`, `--fonts`, `--strictness`, `--auto-pick-sections`, `--sections`, `--source-auth`, `--no-wizard`, `--resume`, `--output`, `--dry-run`, `--diff-only`).

### 7 Wizard-Steps (BAUPLAN §3)

1. **URL-Eingabe** — `https://example.com` mit `URL_PATTERN`-Validation
2. **Target-Auswahl** — Select aus `~/.clone-v3/profiles.json` (oder freie Eingabe)
3. **Viewports** — `1440,768,390` default, custom comma-separated
4. **Animation-Strategy** — `none|css|gsap|auto` mit Description
5. **Font-Strategy** — `auto|system|all`
6. **Strictness** — `draft|balanced|pixel-perfect` (70/85/95% Targets)
7. **Section-Picker** — Multi-Select mit Auto-Pick-Confirm, oder Skip wenn `--auto-pick-sections`

### CLI-Beispiele (verifiziert)

```bash
# Non-interactive (CI/CD)
npx tsx src/cli/clone-v3.ts clone --no-wizard --url https://example.com --target solar-local --strictness pixel-perfect

# Interactive mit Plan-Confirmation
npx tsx src/cli/clone-v3.ts clone

# Resume
npx tsx src/cli/clone-v3.ts clone --resume research/example.com/state.json

# Custom output dir
npx tsx src/cli/clone-v3.ts clone --no-wizard --url https://example.com --output ./my-clone
```

### Honesty-Discipline (PFLICHT — aufgedeckt + gefixt)

- **TypeScript-Fehler**: `tsc` flaggte `'options' is declared but its value is never read` in `extract`-Action → mit `_options` prefix als "intentionally unused" markiert.
- **`@inquirer/prompts` v12**: `number()` returnt `number | undefined` — explizit abgefangen mit `if (result === undefined) throw new Error(...)`.

### Tests (Phase 9A: 25/25 grün)

- `tests/unit/state-manager.test.ts` — 18 Tests (createInitialState, save/load round-trip, schema-version-reject, phase-backfill, transitions, reconcile, section-approval, isPhaseDone)
- `tests/unit/prompts.test.ts` — 7 Tests (isValidUrl valid/invalid, description-maps, summaryFor format)

### Datei-Stand (2026-06-16, 19:30)

**Neu (10 files, 981 LoC):**
```
src/cli/prompts.ts              162 LoC
src/cli/state-manager.ts        177 LoC
src/cli/wizard.ts               175 LoC
src/cli/clone-v3.ts             +60 LoC (clone command rewired)
src/lib/paths.ts                +5 LoC (hostnameFromUrl)
src/cli/clone.ts                +9 LoC (stage 6 added)
src/analysis/pipeline.ts        +85 LoC (asset stage)
src/analysis/token-mapping.ts   -3 LoC (cleanup)
tests/unit/prompts.test.ts      53 LoC
tests/unit/state-manager.test.ts  176 LoC
```
