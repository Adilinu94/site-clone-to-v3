import { describe, it, expect } from "vitest";
import {
  parseCloneCliFlags,
  buildDryRunSummary,
  validateCloneCliFlags,
  type CloneCliFlagsInput,
} from "../../src/cli/phase11-cli-flags.js";
import {
  runClonePipeline,
  buildPipelineStages,
  pipelineStageLabel,
  describePipelineStage,
  type PipelineRunOptions,
} from "../../src/cli/phase11-pipeline.js";
import {
  mockFetchHtml,
  mockDiscoverInternalLinks,
  mockExtractSections,
  mockBuildV3Output,
  mockMcpHandshake,
  mockPushPage,
  type MockE2EConfig,
} from "../../src/cli/phase11-e2e-mock.js";

const validFlags: CloneCliFlagsInput = {
  url: "https://example.com",
  target: "test4",
  output: "./out",
  mode: "v3",
};

describe("phase11-cli-flags", () => {
  it("parseCloneCliFlags accepts valid v3 flags", () => {
    const result = parseCloneCliFlags(validFlags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe("v3");
      expect(result.value.url).toBe("https://example.com");
      expect(result.value.target).toBe("test4");
    }
  });

  it("parseCloneCliFlags accepts valid v4 flags", () => {
    const result = parseCloneCliFlags({ ...validFlags, mode: "v4" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mode).toBe("v4");
  });

  it("parseCloneCliFlags rejects empty url", () => {
    const result = parseCloneCliFlags({ ...validFlags, url: "" });
    expect(result.ok).toBe(false);
  });

  it("parseCloneCliFlags rejects unknown mode", () => {
    const result = parseCloneCliFlags({ ...validFlags, mode: "v5" });
    expect(result.ok).toBe(false);
  });

  it("parseCloneCliFlags rejects invalid target name", () => {
    const result = parseCloneCliFlags({ ...validFlags, target: "with space" });
    expect(result.ok).toBe(false);
  });

  it("parseCloneCliFlags rejects non-https url", () => {
    const result = parseCloneCliFlags({ ...validFlags, url: "ftp://x" });
    expect(result.ok).toBe(false);
  });

  it("validateCloneCliFlags returns errors for missing url", () => {
    const errors = validateCloneCliFlags({ ...validFlags, url: undefined as unknown as string });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("validateCloneCliFlags returns no errors for valid flags", () => {
    expect(validateCloneCliFlags(validFlags)).toEqual([]);
  });

  it("validateCloneCliFlags flags non-http scheme", () => {
    const errors = validateCloneCliFlags({ ...validFlags, url: "javascript:alert(1)" });
    expect(errors.some((e) => e.includes("scheme") || e.includes("http"))).toBe(true);
  });

  it("buildDryRunSummary counts stages from flags", () => {
    const parsed = parseCloneCliFlags(validFlags);
    if (!parsed.ok) throw new Error("expected ok");
    const summary = buildDryRunSummary(parsed.value);
    expect(summary.target).toBe("test4");
    expect(summary.url).toBe("https://example.com");
    expect(summary.mode).toBe("v3");
    expect(summary.estimatedStages).toBeGreaterThan(0);
  });

  it("buildDryRunSummary includes warnings for offline-only mode", () => {
    const parsed = parseCloneCliFlags(validFlags);
    if (!parsed.ok) throw new Error("expected ok");
    const summary = buildDryRunSummary(parsed.value);
    expect(Array.isArray(summary.warnings)).toBe(true);
  });
});

describe("phase11-pipeline", () => {
  it("buildPipelineStages returns 6 stages", () => {
    const stages = buildPipelineStages();
    expect(stages).toHaveLength(6);
    expect(stages[0]).toBe("scrape");
    expect(stages[5]).toBe("push");
  });

  it("pipelineStageLabel returns human label", () => {
    expect(pipelineStageLabel("scrape")).toContain("Scrape");
    expect(pipelineStageLabel("extract")).toContain("Extract");
  });

  it("describePipelineStage returns description string", () => {
    const desc = describePipelineStage("qa");
    expect(desc.length).toBeGreaterThan(0);
  });

  it("runClonePipeline dry-run completes all stages", async () => {
    const result = await runClonePipeline({
      flags: validFlags,
      dryRun: true,
      offline: true,
    });
    expect(result.success).toBe(true);
    expect(result.stagesExecuted).toHaveLength(6);
    expect(result.failures).toHaveLength(0);
  });

  it("runClonePipeline records duration per stage", async () => {
    const result = await runClonePipeline({
      flags: validFlags,
      dryRun: true,
      offline: true,
    });
    for (const stage of result.stagesExecuted) {
      expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      expect(stage.stage).toBeTruthy();
    }
  });

  it("runClonePipeline includes issues array", async () => {
    const result = await runClonePipeline({
      flags: validFlags,
      dryRun: true,
      offline: true,
    });
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

describe("phase11-e2e-mock", () => {
  const config: MockE2EConfig = {
    baseUrl: "https://example.com",
    target: "test4",
    mode: "v3",
    offline: true,
  };

  it("mockFetchHtml returns deterministic html", async () => {
    const html = await mockFetchHtml(config.baseUrl, config.offline);
    expect(html).toContain("example.com");
    expect(html.length).toBeGreaterThan(100);
  });

  it("mockFetchHtml respects offline mode", async () => {
    const html = await mockFetchHtml(config.baseUrl, false);
    expect(html.toLowerCase()).toContain("mock");
  });

  it("mockDiscoverInternalLinks returns array", async () => {
    const links = await mockDiscoverInternalLinks(config.baseUrl, config.offline);
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThan(0);
  });

  it("mockExtractSections returns sections with id+selector", async () => {
    const html = await mockFetchHtml(config.baseUrl, config.offline);
    const sections = await mockExtractSections(html, config.baseUrl, config.offline);
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      expect(s.id).toBeTruthy();
      expect(s.selector).toBeTruthy();
    }
  });

  it("mockBuildV3Output returns v3-shaped output", async () => {
    const html = await mockFetchHtml(config.baseUrl, config.offline);
    const sections = await mockExtractSections(html, config.baseUrl, config.offline);
    const v3 = await mockBuildV3Output(sections, config.mode, config.offline);
    expect(v3.mode).toBe(config.mode);
    expect(v3.sections.length).toBe(sections.length);
  });

  it("mockBuildV3Output supports v4 mode", async () => {
    const html = await mockFetchHtml(config.baseUrl, config.offline);
    const sections = await mockExtractSections(html, config.baseUrl, config.offline);
    const v4 = await mockBuildV3Output(sections, "v4", config.offline);
    expect(v4.mode).toBe("v4");
  });

  it("mockMcpHandshake returns success on offline", async () => {
    const result = await mockMcpHandshake(config.target, config.offline);
    expect(result.success).toBe(true);
    expect(result.sessionId).toBeTruthy();
  });

  it("mockPushPage returns deterministic pageId", async () => {
    const html = await mockFetchHtml(config.baseUrl, config.offline);
    const sections = await mockExtractSections(html, config.baseUrl, config.offline);
    const v3 = await mockBuildV3Output(sections, config.mode, config.offline);
    const push = await mockPushPage(v3, config.target, config.offline);
    expect(push.pageId).toMatch(/^mock-/);
    expect(push.pushedSections).toBe(v3.sections.length);
  });

  it("offline pipeline end-to-end runs without errors", async () => {
    const pipelineResult = await runClonePipeline({
      flags: validFlags,
      dryRun: false,
      offline: true,
    });
    expect(pipelineResult.success).toBe(true);
    expect(pipelineResult.stagesExecuted.length).toBe(6);
  });
});