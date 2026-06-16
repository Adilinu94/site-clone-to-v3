# SITE-CLONE-TO-V3 — Handoff für nächste Session

> **Stand:** 2026-06-16, 18:52 — Phasen 0-7 abgeschlossen
> **Letzter verifizierter Commit auf `main`:** `a65abf1` (Phase 7)
> **Tests:** 314/314 grün, TS-clean (0 errors)

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
| **7** | **`a65abf1`** | **animation-injector + WPCode snippet planner + typecheck repair** |

## Was noch fehlt (Phase 8+)

Laut `BAUPLAN-SITE-CLONE-TO-V3.md`:

- **Phase 8** — V3 Visual-QA + Auto-Fix (Pixel-Diff + SSIM + Strictness-Profile)
- **Phase 9** — Wizard-Integration (interaktive CLI)
- **Phase 10** — Tests (E2E gegen echte WP-Targets)
- **Phase 11** — Docs + npm-Package + Veröffentlichung

## Phase-7-Details (NEU)

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
tests/unit/
  ├── animation-injector.test.ts (7.909 B) — 12 neue Tests
  └── v3-builder.test.ts         (modifiziert) — +1 Test
```

Alle Source-Files physisch auf der Platte verifiziert — **nicht fiktiv**.

## Nächste sinnvolle Schritte (Reihenfolge)

1. **Phase 8 — V3 Visual-QA + Auto-Fix** (Pixel-Diff + SSIM + Strictness-Profile, 3 Tage)
2. **Phase 9 — Wizard-Integration** (interaktive CLI mit Inquirer, 2 Tage)
3. **Asset-Stage-Pipeline-Integration** (Lücke aus 375d2a5 fixen, 0.5 Tage)
4. **Phase 10 — Tests** (E2E gegen echte WP-Targets, 2.5 Tage)
5. **Phase 11 — Docs + npm-Publish** (2 Tage)
