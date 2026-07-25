/**
 * runReconstruct 행동 등가 하니스 — 분해가 **산출물을 바꾸지 않았음**을 증명한다.
 *
 * 왜 필요한가: runReconstruct 분해는 순수 이동이 아니라 바이트 동일성 증명이 무효화된다.
 * 추출된 블록 본문은 `run-block-identity.mts`가 지키지만, **래퍼**(블록이 빠지고 호출문이
 * 들어간 runReconstruct 본문)는 바이트로 증명할 수 없다. 그 자리를 이 하니스가 메운다.
 *
 * 기존 안전망이 부족하다는 실측이 착수 근거다: runReconstruct를 in-process로 완주시키는
 * 테스트는 14회 있지만 **최종 산출물에 대한 단정이 2건**뿐이었고 mock-realization 테스트는
 * 0건이었다(설계 §3.1). 그래서 "완주했다"가 아니라 "세션 산출물 전체가 같다"를 본다.
 *
 * 방법: `ONTO_LLM_MOCK=1` 결정론 경로로 골든 픽스처를 완주시키고, 세션 루트의 **모든 파일**을
 * 상대경로·정규화된 내용·sha256으로 스냅샷한다. 분해 전/후 스냅샷이 같아야 한다.
 *
 * 휘발 필드는 **추측하지 않는다**: `--calibrate`가 같은 코드로 두 번 돌려 실제로 달라지는
 * 것만 찾아낸다. 정규화 규칙(VOLATILE_RULES)은 그 실측에서 나온 것이다.
 *
 * 실행:
 *   npx tsx scripts/run-reconstruct-equivalence.mts --calibrate       # 휘발 필드 실측(2회 실행)
 *   npx tsx scripts/run-reconstruct-equivalence.mts --capture <out.json>
 *   npx tsx scripts/run-reconstruct-equivalence.mts --compare <a.json> <b.json>
 *   npx tsx scripts/run-reconstruct-equivalence.mts --self-check <a.json>  # 하니스가 실패할 수 있는지
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOntoReconstructCoreApi } from "../src/core-api/reconstruct-api.ts";
import { reconstructGoldenFixtureSpec } from "../src/core-runtime/reconstruct/semantic-quality-gate.ts";

const FIXTURE_ID = "reconstruct-golden-target-v1";
/**
 * **고정** projectRoot. `mkdtemp`를 쓰면 안 된다: observation id가
 * `sha256(path.resolve(sourceRef) + location)`(materialize-preparation.ts)이라 임시 경로가
 * 매 실행 달라지면 id가 바뀌고 그것이 모든 artifact sha256으로 전파된다(캘리브레이션에서
 * 70건 차이로 실측). sha256을 정규화로 지우면 정작 비교하려는 신호를 잃으므로, 경로를
 * 고정해 **비결정성 자체를 없앤다**. 매 실행 전에 지우고 다시 만든다.
 * 한계: 이 하니스를 동시에 두 번 돌리면 충돌한다(수동 실행 도구라 수용).
 */
const FIXED_PROJECT_ROOT = path.join(os.tmpdir(), "onto-reconstruct-equiv-fixed");

/**
 * 실행마다 달라지는 값들 — `--calibrate` 실측 결과에서 나온 규칙만 넣는다.
 * 규칙을 넓게 잡으면 하니스가 실제 회귀도 흡수해버리므로, 각 항목은 **왜 휘발인지** 적는다.
 */
interface VolatileRule {
  readonly why: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}
