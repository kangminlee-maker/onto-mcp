// Negative-control fixture (리뷰 inv-F2): same-line sibling declarations — the
// exact input class that breaks a naive char→line projection. The line-ownership
// partition must coalesce these into valid non-overlapping leaves.
export const a = 1; export const b = 2;
export function f(): number { return a; } export function g(): number { return b; }
class X { foo(): number { return 1; } bar(): number { return 2; } }
export const c = 3;
