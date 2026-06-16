/**
 * `onto watch` Ink application — a small screen router over read-only data:
 *   selector → pick a session;  tree → live WorkflowTree HUD;  log → event tail.
 * Keys: ↑↓/enter (selector), tab (tree↔log), s (→selector), r (refresh tree),
 * q (quit). It only reads projections + tails the event stream — never mutates
 * run state.
 */
import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { followRuntimeEvents } from "./data/event-follower.js";
import { loadTreeViewModel } from "./data/projection-poll.js";
import { readOutputTail } from "./data/node-detail.js";
import type { SessionRef } from "./data/session-discovery.js";
import { LogScreen } from "./screens/log.js";
import { NodeDetail } from "./screens/node-detail.js";
import { SessionSelector } from "./screens/session-selector.js";
import { WorkflowTree } from "./screens/workflow-tree.js";
import {
  isTerminalStatus,
  type TreeNode,
  type TreeViewModel,
} from "./view-model/tree-view-model.js";
import type { RuntimeStreamEvent } from "../core-api/runtime-observation.js";

type Screen = "selector" | "tree" | "log";

export interface WatchAppProps {
  sessions: SessionRef[];
  /** Pre-resolved session; when set the app opens on the tree, else the selector. */
  initialSession?: SessionRef;
  ontoHome?: string;
  defaultPollMs?: number;
  /** Injected for deterministic age rendering in the selector (tests). */
  nowMs?: number;
}

export function WatchApp({
  sessions,
  initialSession,
  ontoHome,
  defaultPollMs = 1000,
  nowMs,
}: WatchAppProps): JSX.Element {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(initialSession ? "tree" : "selector");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [session, setSession] = useState<SessionRef | null>(initialSession ?? null);
  const [vm, setVm] = useState<TreeViewModel | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [events, setEvents] = useState<RuntimeStreamEvent[]>([]);
  const [nonce, setNonce] = useState(0);
  const [nodeCursor, setNodeCursor] = useState(0);
  const [tail, setTail] = useState<string[]>([]);

  const flatNodes: TreeNode[] = vm ? vm.phases.flatMap((p) => p.nodes) : [];
  const selectedNode = flatNodes.length > 0
    ? flatNodes[Math.min(nodeCursor, flatNodes.length - 1)]!
    : null;

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (screen === "selector") {
      if (key.upArrow) setSelectedIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) {
        setSelectedIndex((i) => Math.min(sessions.length - 1, i + 1));
      } else if (key.return && sessions[selectedIndex]) {
        setSession(sessions[selectedIndex]!);
        setVm(null);
        setEvents([]);
        setNodeCursor(0);
        setScreen("tree");
      }
      return;
    }
    if (input === "s") setScreen("selector");
    else if (key.tab) setScreen((s) => (s === "tree" ? "log" : "tree"));
    else if (screen === "tree" && input === "r") setNonce((n) => n + 1);
    else if (screen === "tree" && key.upArrow) {
      setNodeCursor((c) => Math.max(0, c - 1));
    } else if (screen === "tree" && key.downArrow) {
      setNodeCursor((c) => Math.min(Math.max(0, flatNodes.length - 1), c + 1));
    }
  });

  // Tree projection poll — respects the projection interval, stops at terminal status.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick(): Promise<void> {
      try {
        const next = await loadTreeViewModel(session!, ontoHome ? { ontoHome } : {});
        if (cancelled) return;
        setVm(next);
        setTreeError(null);
        if (isTerminalStatus(next.status)) return;
        timer = setTimeout(
          () => void tick(),
          Math.max(500, next.liveness.pollMs ?? defaultPollMs),
        );
      } catch (caught) {
        if (!cancelled) {
          setTreeError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session, ontoHome, defaultPollMs, nonce]);

  // Live event tail for the Log screen.
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void (async () => {
      for await (
        const event of followRuntimeEvents(session.sessionRoot, {
          signal: controller.signal,
        })
      ) {
        setEvents((prev) => [...prev, event].slice(-500));
      }
    })();
    return () => controller.abort();
  }, [session]);

  // Drill-down: read the selected node's output tail (read-only).
  const selectedOutputPath = selectedNode?.outputPath ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!selectedOutputPath) {
      setTail([]);
      return;
    }
    void readOutputTail(selectedOutputPath).then((lines) => {
      if (!cancelled) setTail(lines);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedOutputPath]);

  if (screen === "selector") {
    return (
      <SessionSelector
        sessions={sessions}
        selectedIndex={selectedIndex}
        {...(nowMs !== undefined ? { nowMs } : {})}
      />
    );
  }
  if (!session) return <Text>no session selected</Text>;
  if (screen === "log") {
    return <LogScreen sessionId={session.sessionId} events={events} />;
  }
  if (treeError) {
    return (
      <Box flexDirection="column">
        <Text color="red">{`onto watch error: ${treeError}`}</Text>
        <Text dimColor>[s]essions  [r]etry  [q]uit</Text>
      </Box>
    );
  }
  if (!vm) {
    return <Text>{`loading ${session.pipeline} session ${session.sessionId}…`}</Text>;
  }
  return (
    <Box flexDirection="column">
      <WorkflowTree
        vm={vm}
        {...(selectedNode ? { selectedNodeId: selectedNode.id } : {})}
      />
      {selectedNode ? <NodeDetail node={selectedNode} tail={tail} /> : null}
    </Box>
  );
}
