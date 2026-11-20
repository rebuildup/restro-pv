// After Effects sometimes stops answering the host for a while: the ae-a8n
// driver gives up after 120 seconds and the run ends there. The stalls are
// recorded in docs/verification/windows.md; they happen in AE's own script
// engine (menu lookups, rendering, layer queries), not in Ae_Restro.
//
// A call that only reads, or that sets a value, can simply be made again.
// A call that changes the scene must not be repeated, or the scene would
// change twice. The stalls that were repeated are reported, so they show up
// in the result instead of disappearing.

/** The error text the ae-a8n driver and the script runner use for a stall. */
const STALL = /did not answer|timed out/i;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** How long to wait before asking AE again. */
export const STALL_RETRY_DELAY_MS = 5_000;

/**
 * Runs `call`; when AE did not answer in time, waits and runs it once more.
 * `onStall` is called with the description when the second attempt succeeded.
 * A second failure is thrown: the run really could not continue.
 */
export async function hostCall<T>(what: string, call: () => Promise<T>,
                                  onStall?: (what: string, message: string) => void,
                                  delayMs = STALL_RETRY_DELAY_MS): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!STALL.test(message)) throw error;
    await sleep(delayMs);
    const result = await call();
    onStall?.(what, message);
    return result;
  }
}
