import { describe, expect, it } from "vitest";
import { parsePromptHints, parseDuration, parseListCount, suggestArt } from "../../src/ai/prompt-parser";

describe("parsePromptHints", () => {
  it("parses a listicle with duration and platform", () => {
    const h = parsePromptHints("Make a 30-second TikTok about five useful AI tools for students");
    expect(h.requestedDurationSeconds).toBe(30);
    expect(h.listCount).toBe(5);
    expect(h.formatHint).toBe("listicle");
    expect(h.platformHint).toBe("tiktok");
    expect(h.mentionsRealPerson).toBe(false);
    expect(h.speculative).toBe(false);
  });

  it("parses durations in several forms", () => {
    expect(parseDuration("a 1 minute explainer")).toBe(60);
    expect(parseDuration("make it 45s")).toBe(45);
    expect(parseDuration("a 1 minute 30 seconds video")).toBe(90);
    expect(parseDuration("half a minute on tides")).toBe(30);
    expect(parseDuration("two-minute video")).toBe(120);
    expect(parseDuration("music of the 1960s")).toBeUndefined();
    expect(parseDuration("why is the sky blue")).toBeUndefined();
  });

  it("parses list counts", () => {
    expect(parseListCount("top 3 productivity apps")).toBe(3);
    expect(parseListCount("3 habits that changed my life")).toBe(3);
    expect(parseListCount("ten surprising facts about octopuses")).toBe(10);
    expect(parseListCount("a 30-second video about sleep")).toBeUndefined();
  });

  it("detects speculative prompts", () => {
    const h = parsePromptHints("What if Earth had two moons? Cinematic YouTube Shorts video");
    expect(h.speculative).toBe(true);
    expect(h.styleHints).toContain("cinematic");
    expect(h.platformHint).toBe("shorts");
    expect(h.formatHint).toBe("cinematic");
  });

  it("detects fiction", () => {
    const h = parsePromptHints("A fairy tale about a lighthouse keeper and a whale");
    expect(h.fictional).toBe(true);
    expect(h.formatHint).toBe("story");
  });

  it("detects real people", () => {
    expect(parsePromptHints("Explain why Elon Musk bought Twitter").mentionsRealPerson).toBe(true);
    expect(parsePromptHints("the best songs by Taylor Swift").mentionsRealPerson).toBe(true);
    expect(parsePromptHints("a day in the life of a celebrity chef").mentionsRealPerson).toBe(true);
    expect(parsePromptHints("Explain how lightning forms").mentionsRealPerson).toBe(false);
    expect(parsePromptHints("Why the Pacific Ocean is so deep").mentionsRealPerson).toBe(false);
  });

  it("detects time-sensitive prompts", () => {
    expect(parsePromptHints("the latest iPhone features").timeSensitive).toBe(true);
    expect(parsePromptHints("what is the price of bitcoin").timeSensitive).toBe(true);
    expect(parsePromptHints("AI news this week").timeSensitive).toBe(true);
    expect(parsePromptHints("best phones of 2026").timeSensitive).toBe(true);
    expect(parsePromptHints("how volcanoes work").timeSensitive).toBe(false);
  });

  it("detects tutorial and ad formats", () => {
    expect(parsePromptHints("how to make cold brew coffee").formatHint).toBe("tutorial");
    expect(parsePromptHints("a promo ad for our new running shoe").formatHint).toBe("ad");
    expect(parsePromptHints("explain how vaccines work").formatHint).toBe("explainer");
  });

  it("suggests procedural art by keyword", () => {
    expect(suggestArt("journey through deep space")).toBe("starfield");
    expect(suggestArt("life in the ocean")).toBe("ocean-depths");
    expect(suggestArt("useful AI tools")).toBe("particle-network");
    expect(suggestArt("how to save money")).toBe("bar-chart");
    expect(suggestArt("a quiet abstract mood")).toBe("aurora-gradient");
  });
});
