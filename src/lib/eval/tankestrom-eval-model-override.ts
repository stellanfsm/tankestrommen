/**
 * Eval-only modelloverstyr for Tankestrømmen.
 * I produksjon ignoreres EVAL_TANKESTROM_MODEL med mindre ALLOW_EVAL_MODEL_OVERRIDE=true.
 */

/** Tillat overstyr når ikke produksjon, eller eksplisitt flagg. */
export function isTankestromEvalModelOverrideAllowed(): boolean {
  if (process.env.ALLOW_EVAL_MODEL_OVERRIDE === "true") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Modell fra EVAL_TANKESTROM_MODEL når tillatt og ikke "current".
 * Live-eval / CLI setter typisk EVAL_TANKESTROM_MODEL før analyse importeres.
 */
export function getActiveTankestromEvalModelOverride(): string | null {
  if (!isTankestromEvalModelOverrideAllowed()) return null;
  const raw = process.env.EVAL_TANKESTROM_MODEL?.trim();
  if (!raw) return null;
  if (raw.toLowerCase() === "current") return null;
  return raw;
}

export type TankestromEvalModelCli = "current" | string;

/** Parser --model=current | --model=gpt-5.4-mini (mv.) */
export function parseModelArg(argv: string[]): TankestromEvalModelCli | null {
  const raw = argv.find((a) => a.startsWith("--model="));
  if (!raw) return null;
  const v = raw.slice("--model=".length).trim();
  return v || null;
}

/**
 * Metadata for Braintrust / observability (ingen hemmeligheter).
 */
export function describeTankestromEvalModelContext(): {
  modelOverrideRequested: boolean;
  modelOverrideUsed: boolean;
  evalModelEnv: string | null;
  allowEvalModelOverride: boolean;
  nodeEnv: string | undefined;
} {
  const evalEnv = process.env.EVAL_TANKESTROM_MODEL?.trim() ?? null;
  const requested = Boolean(evalEnv) && evalEnv!.toLowerCase() !== "current";
  const allowed = isTankestromEvalModelOverrideAllowed();
  return {
    modelOverrideRequested: requested,
    modelOverrideUsed: Boolean(requested && allowed),
    evalModelEnv: evalEnv,
    allowEvalModelOverride: allowed,
    nodeEnv: process.env.NODE_ENV,
  };
}
