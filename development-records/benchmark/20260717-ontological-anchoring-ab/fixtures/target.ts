export interface ReviewPipelineInput {
  lensId: string;
  packetBytes: number;
  outputBytes: number;
}

export function summarizeReviewPipeline(inputs: ReviewPipelineInput[]): string {
  const totalPacketBytes = inputs.reduce((sum, input) => sum + input.packetBytes, 0);
  const totalOutputBytes = inputs.reduce((sum, input) => sum + input.outputBytes, 0);
  return `packet=${totalPacketBytes}; output=${totalOutputBytes}; units=${inputs.length}`;
}

export function unstableFormat(value: unknown): string {
  return JSON.stringify(value);
}
