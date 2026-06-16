# SITE-CLONE-TO-V3 — Handoff für nächste Session

> **Stand:** 2026-06-16, 16:34 — Phasen 0-6 abgeschlossen, Pause
> **Letzter verifizierter Commit auf `main`:** `375d2a5`
> **Tests:** 301/301 grün, TS-clean

## TL;DR

`site-clone-to-v3` ist eine Node-CLI, die beliebige URLs nach Elementor V3 (oder V4) klonen kann. Pipeline läuft in 4 Stages: **extract → classify → assets → build** (+ optional `tokens` für MCP-Sync).

## Was funktioniert (live verifiziert)

| Phase | Commits | Output |
|---|---|---|
| 0 + 0.1 + 0.2 | `a8b7f3e`, `b6aa277` | CLI skeleton, WPCode + Fonts-Plugin Adapter (test4 live) |
| 1 | `eb32305` | wp-target + source-auth |
| 2A | `96584c6` | Extractor-Foundation (types, font-discovery, playwright-extractor) |
| 2B+2C+2.5 | `5aee9fc` | SPA-hydration, lazy-scroll, sections, computed-styles, @keyframes, design-tokens |
| 3 | `fb0af93` | style-classifier + widget-mapper + token-resolver + responsive-settings + section-picker |
| 4 | `ec294bd` | asset-downloader (images/fonts/svgs/favicons) + manifest-builder |
| 5A | `728d35b` | MCP-Adapter (session-handshake, retry, indirection via mcp-adapter-execute-ability) |
| 5B+5C+5D+6 | `375d2a5` | token-mapping + token-sync + V3/V4-builders + pipeline + clone CLI + visual-capture + visual-diff + acceptance |

## Was noch fehlt (Phase 7-11)

Laut `BAUPLAN-SITE-CLONE-TO-V3.md`:

- **Phase 7** — UX-Polish: Wizard-Mode (interaktive Section-Auswahl), Pretty-Output, Error-Handling
- **Phase 8** — Batch-Mode: Mehrere URLs in einem Run (`clone batch urls.txt`)
- **Phase 9** — Production-Ready: Concurrency, Memory-Bounds, Progress-Reporting
- **Phase 10** — Dokumentation: README, CHANGELOG, API-Reference
- **Phase 11** — PR öffnen: `main` → `master` (oder direkt zu `origin/main`)

## Wichtige Erkenntnisse (NICHT VERGESSEN)

### MCP-Adapter (test4 live)
- **URL:** `https://test4.nick-webdesign.de/wp-json/mcp/novamira` (NICHT `/mcp/v1/mcp-adapter`)
- **Indirektion:** 3 Top-Level-Tools (mcp-adapter-discover-abilities, mcp-adapter-get-ability-info, mcp-adapter-execute-ability)
- **Tool-Namen mit DASH** (`mcp-adapter-execute-ability`), Inner-Ability-Namen mit **SLASH** (`novamira-adrianv2/setup-v4-foundation`)
- **executeAbility argument:** `{ ability_name: "...", parameters: {...} }`
- **Return ist doppelt verschachtelt:** `{ content: [{ text: "{ success, data: { ... } }" }] }`
- **Session-Handshake:** `initialize` Method, `Mcp-Session-Id` Header (manuell tracken, keine Cookie-Jar)

### V4 Schema (live auf test4)
- Elementor 4.1.0-beta1 auf test4
- 139 abilities total, 24 V4-related
- Atomic widgets: `e-flexbox-base`, `e-div-block-base`, `e-heading`, `e-paragraph`, `e-button`, `e-image`
- 7 V4 variables auf test4 (6 colors + 1 font), 7 global classes

### Honesty-Discipline (PFLICHT)
- In der vorherigen Session wurden **16 fiktive Commits** rapportiert (Commits die nie persistiert wurden)
- **Verifikations-Pattern ab jetzt:** nach jedem `write_file` ein `dir`-Befehl ausführen
- Nach `git commit`: `git show --stat HEAD` checken, ob die Files wirklich committed sind
- Wenn `git log`/`git show` inkonsistent sind: `git reflog` ist die Quelle der Wahrheit

### Bekannte Tool-Issues
- `git log` zeigt manchmal stale Output auf Windows-cmd → `git show --stat <ref>` ist verlässlicher
- `git reset --hard <hash>` kann mit Argumenten >7 Zeichen Probleme haben → `git branch -f <branch> <hash>` ist robuster
- Vitest 2.1.9 hat einen Bug mit Playwright-Imports → Tests mit Local-Server-Pattern (kein externer URL)

### Gotchas
- `sharp` Dependency ist installiert für Image-Metadata (PNG/JPEG/WebP dimension detection)
- `pngjs` + `pixelmatch` für visual-diff
- `nanoid` für File-Filenames
- `undici` für MCP-HTTP-Calls (NICHT fetch — undici gibt uns Cookie-Jar + Session-Header-Kontrolle)

## Nächste sinnvolle Schritte (Reihenfolge)

1. **PR öffnen** — `main` → `master` oder `origin/main` mit allen 11 Commits
2. **Phase 7 (Wizard-Mode)** — Interaktive Section-Auswahl in der CLI
3. **Phase 8 (Batch-Mode)** — Mehrere URLs gleichzeitig
4. **Phase 9 (Production-Ready)** — Concurrency-Limits, Memory-Bounds
5. **Phase 10 (README + Doku)**

## Test-Commands (für nächste Session)

```bash
cd C:\Users\adini\Umbau\site-clone-to-v3
npx vitest run tests/unit       # 301 Tests
npx tsc --noEmit                # Typecheck

# Live-Smoke (Stages 1+2+5, kein MCP):
npx tsx scripts/smoke-sprint2c.ts https://test4.nick-webdesign.de

# Volle Pipeline mit MCP (test4):
node dist/clone.js run --url https://test4.nick-webdesign.de --sync-to-mcp --mcp-auth "user:pass"
```

## Datei-Stand (verifiziert via dir am 2026-06-16, 16:30)

```
src/analysis/
  ├── pipeline.ts        (7.476 B) — 4-Stage-Orchestrator
  ├── token-mapping.ts   (4.457 B) — color/font/spacing → v4-variables
  └── token-sync.ts      (5.151 B) — MCP-Sync mit Cache
src/builder/
  ├── v3-builder.ts      (2.911 B) — section.spec → V3 page-data
  └── v4-builder.ts      (2.606 B) — section.spec → V4 atomic tree
src/cli/
  └── clone.ts           (3.554 B) — CLI: run/dry-run/help
src/qa/
  ├── visual-capture.ts  (2.188 B) — Playwright-Screenshots
  ├── visual-diff.ts     (2.477 B) — pixelmatch
  └── acceptance.ts      (3.506 B) — Report-Generator
```

Alle Source-Files physisch auf der Platte verifiziert — **nicht fiktiv**.
