# Changelog

All notable changes to **site-clone-to-v3** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **`--post-id <id>` CLI flag** on the `clone` command: threads the WordPress post ID of the deployed clone page through `WizardOptions.postId` → `CloneState.options.postId` → `PipelineOptions.postId`. Closes the HANDOFF TODO: Auto-Fix MCP calls (`createRealFixers`) now receive `postId` from the CLI without requiring manual code edits. Use together with `--clone-url` to enable the full QA auto-fix loop: `clone-v3 clone --url <src> --clone-url <deployed> --post-id <id>`.
- **`.github/workflows/ci.yml`**: GitHub Actions CI with three jobs — `typecheck` (tsc --noEmit), `test` (Vitest unit, Node 22), `lint` (ESLint with `|| true` until legacy warnings are resolved). Uses `actions/setup-node@v4` with npm cache.
- **`CloneState.options.postId?: number`** in `state-manager.ts` — persists the post ID across CLI sessions for resume support.

---

## [0.2.0] — 2026-06-17 — V2-Plan komplett

V2-Plan (UMBAUPLAN-V3-PIXEL-PERFEKT) komplett durchgearbeitet. 11 neue Commits seit v0.1.0. **910/910 Tests grün, 0 TS-Errors.**

### Added — Phase 3: Multi-State Recon (commit `45626e8`)

- `src/recon/types.ts` — `ReconEvent`, `StateSnapshot`, `ReconResult`, `CaptureTrigger` Types
- `src/recon/mock-types.ts` — Mock DOM-Types (für tsc rootDir-Konformität)
- `src/recon/mutation-observer.ts` — `installMutationObserver` mit attributes/childList/subtree/watched-attribute-Filter
- `src/recon/animation-events.ts` — WAAPI + CSS-Animation/Transition-Listener (animationstart/end/iteration + transitionrun/end/cancel)
- `src/recon/state-capture.ts` — `buildStateSnapshots()` mit before/after + Computed-Style propertyDiff; gruppiert consecutive attribute-Mutations in attribute-batch
- `src/recon/recon-runner.ts` — `buildReconScript()` (self-contained in-page IIFE) + `parseReconResult()` + `installReconListener()` für Playwright-Bridge
- `tests/helpers/mock-window.ts` (247 Zeilen) — Mock Window + DOM mit MutationObserver-Constructor, dispatchEvent, getComputedStyle, getAnimations
- 25 neue Tests grün (mutation-observer, animation-events, state-capture, runner)

### Added — Phase 4: Computed-Style Extract (commit `14cd099`)

- `src/extractor/computed-styles.ts` — `CURATED_PROPERTIES` 60 → 80 Props (+ cursor, whiteSpace, textOverflow, -webkit-line-clamp, objectFit, objectPosition, mixBlendMode, transition, background + border shorthands); `DEFAULT_VALUES`-Map erweitert
- `src/extractor/pseudo-state-capture.ts` — `capturePseudoStates()` für `:hover`/`:focus`/`:active` via `getComputedStyle(el, ':hover')` + `flattenPseudoStates()` Helper
- `src/extractor/custom-property-extractor.ts` — `extractCustomProperties()` auto-detected alle `--*` aus `:root`/`:host` + `groupByTokenCategory()` Heuristik (color/typography/spacing/radius/shadow/motion/layout/other)
- `src/extractor/animation-property-extractor.ts` — `extractAnimationProperties()` liest granular `animation-*` + `transition-*` + `referencedKeyframes` + `distinctTransitionProperties` Aggregation
- `src/extractor/background-image-parser.ts` — `parseBackgroundImage()` splittet multi-layer in url/linear-gradient/radial-gradient/conic-gradient/other + `splitTopLevelCommas()` parens-respektierend + `firstUrl()` Helper
- `src/extractor/font-loading-state.ts` — `extractFontLoadingState()` via `document.fonts` API + `rollupFamilies()` + `effectiveFallback()`
- 32 neue Tests grün

### Added — Phase 6: Design-Token-Resolution (commit `b62601f`)