const VOLATILE_RULES: readonly VolatileRule[] = [
  {
    why: "세션 id는 실행 시각에서 파생된다",
    pattern: /\b\d{8}-[0-9a-f]{6,8}\b/g,
    replacement: "<SESSION_ID>",
  },
  {
    why: "ISO 타임스탬프",
    pattern: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g,
    replacement: "<TS>",
  },
  {
    // 경로는 고정이므로 실행 간에는 안 바뀐다. 스냅샷을 머신 간에 옮길 수 있게 토큰화만 한다.
    why: "고정 projectRoot 절대경로 — 머신 간 이식성",
    pattern: /\/(?:private\/)?(?:var|tmp)\/[^\s"']*onto-reconstruct-equiv-fixed[^\s"',)]*/g,
    replacement: "<PROJECT_ROOT>",
  },
  {
    why: "경과 시간·소요 ms",
    pattern: /"(elapsed_ms|duration_ms|wall_time_ms)"\s*:\s*\d+/g,
    replacement: '"$1": <MS>',
  },
  {
    why: "YAML 형태의 경과 시간",
    pattern: /^(\s*(?:elapsed_ms|duration_ms|wall_time_ms)):\s*\d+$/gm,
    replacement: "$1: <MS>",
  },
];

/**
 * sha256 다이제스트 처리 — 뭉개지 않고 **첫 등장 순서로 색인**한다.
 *
 * 캘리브레이션 실측: 같은 코드 2회 실행에서 남는 차이는 전부 64-hex 다이제스트였다
 * (`artifact_sha256` · `reuse_match_hash` · `source_reconstruct_record_sha256` · manifest의
 * `sha256:` …). 원인은 그 다이제스트들이 **타임스탬프를 포함한 내용**을 digest하기 때문이고,
 * 정작 그 내용 자체는 이 스냅샷이 직접 비교한다 — 절대값은 중복 신호다.
 *
 * 그래도 `<SHA>` 하나로 뭉개면 "A와 B가 같은 다이제스트였다"는 **관계**가 사라진다. 블록
 * 추출이 해시 입력을 뒤섞으면 그 관계가 깨지는데 뭉갠 비교는 못 잡는다. 그래서 파일 안에서
 * 등장 순서대로 `<SHA:1>`, `<SHA:2>` … 를 부여해 동일성 패턴을 보존한다.
 */
function indexPattern(text: string, re: RegExp, label: string): string {
  const seen = new Map<string, string>();
  return text.replace(re, (m) => {
    const known = seen.get(m);
    if (known !== undefined) return known;
    const token = `<${label}:${seen.size + 1}>`;
    seen.set(m, token);
    return token;
  });
}

/**
 * 색인 대상 — **캘리브레이션이 실제로 달라진다고 보여준 것만** 넣는다. 규칙마다 왜 휘발인지 적는다.
 */
const INDEXED_PATTERNS: readonly { readonly why: string; readonly re: RegExp; readonly label: string }[] = [
  {
    why: "타임스탬프를 포함한 내용의 다이제스트 — 내용 자체는 이 스냅샷이 직접 비교한다",
    re: /\b[0-9a-f]{64}\b/g,
    label: "SHA",
  },
  {
    why:
      "attempt/resume/lock/write id는 모두 `crypto.randomUUID()` 한 계보에서 파생된다 " +
      "(run-control-validation.ts: resumeId ← randomUUID, attemptId ← resumeId, " +
      "transactionId ← `idFor(\"write\", `${attemptId}:${artifactRef}`)`) — 매 시도 고유해야 하는 설계상 휘발값",
    re: /\b(?:attempt|resume|lock|write):[0-9a-f]{16}\b/g,
    label: "ATTEMPT",
  },
];

function normalize(text: string): string {
  let out = text;
  for (const r of VOLATILE_RULES) out = out.replace(r.pattern, r.replacement);
  for (const p of INDEXED_PATTERNS) out = indexPattern(out, p.re, p.label);
  return out;
}

const sha256 = (s: string): string => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

interface Snapshot {
  readonly fixture: string;
  readonly status: string;
  readonly files: Record<string, { readonly sha: string; readonly bytes: number }>;
  /** 정규화 후 내용. 차이가 났을 때 어디가 다른지 보여주기 위해 담는다. */
  readonly contents: Record<string, string>;
}

// ------------------------------------------------------------------ 실행

async function collect(dir: string, base: string, out: Map<string, string>): Promise<void> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await collect(p, base, out);
      continue;
    }
    const rel = path.relative(base, p);
    out.set(rel, await fs.readFile(p, "utf8"));
  }
}

