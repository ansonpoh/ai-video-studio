import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AnthropicLlm, LlmStoryboardSchema, cleanContent, mapLlmStoryboard } from "../../src/ai/providers/anthropic";
import { MockLlm } from "../../src/ai/providers/mock";
import { parsePromptHints } from "../../src/ai/prompt-parser";
import { VideoRequest } from "../../src/schemas/options";
import { ProviderError } from "../../src/providers/types";

/** Fake SDK client: no network. Each call pops the next canned response. */
const fakeClient = (responses: Array<Record<string, unknown>>) => {
  const bodies: Record<string, unknown>[] = [];
  const client = {
    messages: {
      parse: async (body: Record<string, unknown>) => {
        bodies.push(structuredClone({ ...body, output_config: { effort: (body.output_config as { effort?: string }).effort } }));
        const r = responses.shift();
        if (!r) throw new Error("no more canned responses");
        return { content: [{ type: "text", text: JSON.stringify(r.parsed_output ?? {}) }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 1000, output_tokens: 500 }, ...r };
      },
    },
  } as unknown as Anthropic;
  return { client, bodies };
};

const req = VideoRequest.parse({ prompt: "Explain how lightning forms", durationSeconds: 30 });
const hints = parsePromptHints(req.prompt);

describe("AnthropicLlm (fake client, no network)", () => {
  it("sends model + effort, no sampling/thinking params, and computes cost", async () => {
    const { direction } = await new MockLlm().direction(req, hints);
    const { client, bodies } = fakeClient([{ parsed_output: direction }]);
    const llm = new AnthropicLlm({ client, model: "claude-opus-5-5", effort: "high" });
    const r = await llm.direction(req, hints);
    expect(r.direction.title).toBe(direction.title);
    const b = bodies[0];
    expect(b.model).toBe("claude-opus-5-5");
    expect(b.output_config).toEqual({ effort: "high" });
    for (const k of ["thinking", "temperature", "top_p", "top_k", "budget_tokens"]) expect(b).not.toHaveProperty(k);
    expect(r.cost.actualUsd).toBeCloseTo((1000 * 4 + 500 * 20) / 1e6);
  });

  it("throws a non-retryable ProviderError on refusal", async () => {
    const { client } = fakeClient([{ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null }, parsed_output: null }]);
    const llm = new AnthropicLlm({ client });
    await expect(llm.direction(req, hints)).rejects.toMatchObject({ retryable: false });
    await expect(new AnthropicLlm({ client: fakeClient([{ stop_reason: "refusal", parsed_output: null }]).client }).direction(req, hints)).rejects.toBeInstanceOf(ProviderError);
  });

  it("does one corrective retry with the validation errors, then succeeds", async () => {
    const mock = new MockLlm();
    const { direction } = await mock.direction(req, hints);
    const { script } = await mock.script(req, direction, hints);
    const good = { title: "t", hook: "h", scenes: [{ purpose: "hook", layout: "outro", narration: "n", visual: { type: "diagram", description: "d" } }] };
    const { client, bodies } = fakeClient([{ parsed_output: { title: "t", hook: "h", scenes: [] } }, { parsed_output: good }]);
    const llm = new AnthropicLlm({ client });
    const r = await llm.storyboard(req, direction, script);
    expect(r.storyboard.scenes).toHaveLength(1);
    expect(r.storyboard.model).toBe(llm.model);
    const retryMessages = bodies[1].messages as { role: string; content: string }[];
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[2].content).toMatch(/failed validation/);
  });

  it("gives up after one retry", async () => {
    const bad = { parsed_output: { title: "t", hook: "h", scenes: [] } };
    const { client } = fakeClient([bad, { ...bad }]);
    const { direction } = await new MockLlm().direction(req, hints);
    await expect(new AnthropicLlm({ client }).storyboard(req, direction, { title: "t", hook: "h", beats: [], sources: [] })).rejects.toThrow(/after one corrective retry/);
  });
});

const emptyContent = {
  emphasis: "", number: null, heading: "", body: "", label: "", fact: "", leftLabel: "", rightLabel: "", leftText: "", rightText: "",
  points: [], quote: "", attribution: "", labels: [], productName: "", tagline: "", features: [], value: null, prefix: "", suffix: "",
  decimals: null, stats: [], cta: "",
};

describe("LLM output format", () => {
  it("stays within the structured-output limit of 24 optional properties", () => {
    let optional = 0;
    const walk = (x: unknown): void => {
      if (!x || typeof x !== "object") return;
      if (Array.isArray(x)) return x.forEach(walk);
      const o = x as { properties?: Record<string, unknown>; required?: string[] };
      if (o.properties) {
        const req = new Set(o.required ?? []);
        optional += Object.keys(o.properties).filter((k) => !req.has(k)).length;
      }
      Object.values(o).forEach(walk);
    };
    walk(zodOutputFormat(LlmStoryboardSchema));
    expect(optional).toBeLessThanOrEqual(24);
  });

  it("treats empty content fields as absent", () => {
    expect(cleanContent({ ...emptyContent, heading: "Tool one", number: 2 })).toEqual({ heading: "Tool one", number: 2 });
    const r = mapLlmStoryboard({ title: "t", hook: "h", scenes: [{ purpose: "point", layout: "listicle", narration: "One tool.", visual: { type: "motion_graphics", description: "d" }, content: { ...emptyContent, heading: "Tool one" } }] });
    expect(r.errors).toEqual([]);
  });

  it("tolerates off-vocabulary enum values instead of failing the whole parse", () => {
    const f = zodOutputFormat(LlmStoryboardSchema);
    const parsed = f.parse(
      JSON.stringify({ title: "t", hook: "h", scenes: [{ purpose: "intro", layout: "fact card", narration: "n", visual: { type: "illustration", description: "d", art: "volcano" }, content: emptyContent }] }),
    );
    expect(parsed.scenes[0]).toMatchObject({ purpose: "point", layout: "cinematic_image", visual: { type: "motion_graphics" } });
    expect(parsed.scenes[0].visual.art).toBeUndefined();
  });
});
