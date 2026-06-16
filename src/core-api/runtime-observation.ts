/**
 * core-api re-export of the runtime event-stream surface, so consumers (the
 * `onto watch` TUI) depend on core-api only — never reaching into
 * core-runtime/observability directly. The event log is the append-only
 * `runtime-events.ndjson` produced by every review/reconstruct session.
 */
export {
  runtimeStreamEventLogPath,
} from "../core-runtime/observability/runtime-stream-observation.js";
export type {
  RuntimeStreamEvent,
  RuntimeObservationPipeline,
  RuntimeObservationSource,
  RuntimeObservationStream,
} from "../core-runtime/observability/runtime-stream-observation.js";