async function runOnce(label: string): Promise<Snapshot> {
  const projectRoot = FIXED_PROJECT_ROOT;
  await fs.rm(projectRoot, { recursive: true, force: true });
  await fs.mkdir(projectRoot, { recursive: true });
  const spec = reconstructGoldenFixtureSpec(FIXTURE_ID);
  for (const [rel, content] of Object.entries(spec.files)) {
    const fp = path.join(projectRoot, rel);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, content, "utf8");
  }
  const isolatedHome = path.join(projectRoot, "home");
  await fs.mkdir(isolatedHome, { recursive: true });
  const sessionRoot = path.join(projectRoot, "session");

  const prev = {
    ONTO_LLM_MOCK: process.env.ONTO_LLM_MOCK,
    ONTO_RUNTIME_WATCHER: process.env.ONTO_RUNTIME_WATCHER,
    HOME: process.env.HOME,
  };
  process.env.ONTO_LLM_MOCK = "1";
  process.env.ONTO_RUNTIME_WATCHER = "0";
  process.env.HOME = isolatedHome;
  let status: string;
  try {
    const api = createOntoReconstructCoreApi({ ontoHome: path.resolve(".") });
    const result = await api.runReconstruct({
      projectRoot,
      targetRefs: [spec.target_path],
      sessionRoot,
      intent: spec.intent,
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
    });
    status = result.status;
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  const raw = new Map<string, string>();
  if (!fsSync.existsSync(sessionRoot)) throw new Error(`세션 루트가 만들어지지 않았다: ${sessionRoot}`);
  await collect(sessionRoot, sessionRoot, raw);
  if (raw.size === 0) throw new Error("세션 산출물이 0개다 — 하니스가 아무것도 보지 못한다(공허)");

  const files: Record<string, { sha: string; bytes: number }> = {};
  const contents: Record<string, string> = {};
  for (const [rel, text] of [...raw.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const n = normalize(text);
    files[rel] = { sha: sha256(n), bytes: n.length };
    contents[rel] = n;
  }
  console.error(`  [${label}] status=${status} · 산출 파일 ${raw.size}개`);
  await fs.rm(projectRoot, { recursive: true, force: true });
  return { fixture: FIXTURE_ID, status, files, contents };
}

// ------------------------------------------------------------------ 비교

interface Diff { readonly kind: "only_a" | "only_b" | "changed" | "status"; readonly what: string; readonly detail?: string }

function compare(a: Snapshot, b: Snapshot): Diff[] {
  const out: Diff[] = [];
  if (a.status !== b.status) out.push({ kind: "status", what: `status ${a.status} → ${b.status}` });
  const keys = new Set([...Object.keys(a.files), ...Object.keys(b.files)]);
  for (const k of [...keys].sort()) {
    const fa = a.files[k];
    const fb = b.files[k];
    if (fa && !fb) { out.push({ kind: "only_a", what: k }); continue; }
    if (!fa && fb) { out.push({ kind: "only_b", what: k }); continue; }
    if (fa && fb && fa.sha !== fb.sha) {
      const ca = a.contents[k] ?? "";
      const cb = b.contents[k] ?? "";
      const la = ca.split("\n");
      const lb = cb.split("\n");
      let i = 0;
      while (i < Math.min(la.length, lb.length) && la[i] === lb[i]) i += 1;
      out.push({
        kind: "changed",
        what: k,
        detail: `첫 차이 ${i + 1}번째 줄\n      A: ${JSON.stringify((la[i] ?? "").slice(0, 120))}\n      B: ${JSON.stringify((lb[i] ?? "").slice(0, 120))}`,
      });
    }
  }
  return out;
}

function reportDiffs(diffs: readonly Diff[]): void {
  for (const d of diffs) {
    console.log(`  [${d.kind}] ${d.what}`);
    if (d.detail) console.log(`      ${d.detail}`);
  }
}

// ------------------------------------------------------------------ 진입

const argv = process.argv.slice(2);
const flagValue = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (argv.includes("--calibrate")) {
  console.log("같은 코드로 2회 실행해 **실제로 달라지는 것**만 찾는다 (휘발 필드 실측).\n");
  const a = await runOnce("run-1");
  const b = await runOnce("run-2");
  const diffs = compare(a, b);
  console.log(`\n정규화 규칙 ${VOLATILE_RULES.length}개 적용 후 잔여 차이: ${diffs.length}건`);
  if (diffs.length > 0) {
    reportDiffs(diffs);
    console.error(
      "\n!! 같은 코드인데 산출물이 다르다 — 이 상태로는 등가 비교가 불가능하다.\n" +
        "   위 차이를 보고 VOLATILE_RULES를 추가하라(규칙마다 왜 휘발인지 적어라).",
    );
    process.exit(1);
  }
  console.log(`\nPASS — 같은 코드의 2회 실행이 산출물 ${Object.keys(a.files).length}개에서 완전히 일치한다.`);
  console.log("        이제 분해 전/후 비교가 의미를 갖는다.");
  process.exit(0);
}

const captureTo = flagValue("--capture");
if (captureTo !== undefined) {
  const snap = await runOnce("capture");
  await fs.writeFile(captureTo, JSON.stringify(snap, null, 2), "utf8");
  console.log(`스냅샷 저장: ${captureTo} (파일 ${Object.keys(snap.files).length}개 · status=${snap.status})`);
  process.exit(0);
}

if (argv.includes("--compare")) {
  const i = argv.indexOf("--compare");
  const pa = argv[i + 1];
  const pb = argv[i + 2];
  if (!pa || !pb) { console.error("사용법: --compare <a.json> <b.json>"); process.exit(2); }
  const a = JSON.parse(await fs.readFile(pa, "utf8")) as Snapshot;
  const b = JSON.parse(await fs.readFile(pb, "utf8")) as Snapshot;
  const na = Object.keys(a.files).length;
  if (na === 0) { console.error("!! 기준 스냅샷의 파일이 0개다 — 공허 비교"); process.exit(1); }
  const diffs = compare(a, b);
  console.log(`기준 ${pa}: 파일 ${na}개 · status=${a.status}`);
  console.log(`대상 ${pb}: 파일 ${Object.keys(b.files).length}개 · status=${b.status}`);
  if (diffs.length > 0) {
    console.log(`\n=== 차이 ${diffs.length}건 ===`);
    reportDiffs(diffs);
    console.error(`\nFAIL — 산출물이 달라졌다. 분해가 행동을 바꿨다.`);
    process.exit(1);
  }
  console.log(`\nPASS — 산출물 ${na}개가 완전히 일치한다.`);
  process.exit(0);
}

if (argv.includes("--self-check")) {
  // 하니스가 **실패할 수 있는지** 확인한다. 기준 스냅샷을 한 글자 훼손해 비교가 FAIL하는지 본다.
  const base = flagValue("--self-check");
  if (!base) { console.error("사용법: --self-check <baseline.json>"); process.exit(2); }
  const a = JSON.parse(await fsSync.promises.readFile(base, "utf8")) as Snapshot;
  const firstKey = Object.keys(a.files).sort()[0];
  if (!firstKey) { console.error("!! 기준 스냅샷이 비어 있다"); process.exit(1); }
  const tampered: Snapshot = {
    ...a,
    files: { ...a.files, [firstKey]: { ...(a.files[firstKey] as { sha: string; bytes: number }), sha: "TAMPERED" } },
    contents: { ...a.contents, [firstKey]: `${a.contents[firstKey] ?? ""}\n# tampered` },
  };
  const diffs = compare(a, tampered);
  console.log(`기준 파일 ${Object.keys(a.files).length}개 중 '${firstKey}' 한 건을 훼손해 비교했다.`);
  if (diffs.length === 0) {
    console.error("!! 훼손했는데 차이를 못 잡았다 — 이 하니스는 아무것도 증명하지 않는다.");
    process.exit(1);
  }
  console.log(`PASS — 훼손을 ${diffs.length}건으로 잡았다. 하니스는 실패할 수 있다.`);
  reportDiffs(diffs);
  process.exit(0);
}

console.error(
  "사용법:\n" +
    "  --calibrate                  같은 코드 2회 실행으로 휘발 필드 실측\n" +
    "  --capture <out.json>         스냅샷 1회 저장\n" +
    "  --compare <a.json> <b.json>  두 스냅샷 비교 (다르면 exit 1)\n" +
    "  --self-check <a.json>        하니스가 실패할 수 있는지 확인",
);
process.exit(2);