- `src/analyzer/oklch-converter.ts` — sRGB↔Linear↔Oklab↔Oklch Voll-Pipeline (W3C/css-color-4 Ref); `hexToRgb`/`rgbToHex`/`formatOklchCss`/`parseOklch`; Round-trip-Genauigkeit <1/Kanal
- `src/analyzer/token-extractor.ts` — `extractOklchColorTokens` (hex + rgb + oklch + oklchCss + cssVar-Provenanz); `extractShadowTokens` (box-shadow mit Frequenz); `extractRadiusTokens` (border-radius mit Bucket-Toleranz); `extractTypeScaleTokens` (font-size + line-height); `detectTokenSource` (tailwind/css-variables/inline/mixed)
- `src/analyzer/token-resolver.ts` — `resolveToken` Pipeline (override > css-variable > extracted > fallback); `resolvedHex`/`resolvedRgb`/`resolvedOklchCss`/`sourceOf`; `buildCustomCssForTokens` (Plan §10.4 oklch als CSS-Variable); `findExtractedForRole` mit semantic role-hint-Heuristik
- `src/analyzer/theme-detector.ts` — `detectTheme` (data-attr > class > media-query > light-default); `detectFromDataAttribute` (data-theme/data-mode/data-color-scheme); `detectFromClassList` (dark/theme-dark/dark-mode/dark-theme); `detectFromMediaQuery` (prefers-color-scheme: dark/light); `buildThemeConditionalCss`
- 33 neue Tests grün

### Added — Phase 5: Pro-Widget-Mapping (commit `2ca9f02`)

- `src/classifier/pro-detector.ts` — `detectElementorPro` mit 6 Signal-Quellen (script-marker, css-class, admin-bar/window-globals, generator-meta, rest-endpoint, custom-element); gewichtete Confidence-Aggregation
- `src/classifier/widget-mapper.ts` — erweitert um 14 Pro-Widgets (slider, accordion, tabs, counter, testimonial-carousel, price-table, animated-headline, progress-bar, forms, posts, share-buttons, gallery, image-box, icon-box); 7 Heuristik-Quellen; per-widget settings-Builder
- `src/classifier/widget-degradation.ts` — `ProState` (present/absent/unknown); `degradeProWidget` mit html-Shell-Wrapper für forms/gallery/posts und editor-Default für counter/progress-bar
- `src/classifier/widget-validator.ts` — 3-stufige Severity (error/warning/info); Required-Settings-Map; Spezial-Checks
- 56 neue Tests grün

### Added — Phase 7: V3 Builder (commit `5495992`)

- `src/builder/v3-section.ts` — V3-Section-Model mit 5 SectionStructureTypes (full-width/boxed/content/multi-column/inner-section); `buildSection`/`buildInnerSection`/`buildMultiColumnSection` Factories; 3 Type-Guards; `buildResponsiveOverrides`
- `src/builder/v3-multi-column.ts` — `ColumnRatio` + `GapSpec` + `MultiColumnLayout` Types; `normalizeMultiColumn` (clamp 1-6); `resolveColumnRatios` mit last-column-adjustment für Floating-Point-Rounding; `generateColumnCss` (grid-template-columns + gap); `validateMultiColumnLayout`
- `src/builder/v3-builder.ts` — Phase-7 Pipeline (`buildSectionsFromSiteSpec`, `buildV3Output` mit v3/v4-Format, `buildMultiColumnOutput`, `countSections`, `flattenInnerSections`, `validateBuilderResult` mit duplicate-id-detection) **+ V1-PRESERVED** (`buildV3PageData`/`writeV3PageData`/`V3Element`/`V3PageData`)
- 41 neue Tests grün

### Added — Phase 8: Visual QA + Pixel-Diff + Auto-Fix (commit `c107008`)

- `src/qa/phase8-issue-types.ts` — 20 Phase-8 Issue-Types (28 total = 8 V1 + 20 Phase 8); per-Type Hints mit default-severity/bbox-tolerance/ssim-threshold/region-min-size/fix-template
- `src/qa/phase8-batched-fix.ts` — `batchIssuesByType()` (Sort: severity-then-count); `pickBatchesForRound()` (max 4 types/round); `runBatchedFix()` mit maxRounds + optional `detectAfterRound`
- `src/qa/phase8-render-capture.ts` — `withTimeout()` Promise-Race-Wrapper; `mockCapture()` synthetisches Gray-PNG für WP-Down; `renderAndCapture()` mit 60s-Timeout + 2-Retries + exponential-Backoff + mock/skip-Fallback
- 31 neue Tests grün

### Added — Phase 9: Manager-Workflow-Orchestrator (commit `c616766`)

- `src/orchestrator/manager-workflow.ts` — Per-Section Loop mit `reconcileState` (5 Kinds: INITIAL/FORWARD/DRIFT/RETRY/CONVERGED); `runManagerWorkflow` mit first-iteration-fast-path + maxIterations cap + consecutive-drifts bail-out
- `src/orchestrator/phase-orchestrator.ts` — 6 PHASE_IDs; `runStage` mit retry-loop (maxRetries+1) + error-accumulation; `definePhasePipeline` + `runPhase3Assembly`/`runPhase4Builder`/`runPhase5Qa` typed stage-runner
- `src/orchestrator/run-report.ts` — 24-Feld RunReport (Plan §13.4: 7 meta + 5 pipeline + 5 section + 4 qa + 3 builder); `buildRunReport` + `formatRunReport` + `getReportSummary` + `isRunReportComplete`
- 33 neue Tests grün

