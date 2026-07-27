import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The review runner's non-fatal warning channel.
 *
 * A warning is EVIDENCE about the run that produced it — which seats a per-call
 * `llmOverride` reached, which unit seats a provider switch dropped, the billing
 * route the run resolved — and the review API persists it into that session's
 * environment-warnings artifact, which every `onto_review_read` projection
 * surfaces.
 *
 * That is why the transport is an invocation-scoped collector rather than the
 * process-global console. The runtime runs invocations CONCURRENTLY: a review
 * returns a running handle while `fullRun` keeps executing in the background
 * (review-api's `Promise.race`), and the MCP server accepts the next call
 * meanwhile. Save/restore of a global sink is only correct under strict LIFO
 * nesting, which those overlapping invocations break in both directions — B
 * captures A's warnings into B's session, and A finishing first uninstalls B's
 * capture while B is still running. Mis-attributed display output is noise; a
 * mis-attributed billing route recorded as session evidence is a false record,
 * so this channel carries its own context.
 *
 * {@link AsyncLocalStorage} scopes the collector to the invocation's async call
 * tree, so attribution holds without any global state. Emissions outside a scope
 * (a direct CLI run) still print — they are simply not harvested.
 */
export const REVIEW_RUNNER_WARNING_PREFIX = "[review runner warning]";

const warningCollector = new AsyncLocalStorage<string[]>();

/**
 * Run `action` with its own warning collector and return what it collected.
 * Nested/concurrent invocations each get their own store.
 */
export async function withReviewRunnerWarnings<T>(
  action: () => Promise<T>,
): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const result = await warningCollector.run(warnings, action);
  return { result, warnings };
}

/**
 * Emit one non-fatal review-runner warning.
 *
 * The message goes to the active invocation's collector (the harvested, durable
 * channel) AND to `console.warn` for live visibility. The console copy is
 * display-only — the artifact is written from the collector — so the two cannot
 * double-count.
 */
export function emitReviewRunnerWarning(message: string): void {
  warningCollector.getStore()?.push(message);
  console.warn(`${REVIEW_RUNNER_WARNING_PREFIX} ${message}`);
}
