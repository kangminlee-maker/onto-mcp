/**
 * WorkflowTree HUD — the primary `onto watch` screen. Pure presentation: renders
 * a {@link TreeViewModel} (header · narrator · phase-grouped unit tree · footer)
 * for either pipeline. The HUD never branches on pipeline; the adapters already
 * normalized the difference into the view model.
 */
import { Box, Text } from "ink";
import type {
  NodeState,
  TreeNode,
  TreeViewModel,
  WorkflowStatus,
} from "../view-model/tree-view-model.js";

const NODE_ICON: Record<NodeState, string> = {
  completed: "✓",
  running: "◐",
  pending: "○",
  failed: "✗",
  halted: "◑",
  skipped: "⊘",
};

const NODE_COLOR: Record<NodeState, string> = {
  completed: "green",
  running: "cyan",
  pending: "gray",
  failed: "red",
  halted: "yellow",
  skipped: "gray",
};

const STATUS_BADGE: Record<WorkflowStatus, { label: string; color: string }> = {
  running: { label: "◐ running", color: "cyan" },
  completed: { label: "✓ completed", color: "green" },
  halted: { label: "◑ halted", color: "yellow" },
  failed: { label: "✗ failed", color: "red" },
};

const SEVERITY_ORDER = ["blocker", "high", "medium", "low", "info"] as const;
const SEVERITY_ABBR: Record<(typeof SEVERITY_ORDER)[number], string> = {
  blocker: "blk",
  high: "high",
  medium: "med",
  low: "low",
  info: "info",
};

function NodeBadge({ node }: { node: TreeNode }): JSX.Element | null {
  const parts: string[] = [];
  if (node.owner) parts.push(node.owner);
  if (node.signalAgeSec != null) parts.push(`${node.signalAgeSec}s`);
  if (node.attempts && node.attempts > 1) parts.push(`try${node.attempts}`);
  if (node.failureMessage) parts.push(node.failureMessage);
  if (parts.length === 0) return null;
  return <Text dimColor>{`  ${parts.join(" · ")}`}</Text>;
}

function Footer({ vm }: { vm: TreeViewModel }): JSX.Element {
  const { findings, counts } = vm.summary;
  if (findings) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text>
          Findings  {SEVERITY_ORDER.map((s) => `⬤${findings[s]} ${SEVERITY_ABBR[s]}`).join("  ")}
        </Text>
        {findings.material.map((title, index) => (
          <Text key={index} dimColor>{`  › ${title}`}</Text>
        ))}
      </Box>
    );
  }
  if (counts) {
    const pairs = Object.entries(counts)
      .filter(([, value]) => value != null)
      .map(([key, value]) => `${key} ${value}`);
    return (
      <Box marginTop={1}>
        <Text>Coverage  {pairs.join(" · ")}</Text>
      </Box>
    );
  }
  return <Box marginTop={1} />;
}

export function WorkflowTree({ vm }: { vm: TreeViewModel }): JSX.Element {
  const badge = STATUS_BADGE[vm.status];
  const phasesDone = vm.phases.filter((p) => p.state === "completed").length;
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>onto watch</Text>
        <Text>{` · ${vm.pipeline} · ${vm.sessionId} `}</Text>
        <Text color={badge.color}>{badge.label}</Text>
      </Box>
      {vm.headline ? <Text dimColor>{vm.headline}</Text> : null}
      <Text>{`▸ ${vm.narrator}`}</Text>

      <Box marginTop={1}>
        <Text>{`Pipeline  ${phasesDone}/${vm.phases.length} phases`}</Text>
        {vm.liveness.secondsSinceSignal != null ? (
          <Text dimColor>{`  · ${vm.liveness.secondsSinceSignal}s since signal`}</Text>
        ) : null}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {vm.phases.map((phase) => (
          <Box flexDirection="column" key={phase.id}>
            <Text color={NODE_COLOR[phase.state]}>
              {`${NODE_ICON[phase.state]} ${phase.label}`}
            </Text>
            {phase.nodes.map((node) => (
              <Box key={node.id}>
                <Text color={NODE_COLOR[node.status]}>{`  ${NODE_ICON[node.status]} `}</Text>
                <Text>{node.label}</Text>
                <NodeBadge node={node} />
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      <Footer vm={vm} />

      <Box marginTop={1}>
        <Text dimColor>[q]uit  [r]efresh</Text>
      </Box>
    </Box>
  );
}
