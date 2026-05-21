import type { ReviewUnitKind } from "../core-runtime/review/artifact-types.js";

export type OntoDeliberationMode =
  | "controlled_lens_deliberation";

export interface OntoProviderCapabilities {
  independentContexts: boolean;
  persistentAgents: boolean;
  crossProcessMessaging: boolean;
  maxParallel: number;
}

export interface ReviewUnitPacketRef {
  unitId: string;
  unitKind: ReviewUnitKind;
  packetPath: string;
  outputPath: string;
}

export interface ReviewUnitResult {
  unitId: string;
  unitKind: ReviewUnitKind;
  outputPath: string;
  status: "completed" | "failed";
  errorMessage?: string;
}

export interface DeliberationRequest {
  sessionId: string;
  sessionRoot: string;
  lensIds: string[];
  round1OutputPaths: Record<string, string>;
  requestedMode: OntoDeliberationMode;
  outputPath: string;
}

export interface DeliberationResult {
  actualMode: OntoDeliberationMode;
  outputPath: string;
  perLensResponsePaths: Record<string, string>;
}

export interface OntoExecutionProvider {
  capabilities(): Promise<OntoProviderCapabilities> | OntoProviderCapabilities;
  runLens(packet: ReviewUnitPacketRef): Promise<ReviewUnitResult>;
  deliberate?(request: DeliberationRequest): Promise<DeliberationResult>;
  synthesize?(packet: ReviewUnitPacketRef): Promise<ReviewUnitResult>;
}
