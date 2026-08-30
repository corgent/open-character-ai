import { describe, it, expect } from "vitest";
import config, { getModelCost } from "@/lib/config";

describe("config.ai model cost mapping", () => {
  it("charges 1 credit for the standard Gemini model", () => {
    expect(getModelCost("google/gemini-2.5-flash")).toBe(1);
  });

  it("charges 10 credits for premium models", () => {
    expect(getModelCost("openai/gpt-4o")).toBe(10);
    expect(getModelCost("deepseek/deepseek-r1")).toBe(10);
    expect(getModelCost("anthropic/claude-3.5-sonnet")).toBe(10);
  });

  it("falls back to the default cost for unknown models", () => {
    expect(getModelCost("unknown/model-xyz")).toBe(config.ai.defaultCost);
  });

  it("falls back to the default cost when model is missing", () => {
    expect(getModelCost(undefined)).toBe(config.ai.defaultCost);
    expect(getModelCost(null)).toBe(config.ai.defaultCost);
    expect(getModelCost("")).toBe(config.ai.defaultCost);
  });

  it("keeps the UI-visible tier list in sync with modelCosts", () => {
    for (const model of config.ai.models) {
      expect(config.ai.modelCosts[model]).toBeDefined();
    }
  });

  it("reads the MuAPI key from MU_API_KEY", () => {
    expect(config.ai).toHaveProperty("apiKey");
  });
});
