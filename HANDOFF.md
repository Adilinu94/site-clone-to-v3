# SITE-CLONE-TO-V3 — Handoff für nächste Session

> **Stand:** 2026-07-01 — Doku-Realitätscheck (UMBAUPLAN-KOMBINIERT Phase 0)
> **Tests:** 1121/1121 grün (78 Dateien), TS sauber — live verifiziert
> **Guards:** G1–G12 in `src/validator/json-guard.ts` (nicht 14)
> **Asset-Stage-Pipeline-Integration:** geschlossen — `pipeline.ts` ruft `downloadImages/Fonts/Svgs/Favicons` bereits auf (siehe korrigierte Notiz unter "Asset-Downloader-Status" unten)
> **`--post-id`:** vollständig durch `PipelineOptions` durchgereicht (live in `src/analysis/pipeline.ts`, u.a. Auto-Fix-Loop + Push-Result) — der TODO weiter unten in diesem Dokument ist überholt
> **Aktueller Plan:** `UMBAUPLAN-KOMBINIERT-2026-07.md` (ersetzt alle älteren `BAUPLAN`/Umbauplan-Referenzen in diesem Dokument) — größter offener Punkt für dieses Repo: `--upgrade-to-v4` in `clone-v3.ts` + `pipeline.ts` verdrahten (Ability existiert bereits im Plugin, wird aber nirgends aufgerufen)
>
> Der Rest dieses Dokuments unterhalb ist die **Entwicklungshistorie** (Phase 7–9B) und weitgehend akkurat als Zeitpunkt-Aufzeichnung — nur die zusammenfassenden Listen "Was noch fehlt" und "Nächste sinnvolle Schritte" waren nicht mehr aktuell und wurden unten korrigiert.

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

## Was noch fehlt (Stand 2026-07-01)

Phase 9 (Wizard-Integration, siehe Phase-9A/9B-Details weiter unten) ist entgegen der ursprünglichen Fassung dieser Liste **fertig**. Echte offene Punkte laut `UMBAUPLAN-KOMBINIERT-2026-07.md`:

