// After Effects sometimes stops answering the host for a while: the ae-a8n
// driver gives up after its timeout and the run ends there. The stalls are
// recorded in docs/verification/windows.md; they happen in AE's own script
// engine (menu lookups, rendering, layer queries), not in Ae_Restro.
//
// Retry policy is explicit because a stall does NOT prove the call failed:
// the request may have been applied and only the response lost. Repeating a
// mutating call would then apply the change twice.
//
//   hostQuery   - read-only calls; safe to repeat once after a stall.
//   hostCall    - idempotent calls (same input -> same observable result,
//                 e.g. rendering the same frame to the same path); one retry.
//   hostMutation- calls that change host state; NEVER retried. A stall is
//                 reported as HostOutcomeUnknownError so the caller inspects
//                 state before deciding anything.

/** The error text the ae-a8n driver and the script runner use for a stall. */
const STALL = /did not answer|timed out/i;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** How long to wait before asking AE again. */
export const STALL_RETRY_DELAY_MS = 5_000;

/** A stalled mutation may or may not have landed; the outcome is unknown. */
export class HostOutcomeUnknownError extends Error {
  readonly what: string;
  readonly cause: unknown;
  constructor(what: string, cause: unknown) {
    super(`AE call "${what}" stalled; side effects are UNKNOWN — inspect ` +
      `host state before retrying or assuming failure`);
    this.name = 'HostOutcomeUnknownError';
    this.what = what;
    this.cause = cause;
  }
}

function isStall(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return STALL.test(message);
}

/**
 * Runs `call`; when AE did not answer in time, waits and runs it once more.
 * Only for calls that are safe to repeat (reads and idempotent renders).
 * `onStall` is called with the description when the second attempt succeeded.
 * A second failure is thrown: the run really could not continue.
 */
export async function hostCall<T>(what: string, call: () => Promise<T>,
                                  onStall?: (what: string, message: string) => void,
                                  delayMs = STALL_RETRY_DELAY_MS): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isStall(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await sleep(delayMs);
    const result = await call();
    onStall?.(what, message);
    return result;
  }
}

/** Alias kept for readability at read-only call sites. */
export const hostQuery = hostCall;

/**
 * Runs a mutating AE call exactly once. If AE stalls, throws
 * HostOutcomeUnknownError — the caller MUST read host state back before any
 * retry, because the mutation may already have been applied.
 */
export async function hostMutation<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (isStall(error)) throw new HostOutcomeUnknownError(what, error);
    throw error;
  }
}
