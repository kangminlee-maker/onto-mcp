# Promoted probe evidence — what came from the root `benchmark/` working area, and what did not

Harnesses under `scripts/` write their raw output to `/benchmark/` at the repo root. That path is
**gitignored working space**: it is where a probe dumps everything, including things nobody will ever
read again. On 2026-07-29 it held 19 MB and was neither tracked nor ignored, while committed documents
already cited paths inside it — dangling references to a directory that only existed on one machine.

The rule now: **a document may only cite evidence that lives here.** Anything a design note, handoff or
comment points at gets promoted into `development-records/benchmark/<name>/`, preserving its relative
path. Everything else stays in the working area and is expected to be deleted.

## Promoted on 2026-07-29 (19 MB → 856 KB)

| Directory | What it evidences |
|---|---|
| `observation-read-pull-live/` | the live N=1 runs of the observation pull layer, including the delivery-reconciliation pass (design `20260727-observation-pull-layer-redesign/20-…` §7) |
| `tool-result-truncation/` | codex cutting an MCP tool result before the model sees it (design `…/05-…`) |
| `mcp-result-field-authority/` | which result field codex renders into the context (design `…/09-…`) |
| `ack-roundtrip/` | the ack round-trip measurement (design `…/10-…`) |
| `observation-facade-probe/` | facade arm-by-arm probe records |
| `reconciliation-review-r2/`, `reconciliation-review-r3/` | cross-verification review verdicts (design `…/15-…`, `…/18-…`, `…/19-…`) |
| `stage3a/` | the stage 3a mutation battery |

## Deliberately NOT promoted

Left in the working area because no document cites them and each is reproducible or bulky:

| Kind | Example | Why |
|---|---|---|
| Input copies | `observation-read-pull-live/*/source-observations.yaml` (3.8 MB × 3) | a copy of the fixture corpus the run was given, not a result of the run |
| Reviewer reasoning traces | `reconciliation-review-r*/…/stderr.txt` (0.5–1 MB each) | the verdict is `stdout.txt`, which IS promoted; the trace is the model thinking out loud |
| Large captures | `observation-facade-probe/…/model-request-capture.json` (584 KB) | superseded by the per-arm probe records that are promoted |
| Tool output paths | `run-reconstruct-decomposition/baseline*.json` (744 KB × 2) | cited only as a `--capture` destination for a harness to WRITE, never read as evidence |

The mechanical rule used was "files ≤ 100 KB", checked afterwards against every cited path: the largest
file any document names is 16 KB, so nothing cited was left behind.

## Regenerating

The working-area copies still exist on the machine that ran the probes and nowhere else. Nothing here
depends on them. To reproduce a measurement rather than read its record, run the harness named in the
corresponding design note under `scripts/`.
