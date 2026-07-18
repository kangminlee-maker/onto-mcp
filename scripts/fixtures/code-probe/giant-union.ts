// Adversarial shape 2: one huge type alias dominates the file — a single leaf
// should not silently swallow the file without the max-leaf-share metric noticing.
export type WireEvent =
  | { kind: "created"; id: string; at: string }
  | { kind: "updated"; id: string; at: string; fields: string[] }
  | { kind: "deleted"; id: string; at: string; soft: boolean }
  | { kind: "archived"; id: string; at: string }
  | { kind: "restored"; id: string; at: string }
  | { kind: "merged"; id: string; into: string; at: string }
  | { kind: "split"; id: string; parts: string[]; at: string }
  | { kind: "tagged"; id: string; tag: string; at: string }
  | { kind: "untagged"; id: string; tag: string; at: string }
  | { kind: "locked"; id: string; by: string; at: string }
  | { kind: "unlocked"; id: string; by: string; at: string }
  | { kind: "commented"; id: string; author: string; body: string; at: string }
  | { kind: "reacted"; id: string; emoji: string; at: string }
  | { kind: "assigned"; id: string; to: string; at: string }
  | { kind: "unassigned"; id: string; from: string; at: string }
  | { kind: "escalated"; id: string; level: number; at: string }
  | { kind: "resolved"; id: string; resolution: string; at: string }
  | { kind: "reopened"; id: string; reason: string; at: string };

export const WIRE_EVENT_KINDS = [
  "created", "updated", "deleted", "archived", "restored", "merged", "split",
  "tagged", "untagged", "locked", "unlocked", "commented", "reacted",
  "assigned", "unassigned", "escalated", "resolved", "reopened",
] as const;
