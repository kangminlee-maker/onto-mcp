/**
 * `onto watch` Ink application. Holds the current {@link TreeViewModel}, drives
 * the projection poll loop (respecting the projection's recommended interval and
 * stopping at terminal status), and handles keys (`q` quit, `r` refresh now).
 * Read-only: it only reads projections — never mutates run state.
 */
import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { loadTreeViewModel } from "./data/projection-poll.js";
import type { SessionRef } from "./data/session-discovery.js";
import { WorkflowTree } from "./screens/workflow-tree.js";
import { isTerminalStatus, type TreeViewModel } from "./view-model/tree-view-model.js";

export interface WatchAppProps {
  session: SessionRef;
  ontoHome?: string;
  /** Default poll interval (ms) when the projection does not recommend one. */
  defaultPollMs?: number;
}

export function WatchApp({
  session,
  ontoHome,
  defaultPollMs = 1000,
}: WatchAppProps): JSX.Element {
  const { exit } = useApp();
  const [vm, setVm] = useState<TreeViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useInput((input) => {
    if (input === "q") exit();
    else if (input === "r") setNonce((n) => n + 1);
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick(): Promise<void> {
      try {
        const next = await loadTreeViewModel(
          session,
          ontoHome ? { ontoHome } : {},
        );
        if (cancelled) return;
        setVm(next);
        setError(null);
        if (isTerminalStatus(next.status)) return; // stop polling at terminal state
        const delay = Math.max(500, next.liveness.pollMs ?? defaultPollMs);
        timer = setTimeout(() => void tick(), delay);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session, ontoHome, defaultPollMs, nonce]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{`onto watch error: ${error}`}</Text>
        <Text dimColor>[q]uit  [r]etry</Text>
      </Box>
    );
  }
  if (!vm) {
    return (
      <Text>{`loading ${session.pipeline} session ${session.sessionId}…`}</Text>
    );
  }
  return <WorkflowTree vm={vm} />;
}
