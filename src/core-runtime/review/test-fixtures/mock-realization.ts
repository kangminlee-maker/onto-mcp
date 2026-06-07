export {
  REVIEW_MOCK_REALIZATION_ENV,
} from "../../llm/mock-llm-realization.js";
import {
  REVIEW_MOCK_REALIZATION_ENV,
} from "../../llm/mock-llm-realization.js";

export const REVIEW_MOCK_MODEL_ID = "mock-model";
export const REVIEW_MOCK_OPENAI_MODEL_ID = "mock-openai-model";
export const REVIEW_MOCK_DETERMINISTIC_MODEL_ID = "mock-llm-deterministic";

type EnvTarget = NodeJS.ProcessEnv;

export function setTemporaryEnv(
  updates: Record<string, string | undefined>,
  env: EnvTarget = process.env,
): () => void {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(updates)) {
    previous.set(key, env[key]);
    const value = updates[key];
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }
  };
}

export function enableReviewMockRealizationEnv(
  env: EnvTarget = process.env,
): () => void {
  return setTemporaryEnv({ [REVIEW_MOCK_REALIZATION_ENV]: "1" }, env);
}

export function disableReviewMockRealizationEnv(
  env: EnvTarget = process.env,
): () => void {
  return setTemporaryEnv({ [REVIEW_MOCK_REALIZATION_ENV]: undefined }, env);
}

export function setReviewMockHookEnv(
  updates: Record<string, string | undefined>,
  env: EnvTarget = process.env,
): () => void {
  return setTemporaryEnv(updates, env);
}
