/**
 * SessionSelector — the `onto watch` entry screen when no session is given (or
 * `s` from a session view). Lists review/reconstruct sessions (most recent
 * first) with a cursor. Pure presentation: selection state is owned by the app.
 */
import { Box, Text } from "ink";
import type { SessionRef } from "../data/session-discovery.js";

function relativeAge(modifiedMs: number, nowMs: number): string {
  if (!modifiedMs) return "";
  const sec = Math.max(0, Math.round((nowMs - modifiedMs) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

export interface SessionSelectorProps {
  sessions: SessionRef[];
  selectedIndex: number;
  /** Injected for deterministic age rendering in tests. */
  nowMs?: number;
}

export function SessionSelector({
  sessions,
  selectedIndex,
  nowMs,
}: SessionSelectorProps): JSX.Element {
  const now = nowMs ?? Date.now();
  return (
    <Box flexDirection="column">
      <Text bold>onto watch · sessions</Text>
      {sessions.length === 0 ? (
        <Text dimColor>no review/reconstruct sessions found</Text>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {sessions.map((session, index) => {
            const active = index === selectedIndex;
            return (
              <Box key={`${session.pipeline}:${session.sessionRoot}`}>
                <Text {...(active ? { color: "cyan" } : {})}>
                  {`${active ? "›" : " "} ${session.pipeline.padEnd(11)} `}
                </Text>
                <Text bold={active}>{session.sessionId}</Text>
                <Text dimColor>{`  ${relativeAge(session.modifiedMs, now)}`}</Text>
              </Box>
            );
          })}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>[↑↓] select  [enter] watch  [q]uit</Text>
      </Box>
    </Box>
  );
}
