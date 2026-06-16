# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-16

### Features
- **phase 11**: docs finalization + npm package prep — README, ARCHITECTURE.md, package.json
- **pipeline**: cloneUrl wired through wizard→pipeline for QA stage + `--clone-url` CLI flag
- **pipeline**: qa stage (Stage 7) integrated — runs runAcceptance() via Playwright capture + pixelmatch + SSIM
- **pipeline**: filter classification to approved sections only (`04ed6ff`)
- **pipeline**: step-by-step interactive mode with preloaded state (`934d5d8`)
- **phase 9B**: dry-run + diff-only + incremental build modes (`6996941`)
- **extractor**: phase 4 asset discovery (images/SVGs/favicons from live DOM) (`801ba14`)
- **phase 9A**: interactive wizard + state-manager + resume (`4b556e6`)
- **phase 8**: visual-qa + auto-fix + html-report + strictness profiles (`c787ed0`)
- **phase 7**: animation-injector + WPCode snippet planner + typecheck fixes (`a65abf1`)
- **phase 5B-6**: design-system-sync + V3/V4 builders + visual-acceptance (`375d2a5`)
- **phase 5A**: MCP-Adapter with session-handshake, retry, indirection (V4 schema) (`728d35b`)
- **phase 4**: asset-downloader (images, fonts, svgs, favicons/og) + manifest-builder (`ec294bd`)
- **phase 3**: style-classifier + widget-mapper + token-resolver + responsive-settings + section-picker (`fb0af93`)
- **phase 2B + 2C + 2.5**: SPA-hydration, lazy-scroll, sections, computed-styles, @keyframes, design-tokens (`5aee9fc`)
- **phase 2A**: extractor foundation — types, font-discovery, playwright-extractor (`96584c6`)
- **phase 1**: wp-target + source-auth modules (`eb32305`)
- phase 0.1 + 0.2 — live-verified WPCode + Fonts-Plugin adapters (`b6aa277`)

### Bug Fixes
- **state**: rename 'auto-fix' phase to 'animations' (correct PhaseName) (`8373d0b`)
- **ssim**: fix duplicate `classifySsim()` ≥95 return bug (second branch unreachable)
- **clone-v3**: update review*() calls to new 2-param signature (`5152743`)
- **pipeline-runner**: remove unused imports + prefix unused params (`0169c26`)
- **pipeline+extractor**: asset stage parallel + Array.from NodeList (`97c13bc`)

### Refactors
- use centralized v3Id() in v3-builder + v4-builder (`02eec84`)

### Documentation
- HANDOFF.md update - Phase 9B done, 454 tests, 0 TS errors (`261c34b`)
- HANDOFF.md update - Phase 9A done, 400 tests, 0 TS errors (`2532952`)
- HANDOFF.md update - Phase 8 done, 375 tests, 0 TS errors (`e4c8297`)
- HANDOFF.md update - Phase 7 done, 314 tests, 0 TS errors (`9597abe`)
- HANDOFF.md for next session (phase 7+ handoff) (`d1e37f9`)

### Tests
- **phase 10**: E2E tests (8 CLI-E2E + 5 live-E2E against test4) + 13 pipeline-runner unit tests
- **phase 10**: coverage backlog + snapshot regression (`461a3b7`)
- **phase 9**: 54 new tests (dry-run, diff-only, incremental + collect-assets)

### Chores
- **extractor**: re-export DiscoveredImage/Svg/Favicon types (`b4c24df`)
- phase 0 — toolchain, CLI skeleton, core libs (`a8b7f3e`)
- initial commit - project scaffolding (alpha v0.0.0) (`50b0199`)