- **`--upgrade-to-v4`-Flag** in `clone-v3.ts` + MCP-Call an `novamira-adrianv2/upgrade-page-to-v4` in `pipeline.ts` (Ability existiert fertig im Plugin, ist aber nirgends angeschlossen — größter Quick-Win)
- ~~`--heal`-CLI-Flag~~ **erledigt (2026-07-01):** komplett durch `clone-v3.ts → wizard.ts → state-manager.ts → pipeline-runner.ts → pipeline.ts` verdrahtet, exakt analog zu `--qa-auto-fix`. `tsc --noEmit` clean, 1121/1121 Tests grün, lint clean.
- **`v4PageHeight: 0`-Befund** in `diff-reports/latest` (run #8, 29.06.) — Ursache weiterhin nicht live verifiziert (kein Domain-Zugriff auf test4 von hier aus). **Update 2026-07-01:** Diagnose-Lücke in `scripts/visual-diff.mjs` behoben — die drei früh-`continue`-Pfade (HTTP-Status, Health-Check, leerer Screenshot) setzten `lastError` nie, weshalb die finale "FAILED"-Logzeile immer `undefined` zeigte statt des echten Grunds. Jetzt wird ein `lastReason`-String gesetzt und in der finalen Logzeile ausgegeben. Reine Logging-Änderung, Rückgabewert-Form unverändert, nur syntaxgeprüft (`node --check`) — kein Testharness für dieses Skript vorhanden. Nächster Live-Lauf zeigt den echten Grund in den GH-Actions-Logs statt `undefined`.
- Phase 10/11 aus dem alten `BAUPLAN` (E2E gegen echte WP-Targets, npm-Publish) — nicht im aktuellen Umbauplan priorisiert, weiterhin grundsätzlich offen

## Phase-8-Real-Fixer-Lückenschluss (2026-06-18)

**Phase 8 hatte Placeholder-Fixer** (`buildDefaultFixers()`) — alle gaben `ok: false` zurück mit Text wie "requires live MCP context". Diese sind jetzt durch echte MCP-Aufrufe ersetzt.

**Neue Dateien:**
- `src/qa/real-fixers.ts` (~270 LoC) — `createRealFixers({ mcp, postId, resolver, dryRun? })` Factory mit 6 echten Fixern:
  | Issue-Type | MCP-Action | Element-Setting |
  |---|---|---|
  | `color-mismatch` | `novamira/elementor-edit-element` | `_background_color` |
  | `font-missing` | `novamira/execute-php` (register Google via theme_mod) | `ogf_load_fonts` |
  | `layout-shift` | `novamira/elementor-edit-element` | `padding`/`margin` reset |
  | `image-broken` | `novamira/upload_asset` + `novamira/elementor-edit-element` | `image.url` |
  | `size-mismatch` | `novamira/elementor-edit-element` | `width`/`height` aus Region |
  | `animation-inactive` | `novamira/execute-php` (wpcode-Snippet mit `@keyframes`) | `_wpcode_code` meta |

- `src/qa/pixel-element-resolver.ts` (~120 LoC) — `PixelElementResolver` mappt Pixel-Region (y/x) → `sectionId` + `widgetId` aus `page-v3.json`:
  - Section-Y-Spans werden aus `_min_height`/`height`-Settings berechnet (Default 600px).
  - Bei fehlender Section oder leerem PageData: `resolve()` gibt `null` → Fixer markiert Issue als "no element mapped" (statt Stub-ok:false).
  - `colorIdLookup(hex)` Hook für späteres Elementor-V3-Global-Color-Mapping.

**Pipeline-Integration (`src/analysis/pipeline.ts` Stage 7):**
- Neue Options: `qaAutoFix?: boolean`, `postId?: number`.
- Wenn `qaAutoFix=true` + `cloneUrl` + `postId` + `mcpUrl`: nach Acceptance-Test läuft `runAutoFix({ strictness: 'pixel-perfect', fixers: createRealFixers(...) })`.
- Output: `<outputDir>/qa/auto-fix/auto-fix-report.json` mit `totalRounds`, `finalMatchPercent`, `issuesFixed`, `targetReached`.
- Bei DRY-RUN: alle MCP-Calls werden nur beschrieben (`[DRY-RUN] Would call ...`), kein echter Side-Effect.

**Honesty-Discipline:**
- Wenn `resolver.resolve()` `null` zurückgibt (z.B. weil `page-v3.json` keine Section für die y-Region hat), wird der Fix als `skipped` markiert mit Diagnose statt als "erfolgreich" geloggt.
- Wenn MCP wirft (z.B. Auth-Fehler), wird `ok: false` mit Fehlermeldung zurückgegeben.
- DRY-RUN-Modus zeigt den vollen MCP-Call-Descriptor im Log für Reproduzierbarkeit.

**Tests:** 18 neue Tests in `tests/unit/qa/real-fixers.test.ts` (13) und `tests/unit/qa/pixel-element-resolver.test.ts` (5).
- 928/928 Tests grün, TS-clean (0 errors).
- dist/qa/real-fixers.js + dist/qa/pixel-element-resolver.js gebaut.

**Live-E2E-Voraussetzung (für echten Auto-Fix-Lauf):**
- Voraussetzungen: `cloneUrl` (deployed Seite), `postId` (Elementor-Seiten-ID), `mcpUrl`/`mcpAuth`, `page-v3.json` im Output-Dir.
- CLI-Aufruf: `node dist/cli/clone-v3.js clone --url <source> --target <profile> --no-wizard --clone-url <deployed> --output ./research/<slug>`
- **Update 2026-07-01:** `--post-id` ist inzwischen vollständig durch `PipelineOptions` durchgereicht (live in `pipeline.ts` verifiziert) — der ursprüngliche TODO hier ist erledigt.

**Ehrliche Erkenntnis (2026-06-18 Live-E2E gegen test4):**
- V2-Pipeline läuft alle 7 Stages durch mit `node dist/cli/clone-v3.js clone --url https://test4.nick-webdesign.de --no-wizard --dry-run --auto-pick-sections --output ./tmp`.
- 910 Tests grün vor Fixer-Implementierung (jetzt 928).
- Befund: test4 ist Test-Stub-Page mit nur 1 `<main>`-Section, 0 `<section>`-Tags, 1 Bild, 1 Button — V2-Section-Detection funktioniert korrekt, test4 hat einfach keine Multi-Section-DOM. Für echten Pixel-Perfekt-Beweis ist envyo.de (9 Sections, 11 Widgets) der bessere E2E-Target.

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

**Update 2026-07-01: geschlossen.** `pipeline.ts` ruft `downloadImages`/`downloadFonts`/`downloadSvgs`/`downloadFavicons` inzwischen wieder auf — die Asset-Stage-Pipeline-Integration, die hier als offene Lücke markiert war, ist live verifiziert vorhanden. (Ursprüngliche Notiz vom 2026-06-18 unten als Kontext belassen.)

Ursprüngliche Notiz (2026-06-18): Die `pipeline.ts` rief `downloadImages`/`downloadFonts`/`downloadSvgs`/`downloadFavicons` NICHT mehr in den Build-Stages auf (das war in `375d2a5` broken — die Funktionen hatten komplett andere Signaturen). Die Asset-Downloader-Logik existierte weiterhin unter `src/scraper/` und konnte via separatem `clone assets` Subcommand genutzt werden.

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

**Update 2026-07-01:** Diese Liste war veraltet — Punkt 3 (Real-Fixer) ist seit der Phase-8-Lückenschluss-Session (siehe unten) erledigt. Aktuelle Priorität kommt aus `UMBAUPLAN-KOMBINIERT-2026-07.md`:

1. **`--upgrade-to-v4` verdrahten** (P0, Quick-Win, ~1–2 Std.) — siehe "Was noch fehlt" oben — **weiterhin offen, war nicht Teil dieser Session (Scope: nur Phase 3 aus UMBAUPLAN)**
2. ~~`--heal`-Flag anschließen~~ **erledigt (2026-07-01)**
3. **`v4PageHeight: 0`-Ursache klären** — Diagnose-Logging verbessert (siehe oben), eigentliche Ursache braucht weiterhin einen Live-Lauf gegen test4 (z.B. via `gh workflow run visual-diff.yml` oder manuell im Actions-Tab)
4. **Pipeline-Runner in `clone` integrieren** — **korrigiert (2026-07-01): war schon erledigt, alte Notiz war falsch.** `clone-v3.ts` ruft `runWizardPipeline(result)` bereits auf (verifiziert per Code-Lesen) — dieser Punkt war nur nie neu geprüft worden.

Alte Punkte 1+2 (Phase 10/11 aus `BAUPLAN-SITE-CLONE-TO-V3.md`) sind im aktuellen Umbauplan nicht priorisiert.

## Live-E2E-Befund 2026-06-18 (gegen test4.nick-webdesign.de)

**Methode:** `node dist/cli/clone-v3.js clone --no-wizard --url https://test4.nick-webdesign.de --output ./research --auto-pick-sections --strictness draft`
**Build:** `npx tsc` (0 errors), 56 Files in `dist/`
**Result:** Pipeline läuft alle 7 Stages durch (extract, classify, assets, build, animations). Real-Output: 36KB extraction-result.json, 3 Screenshots (1440/768/390), V3+V4 page-data, animations.json, fonts/SF Pro/Roboto erkannt, 30+ CSS-Vars extrahiert.

**Befund (ehrlich, mit git-verifizierten Daten):**
- ✅ **Stage 1 (Extract):** Playwright funktioniert, Screenshots werden gemacht, computed-styles, animations, fonts, css-vars extrahiert.
- ✅ **Stage 3 (Assets):** Asset-Downloader vorhanden, Manifest wird geschrieben.
- ✅ **Stage 4 (Tokens):** Design-Tokens + CSS-Vars im Output vorhanden.
- ⚠️ **Stage 2 (Classify):** Section-Picker findet nur **1 Section** (`#content` / `<main>`, 35→2847px). **V2-Phase-2 (Generic-Section-Detection mit 8 Heuristiken, Section-Merger-Threshold) ist nicht in `pipeline.ts` verdrahtet.** Die Module `src/extractor/section-detector.ts`, `extract-pipeline.ts`, `spec-builder.ts`, `spec-schema.ts` existieren lokal (Commit `8e6bc88`), werden aber von `pipeline.ts` Stage 1 nicht aufgerufen — `extractFromUrl()` wird direkt benutzt.
- ⚠️ **Stage 5 (Build):** V3-Output hat 1 Section, 1 Column, **0 Widgets**. Section-Picker liefert keine Widgets. Builder hat nichts zum Bauen. V2-Phase-7 (V3-Multi-Column-Builder) ist im Code da, kriegt aber keine Multi-Section-Specs.
- ❌ **Stage 6 (Tokens-Sync):** `pending` weil kein target gesetzt — das ist OK für dry-validation.
- ❌ **Stage 7 (QA):** `skipped` weil kein `cloneUrl` — OK.

**Honesty-Discipline:** Vor dem Rapportieren geprüft per `dir`, `findstr`, `git show`. Befund reproduzierbar.

**tsx-Loader-Bug (BAUPLAN §3.1 Punkt 1):** `npx tsx src/cli/clone-v3.ts` wirft `page.evaluate: ReferenceError: __name is not defined`. tsc-built binary (`node dist/cli/clone-v3.js`) läuft sauber. **Default-Strategie für Live-Runs: tsc-built binary.**

**Konkrete Fix-Reihenfolge für nächste Session:**
1. `pipeline.ts` Stage 1 von `extractFromUrl()` auf `runExtractPipeline()` umstellen (mit Fallback). Damit werden robots.txt, rate-limit, section-merger, spec.json automatisch aktiv.
2. Section-Picker-Erweiterung damit er die V2-`spec.json`-Sections aus `extract-pipeline.ts` nutzt (statt nur `<main>`).
3. Widget-Detection im Section-Picker aktivieren, damit Multi-Column-Builder was zu bauen hat.
4. Real-Fixer für color/font/image-mismatch implementieren (statt nur Placeholders).
5. GitHub-Actions CI/CD-Workflow (siehe UMBAUPLAN §15.5).

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