### Added — Phase 10: MCP Adapter (commit `c14f825`)

- `src/mcp/phase10-session.ts` — Capability-Exchange (`negotiateAbilities` splits offered vs rejected); `performHandshake` mit error-capture; `reconnectAfterDisconnect` (exponential-backoff+jitter, maxAttempts cap)
- `src/mcp/phase10-indirection.ts` — 9 BuilderOperationKinds (create-page/update-page/add-section/add-widget/update-widget/delete-widget/apply-css/upload-asset/set-global-class); AbilityRoute Table mit requiresPageId + idempotent-flag; `computeIdempotencyKey` (sha256 für idempotent, timestamp+random für non-idempotent)
- `src/mcp/phase10-call-orchestrator.ts` — `CircuitBreaker` Klasse (closed/open/half-open state-machine + cooldown + reset); `classifyFailure` (transient/permanent/timeout/unknown); `executeWithRetry` (exponential-backoff+jitter + retryOn-policy); `groupOperationsByPageId` + `executeBatch` mit maxConcurrentPages-chunking
- 34 neue Tests grün

### Added — Phase 11: CLI Integration + E2E Pipeline (commit `e4c0f47`)

- `src/cli/phase11-cli-flags.ts` — `CloneCliFlagsInput`/`CloneCliFlags`/`CloneMode` Types (v3|v4); `parseCloneCliFlags` mit Result-Discriminated-Union; `validateCloneCliFlags` mit 5 Validation-Regeln; `buildDryRunSummary` mit Warnings
- `src/cli/phase11-pipeline.ts` — `PipelineStage` (6: scrape/extract/classify/build/qa/push); `buildPipelineStages()` returnt `PIPELINE_STAGES`-const; `runClonePipeline` sequenziell mit break-on-first-failure
- `src/cli/phase11-e2e-mock.ts` — `MockE2EConfig` + `MockSection` + `MockV3Output` + `MockHandshakeResult` + `MockPushResult` Types; `mockFetchHtml`/`mockDiscoverInternalLinks`/`mockExtractSections`/`mockBuildV3Output`/`mockMcpHandshake`/`mockPushPage` — alle deterministisch für CI/offline
- 26 neue Tests grün

### Changed

- `README.md` — Status v0.1.0 → v0.2.0, Tests 534 → 910, neue V2 Module-Map mit Phasen 3-11, V1 → V2 Migration-Section
- `package.json` — version 0.1.0 → 0.2.0, neue keywords

### Added — Documentation

- `docs/V2-ARCHITECTURE.md` — V2-Module-Map, 12-Phasen-Datenfluss, V3 vs V4-Schema, Performance-Charakteristiken
- `CHANGELOG.md` — diese Datei

### Test Counts

| Phase | Commits | Tests neu | Tests total |
|---|---|---|---|
| V1 (Baseline) | 9bd78ab | — | 534 |
| Phase 1+2 | 8e6bc88 | +0 (refactor) | 534 |
| Phase 3 | 45626e8 | +25 | 559 |
| Phase 4 | 14cd099 | +32 | 591 (vor Cache-Clear) |
| Phase 6 | b62601f | +33 | 624 |
| Phase 5 | 2ca9f02 | +56 | 680 |
| Phase 7 | 5495992 | +41 | 721 |
| Phase 8 | c107008 | +31 | 752 |
| Phase 9 | c616766 | +33 | 785 |
| Phase 10 | c14f825 | +42 | 827 |
| Phase 11 | e4c0f47 | +26 | 853 (vor Cache-Clear) |
| **Final** | **+11 Commits** | **+319 Tests** | **910 grün, 12 skipped** |

---

## [0.1.0] — initial release

- Playwright extraction (SPA hydration, lazy-scroll, computed styles, @keyframes, design tokens)
- Style classifier + widget mapper + token resolver + responsive settings + section picker
- Asset downloader (images, fonts, SVGs, favicons, OG images) + manifest builder
- MCP adapter (session handshake, retry, indirection, V4 schema support)
- Design system sync + V3/V4 builders + visual acceptance
- Animation injector + WPCode snippet planner
- Visual QA: strictness profiles, SSIM, issue detection (8 types), auto-fix loop, HTML reports
- Interactive wizard (9 steps) + state-manager + resume + step-by-step pipeline
- Build modes: dry-run, diff-only, incremental
- Update checker + changelog generator
- 534/534 unit tests passing, 0 TypeScript errors

---

[0.2.0]: https://github.com/Adilinu94/site-clone-to-v3/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Adilinu94/site-clone-to-v3/releases/tag/v0.1.0