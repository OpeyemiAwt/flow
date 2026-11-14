/**
 * Checks whether global financial execution is disabled.
 * Unconditionally returns `true` when `FLOW_EXECUTION=disabled` (or anything other
 * than `"enabled"` in `process.env.FLOW_EXECUTION`) or when `globalExecutionDisabled` is true.
 */
export function isFinancialExecutionDisabled(
  globalExecutionDisabled?: boolean,
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? process.env
    : {},
): boolean {
  if (globalExecutionDisabled === true) return true;
  const envMode = env.FLOW_EXECUTION ?? "disabled";
  return envMode !== "enabled";
}
