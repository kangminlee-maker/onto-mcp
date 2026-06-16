/**
 * Log screen — a tail of a session's `runtime-events.ndjson` (fed by the
 * event-follower in the app). Pure presentation: shows the most recent events
 * with timestamp · source · stream · message. Read-only.
 */
import { Box, Text } from "ink";
import type { RuntimeStreamEvent } from "../../core-api/runtime-observation.js";

function clockTime(timestamp: string): string {
  // Render only HH:MM:SS from an ISO timestamp without constructing a Date
  // (avoids locale/clock surprises and keeps it test-stable).
  const match = /T(\d{2}:\d{2}:\d{2})/.exec(timestamp);
  return match ? match[1]! : timestamp.slice(0, 8);
}

const STREAM_COLOR: Record<string, string | undefined> = {
  model_call: "magenta",
  status: undefined,
  chunk: "gray",
};

export interface LogScreenProps {
  sessionId: string;
  events: RuntimeStreamEvent[];
  /** Max lines to show (most recent). Default 18. */
  maxLines?: number;
}

export function LogScreen({
  sessionId,
  events,
  maxLines = 18,
}: LogScreenProps): JSX.Element {
  const tail = events.slice(-maxLines);
  return (
    <Box flexDirection="column">
      <Text bold>{`onto watch · ${sessionId} · log`}</Text>
      <Box flexDirection="column" marginTop={1}>
        {tail.length === 0 ? (
          <Text dimColor>no events yet</Text>
        ) : (
          tail.map((event, index) => {
            const sourceColor = STREAM_COLOR[event.stream];
            return (
              <Box key={index}>
                <Text dimColor>{`${clockTime(event.timestamp)}  `}</Text>
                <Text {...(sourceColor ? { color: sourceColor } : {})}>
                  {`${(event.source.label ?? event.source.kind).padEnd(16)} `}
                </Text>
                <Text>{event.message}</Text>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[tab] tree  [q]uit</Text>
      </Box>
    </Box>
  );
}
