import { readFileSync } from "node:fs";
import { analyzeTextWithRouting } from "@/lib/ai/analyze-image";
import type { AnalysisModelTrace } from "@/lib/types";
import { toPortalBundle } from "@/lib/portal-bundle";
import { portalBundleToRegressionBundle } from "@/evals/portal-bundle-to-regression";
import type { RegressionPortalBundle } from "@/lib/tankestrom-regression-fixture-runner";

export function aggregateTokenUsage(trace: AnalysisModelTrace | undefined): {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
} {
  const calls = trace?.tokenUsageCalls;
  if (!calls?.length) {
    return { promptTokens: null, completionTokens: null, totalTokens: null };
  }
  let promptSum = 0;
  let completionSum = 0;
  let totalSum = 0;
  let hasP = false;
  let hasC = false;
  let hasT = false;
  for (const u of calls) {
    if (u.prompt_tokens != null) {
      promptSum += u.prompt_tokens;
      hasP = true;
    }
    if (u.completion_tokens != null) {
      completionSum += u.completion_tokens;
      hasC = true;
    }
    if (u.total_tokens != null) {
      totalSum += u.total_tokens;
      hasT = true;
    }
  }
  return {
    promptTokens: hasP ? promptSum : null,
    completionTokens: hasC ? completionSum : null,
    totalTokens: hasT ? totalSum : hasP && hasC ? promptSum + completionSum : null,
  };
}

/**
 * Kjør tekstanalyse + portal-bundle (samme stack som portal-import), uten HTTP.
 * Krever at `@/app/api/analyze/route` er importert sideeffekt (registerPortalBundleRuntime).
 */
export async function runLiveFixtureAnalysis(fixturePath: string): Promise<{
  regressionBundle: RegressionPortalBundle;
  portalBundle: Record<string, unknown>;
  modelTrace: AnalysisModelTrace;
  latencyMs: number;
}> {
  const raw = readFileSync(fixturePath, "utf8");
  const t0 = performance.now();
  const { result, modelTrace } = await analyzeTextWithRouting(raw, {
    documentKind: "text",
    sourceRoute: "text",
    analysisResponseMode: "portal",
  });
  const latencyMs = Math.round(performance.now() - t0);
  const merged = { ...result, analysisModelTrace: modelTrace };
  const portalBundle = (await toPortalBundle(merged, "text", "text", false, {
    knownPersons: [],
  })) as Record<string, unknown>;
  const regressionBundle = portalBundleToRegressionBundle(portalBundle);
  return { regressionBundle, portalBundle, modelTrace, latencyMs };
}
