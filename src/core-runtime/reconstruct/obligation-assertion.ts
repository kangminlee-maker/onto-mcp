/**
 * G(a) — obligation recorder (INV-OBLIGATION-COVERAGE-1).
 *
 * A validator calls `assertObligation(acc, id)` at an UNCONDITIONAL position before each
 * check-block's guard, accumulating the obligation ids whose enforcer block was reached.
 * The accumulator is emitted as `asserted_obligation_ids: string[]` on the validation
 * artifact (off the reuse-hash five). The obligation-coverage harvest test re-derives this
 * set dynamically (deleting the call reds the harvest) and the gate proves every active
 * `(validator_id, obligation_id)` is either recorded here or parked in the pending ledger.
 *
 * Scope honesty: this records that control REACHED the enforcer block — NOT that the
 * enforcer is semantically correct. Idempotent: a repeat id is not pushed twice.
 */
export function assertObligation(asserted: string[], obligationId: string): void {
  if (!asserted.includes(obligationId)) {
    asserted.push(obligationId);
  }
}
