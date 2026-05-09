import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describeTankestromEvalModelContext,
  getActiveTankestromEvalModelOverride,
  isTankestromEvalModelOverrideAllowed,
  parseModelArg,
} from "@/lib/eval/tankestrom-eval-model-override";
import { getLightAnalysisModel, getStrongAnalysisModel } from "@/lib/ai/analysis-model-router";

describe("tankestrom eval model override", () => {
  const keys = [
    "NODE_ENV",
    "EVAL_TANKESTROM_MODEL",
    "ALLOW_EVAL_MODEL_OVERRIDE",
    "OPENAI_ANALYSIS_MODEL_LIGHT",
    "OPENAI_ANALYSIS_MODEL_STRONG",
    "TANKESTROM_LIGHT_MODEL",
    "TANKESTROM_DEFAULT_MODEL",
    "TANKESTROM_HEAVY_MODEL",
  ] as const;
  const snapshot: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of keys) snapshot[k] = process.env[k];
    for (const k of keys) delete process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it("ignorerer EVAL i production uten ALLOW_EVAL_MODEL_OVERRIDE", () => {
    process.env.NODE_ENV = "production";
    process.env.EVAL_TANKESTROM_MODEL = "gpt-5.4-mini";
    expect(isTankestromEvalModelOverrideAllowed()).toBe(false);
    expect(getActiveTankestromEvalModelOverride()).toBe(null);
    expect(getLightAnalysisModel()).toBe("gpt-4o-mini");
  });

  it("aktiverer overstyr i production når ALLOW_EVAL_MODEL_OVERRIDE=true", () => {
    process.env.NODE_ENV = "production";
    process.env.EVAL_TANKESTROM_MODEL = "gpt-5.4-mini";
    process.env.ALLOW_EVAL_MODEL_OVERRIDE = "true";
    expect(getActiveTankestromEvalModelOverride()).toBe("gpt-5.4-mini");
    expect(getLightAnalysisModel()).toBe("gpt-5.4-mini");
    expect(getStrongAnalysisModel()).toBe("gpt-5.4-mini");
  });

  it("describeTankestromEvalModelContext reflekterer om overstyr faktisk brukes", () => {
    process.env.NODE_ENV = "development";
    process.env.EVAL_TANKESTROM_MODEL = "gpt-5.4";
    const d = describeTankestromEvalModelContext();
    expect(d.modelOverrideRequested).toBe(true);
    expect(d.modelOverrideUsed).toBe(true);
  });

  it("når EVAL er satt men ikke tillatt, er modelOverrideUsed false", () => {
    process.env.NODE_ENV = "production";
    process.env.EVAL_TANKESTROM_MODEL = "gpt-5.4";
    const d = describeTankestromEvalModelContext();
    expect(d.modelOverrideRequested).toBe(true);
    expect(d.modelOverrideUsed).toBe(false);
  });

  it("parseModelArg", () => {
    expect(parseModelArg(["--model=gpt-5.4-mini"])).toBe("gpt-5.4-mini");
    expect(parseModelArg(["--model=current"])).toBe("current");
    expect(parseModelArg([])).toBe(null);
  });
});
