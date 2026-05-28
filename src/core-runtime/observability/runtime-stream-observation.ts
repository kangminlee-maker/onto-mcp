import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";

export type RuntimeObservationPipeline = "review" | "reconstruct";

export type RuntimeObservationSourceKind =
  | "runtime"
  | "process"
  | "llm"
  | "artifact";

export type RuntimeObservationStream =
  | "stdout"
  | "stderr"
  | "status"
  | "artifact";

export interface RuntimeObservationSource {
  kind: RuntimeObservationSourceKind;
  label: string;
  unitId?: string;
  stageId?: string;
  processId?: number;
}

export interface RuntimeObservationContext {
  pipeline: RuntimeObservationPipeline;
  sessionRoot: string;
  source?: Partial<RuntimeObservationSource>;
}

export interface RuntimeStreamEvent {
  schema_version: 1;
  event_kind: "runtime_stream";
  timestamp: string;
  pipeline: RuntimeObservationPipeline;
  session_id: string;
  session_root: string;
  source: RuntimeObservationSource;
  stream: RuntimeObservationStream;
  message: string;
}

export interface RuntimeStreamEventInput {
  pipeline: RuntimeObservationPipeline;
  sessionRoot: string;
  source?: Partial<RuntimeObservationSource>;
  stream: RuntimeObservationStream;
  message: string;
  timestamp?: Date;
}

const runtimeObservationContext =
  new AsyncLocalStorage<RuntimeObservationContext>();

export function runtimeStreamEventLogPath(sessionRoot: string): string {
  return path.join(path.resolve(sessionRoot), "runtime-events.ndjson");
}

export function runWithRuntimeObservationContext<T>(
  context: RuntimeObservationContext,
  fn: () => T,
): T {
  const normalized: RuntimeObservationContext = {
    pipeline: context.pipeline,
    sessionRoot: path.resolve(context.sessionRoot),
    ...(context.source ? { source: context.source } : {}),
  };
  return runtimeObservationContext.run(normalized, fn);
}

function buildSource(
  source: Partial<RuntimeObservationSource> | undefined,
): RuntimeObservationSource {
  const result: RuntimeObservationSource = {
    kind: source?.kind ?? "runtime",
    label: source?.label ?? source?.kind ?? "runtime",
  };
  if (source?.unitId) result.unitId = source.unitId;
  if (source?.stageId) result.stageId = source.stageId;
  if (source?.processId !== undefined) result.processId = source.processId;
  return result;
}

function buildRuntimeStreamEvent(
  input: RuntimeStreamEventInput,
): RuntimeStreamEvent {
  const sessionRoot = path.resolve(input.sessionRoot);
  return {
    schema_version: 1,
    event_kind: "runtime_stream",
    timestamp: (input.timestamp ?? new Date()).toISOString(),
    pipeline: input.pipeline,
    session_id: path.basename(sessionRoot),
    session_root: sessionRoot,
    source: buildSource(input.source),
    stream: input.stream,
    message: input.message,
  };
}

export function appendRuntimeStreamEventSync(
  input: RuntimeStreamEventInput,
): void {
  try {
    const sessionRoot = path.resolve(input.sessionRoot);
    fs.mkdirSync(sessionRoot, { recursive: true });
    const event = buildRuntimeStreamEvent({ ...input, sessionRoot });
    fs.appendFileSync(
      runtimeStreamEventLogPath(sessionRoot),
      `${JSON.stringify(event)}\n`,
      "utf8",
    );
  } catch {
    // Observation is operational; it must never affect pipeline execution.
  }
}

export function appendRuntimeStreamChunkSync(
  input: Omit<RuntimeStreamEventInput, "message">,
  chunk: Buffer | string,
): void {
  const text = String(chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    appendRuntimeStreamEventSync({
      ...input,
      message: line,
    });
  }
}

export function appendRuntimeStatusEventSync(args: {
  pipeline: RuntimeObservationPipeline;
  sessionRoot: string;
  sourceLabel: string;
  message: string;
  sourceKind?: RuntimeObservationSourceKind;
  stageId?: string;
}): void {
  appendRuntimeStreamEventSync({
    pipeline: args.pipeline,
    sessionRoot: args.sessionRoot,
    source: {
      kind: args.sourceKind ?? "runtime",
      label: args.sourceLabel,
      ...(args.stageId ? { stageId: args.stageId } : {}),
    },
    stream: "status",
    message: args.message,
  });
}

export function appendRuntimeModelCallLogFromCurrentContext(line: string): void {
  const context = runtimeObservationContext.getStore();
  if (!context) return;
  appendRuntimeStreamEventSync({
    pipeline: context.pipeline,
    sessionRoot: context.sessionRoot,
    source: {
      kind: "llm",
      label: context.source?.label ?? "model-call",
      ...(context.source?.unitId ? { unitId: context.source.unitId } : {}),
      ...(context.source?.stageId ? { stageId: context.source.stageId } : {}),
    },
    stream: "stderr",
    message: `[model-call] ${line}`,
  });
}

export function appendRuntimeStreamChunkFromCurrentContextSync(
  stream: RuntimeObservationStream,
  chunk: Buffer | string,
  source?: Partial<RuntimeObservationSource>,
): void {
  const context = runtimeObservationContext.getStore();
  if (!context) return;
  const mergedSource: Partial<RuntimeObservationSource> = {
    kind: source?.kind ?? context.source?.kind ?? "runtime",
    label: source?.label ?? context.source?.label ?? "runtime",
  };
  const unitId = source?.unitId ?? context.source?.unitId;
  if (unitId) mergedSource.unitId = unitId;
  const stageId = source?.stageId ?? context.source?.stageId;
  if (stageId) mergedSource.stageId = stageId;
  const processId = source?.processId ?? context.source?.processId;
  if (processId !== undefined) mergedSource.processId = processId;
  appendRuntimeStreamChunkSync(
    {
      pipeline: context.pipeline,
      sessionRoot: context.sessionRoot,
      source: mergedSource,
      stream,
    },
    chunk,
  );
}
