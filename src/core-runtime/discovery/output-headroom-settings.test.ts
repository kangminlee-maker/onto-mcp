import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  mergeReconstructSettings,
  readSettingsAt,
  resolveReconstructSemanticAuthorLlmRuntimeSettings,
} from "./settings-chain.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function writeSettings(value: unknown): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-headroom-settings-"));
  roots.push(root);
  const file = path.join(root, "settings.json");
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

const llm = {
  provider: "openai" as const,
  auth: "api_key" as const,
  model: "gpt-5.5",
  effort: "low",
};

describe("reconstruct semantic-author output headroom settings", () => {
  it("preserves the semantic_author llm_runtime field through strict parsing", async () => {
    const file = await writeSettings({
      schema_version: "settings.json/v3",
      reconstruct: {
        execution: {
          actors: {
            semantic_author: {
              llm,
              llm_runtime: {
                openai_responses_output_headroom_tokens: 25_000,
              },
            },
          },
        },
      },
    });
    const settings = await readSettingsAt(file);
    expect(resolveReconstructSemanticAuthorLlmRuntimeSettings(settings)).toEqual({
      openai_responses_output_headroom_tokens: 25_000,
    });
  });

  it("rejects llm_runtime on non-semantic-author seats", async () => {
    const file = await writeSettings({
      schema_version: "settings.json/v3",
      reconstruct: {
        execution: {
          actors: {
            confirmation_provider: {
              llm,
              llm_runtime: {
                openai_responses_output_headroom_tokens: 25_000,
              },
            },
          },
        },
      },
    });
    await expect(readSettingsAt(file)).rejects.toThrow(
      /llm_runtime is currently supported only on semantic_author/,
    );
  });

  it("rejects non-positive and unsafe headroom values", async () => {
    for (const value of [0, -1, Number.MAX_SAFE_INTEGER + 1]) {
      const file = await writeSettings({
        schema_version: "settings.json/v3",
        reconstruct: {
          execution: {
            actors: {
              semantic_author: {
                llm,
                llm_runtime: {
                  openai_responses_output_headroom_tokens: value,
                },
              },
            },
          },
        },
      });
      await expect(readSettingsAt(file)).rejects.toThrow("Invalid onto settings");
    }
  });

  it("keeps whole-actor project replacement semantics", () => {
    const merged = mergeReconstructSettings(
      {
        execution: {
          actors: {
            semantic_author: {
              llm,
              llm_runtime: {
                openai_responses_output_headroom_tokens: 25_000,
              },
            },
          },
        },
      },
      {
        execution: {
          actors: {
            semantic_author: { llm: { ...llm, effort: "medium" } },
          },
        },
      },
    );
    expect(merged?.execution?.actors?.semantic_author?.llm_runtime).toBeUndefined();
  });
});
