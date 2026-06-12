/**
 * G2 — 스펙 경계 값 하드코딩 스캐너 (INV-AUTH-1, INV-CFG-1).
 *
 * 운영 코드(src/** 중 테스트·mock boundary 제외)에서 settings chain 밖의
 * effort/auth/모델 리터럴 "기본값"을 탐지한다. 발견 시 비-0 종료.
 *
 * 스펙이 인가한 정규화 지점(예: model-switcher의 defaultAuthFor — INV-AUTH-1
 * 수용 기준이 명시; G3 invariant 테스트가 고정)은 WAIVERS에 사유와 함께
 * 등록한다. waiver는 출력에 항상 표시되어 조용히 늘어나지 못하며, 더 이상
 * 매칭되지 않는 waiver는 stale로 실패한다.
 *
 * npm: `check:spec-defaults`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SRC_ROOT = path.join(PROJECT_ROOT, "src");

interface Detection {
  file: string;
  line: number;
  text: string;
  kind: "model_literal" | "effort_default" | "auth_default" | "retry_default";
}

interface Waiver {
  file: string;
  /** 라인 본문에 대한 매칭 — waiver는 정확한 코드 모양에 묶인다. */
  linePattern: RegExp;
  reason: string;
}

/**
 * 스펙 인가 지점. 새 항목 추가는 INV-CFG-1/INV-AUTH-1 검토(사용자 확인)를
 * 거친다 — waiver 추가 자체가 보호 키 성격의 변경이다.
 */
const WAIVERS: Waiver[] = [
  {
    file: "src/core-runtime/llm/model-switcher.ts",
    linePattern: /if \(provider === "openai"\) return "oauth";/,
    reason:
      "INV-AUTH-1 수용 기준이 명시한 정규화: provider=openai의 auth 생략은 OAuth다 (invariant 테스트로 고정).",
  },
  {
    file: "src/core-runtime/llm/model-switcher.ts",
    linePattern: /if \(provider === "lmstudio"\) return "local";/,
    reason: "lmstudio는 local 전용 — 스위처 검증 규칙과 동일한 정규화.",
  },
  {
    file: "src/core-runtime/llm/model-switcher.ts",
    linePattern: /return "api_key";$/,
    reason: "defaultAuthFor의 나머지 provider 정규화 (스위처 명세).",
  },
  {
    file: "src/core-runtime/review/review-execution-route.ts",
    linePattern: /if \(provider === "lmstudio"\) return "local";/,
    reason: "route 투영의 lmstudio 정규화 (스위처 명세 미러).",
  },
  {
    file: "src/core-runtime/review/review-execution-route.ts",
    linePattern: /auth_mode: profile\.auth \?\? "oauth",/,
    reason:
      "subscription worker route(codex/claude_code) 투영의 auth_mode — INV-AUTH-1(워커 기본 인증 oauth)의 투영 정규화.",
  },
  {
    file: "src/core-runtime/review/materializers.ts",
    linePattern: /if \(hostRuntime === "lmstudio"\) return "local";/,
    reason: "실행 컨텍스트 기반 auth 추론의 lmstudio 정규화.",
  },
  {
    file: "src/core-runtime/review/materializers.ts",
    linePattern: /if \(executionRealization === "direct-call"\) return "api_key";/,
    reason: "direct-call 실행 컨텍스트의 auth 추론 (api 직호출 = api_key).",
  },
  {
    file: "src/core-runtime/review/materializers.ts",
    linePattern: /^return "oauth";$/,
    reason:
      "defaultAuthForExecutionContext의 worker 컨텍스트 정규화 — INV-AUTH-1.",
  },
  {
    file: "src/mcp/server.ts",
    linePattern: /"model": "gpt-5\.5"/,
    reason:
      "onto://usage 리소스의 settings.json 예시 텍스트 — 런타임 기본값이 아닌 사용자 문서.",
  },
  {
    file: "src/core-runtime/reconstruct/run.ts",
    linePattern: /retryLlmConfig\.reasoning_effort = "medium";/,
    reason:
      "타임아웃 재시도 de-escalation 정책 상수(high→medium minimal-kernel 재시도) — settings 기본값이 아닌 bounded retry 정책. settings 이관은 별도 결정.",
  },
  {
    file: "src/core-runtime/discovery/settings-chain.ts",
    linePattern:
      /^(?:lens_|issue_artifact_|deliberation_|synthesis_)?(?:max_retries|retry_initial_delay_ms):\s*(?:\d+|DEFAULT_REVIEW_RETRY_SETTINGS\.retry_initial_delay_ms),$/,
    reason:
      "settings chain의 resolved-shape 완성 기본값 — settings 권위 모듈 자체가 소유하는 canonical 완성값. 변경은 G4 보호 대상(INVARIANT-CHANGE 마커 필요).",
  },
];

const MODEL_LITERAL_RE =
  /["'](gpt-[0-9][\w.-]*|claude-(?:opus|sonnet|haiku|fable|mythos)[\w.-]*|gemini-[0-9][\w.-]*|o[134](?:-mini|-pro)?)["']/;
// 할당형(`=`/`??`)은 타입 유니언이 같은 라인에 있어도 기본값이다
// (예: `const effort: "low" | "medium" = cfg.effort ?? "medium"`). 유니언
// 문맥 제외는 object-literal/타입 표기 형태(`:`)에만 적용한다.
const EFFORT_ASSIGN_RE =
  /(?:effort\w*|reasoning_effort)\s*(?:=|\?\?)\s*["'](?:minimal|low|medium|high|xhigh)["']/;
const EFFORT_OBJECT_RE =
  /(?:effort\w*|reasoning_effort)\s*:\s*["'](?:minimal|low|medium|high|xhigh)["']/;
const AUTH_ASSIGN_RE =
  /(?:\bauth\w*\s*(?:=|\?\?)\s*["'](?:oauth|api_key|local)["']|return\s+["'](?:oauth|api_key|local)["'])/;
const AUTH_OBJECT_RE = /\bauth\w*\s*:\s*["'](?:oauth|api_key|local)["']/;
/** 타입 유니언 문맥(`"a" | "b"`)은 vocabulary 정의지 기본값이 아니다. */
const TYPE_UNION_CONTEXT_RE = /["']\s*\||\|\s*["']/;
const RETRY_DEFAULT_RE =
  /(?:max_retries|retry_initial_delay_ms|maxRetries|retryInitialDelayMs)\w*\s*(?:=|\?\?|:)\s*[0-9]/;

function isCommentLine(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function isExcludedFile(relPath: string): boolean {
  return (
    relPath.endsWith(".test.ts") ||
    relPath.includes("/test-fixtures/") ||
    relPath.endsWith("/mock-llm-realization.ts")
  );
}

async function listSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listSourceFiles(full)));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

async function main(): Promise<void> {
  const detections: Detection[] = [];
  for (const file of await listSourceFiles(SRC_ROOT)) {
    const relPath = path.relative(PROJECT_ROOT, file).split(path.sep).join("/");
    if (isExcludedFile(relPath)) continue;
    const lines = (await fs.readFile(file, "utf8")).split("\n");
    lines.forEach((text, index) => {
      if (isCommentLine(text)) return;
      const push = (kind: Detection["kind"]) =>
        detections.push({ file: relPath, line: index + 1, text: text.trim(), kind });
      if (MODEL_LITERAL_RE.test(text)) push("model_literal");
      const isTypeUnionContext = TYPE_UNION_CONTEXT_RE.test(text);
      if (
        EFFORT_ASSIGN_RE.test(text) ||
        (!isTypeUnionContext && EFFORT_OBJECT_RE.test(text))
      ) {
        push("effort_default");
      }
      if (
        AUTH_ASSIGN_RE.test(text) ||
        (!isTypeUnionContext && AUTH_OBJECT_RE.test(text))
      ) {
        push("auth_default");
      }
      if (RETRY_DEFAULT_RE.test(text)) push("retry_default");
    });
  }

  const matchedWaivers = new Set<Waiver>();
  const violations = detections.filter((d) => {
    const waiver = WAIVERS.find(
      (w) => w.file === d.file && w.linePattern.test(d.text),
    );
    if (waiver) {
      matchedWaivers.add(waiver);
      return false;
    }
    return true;
  });
  const staleWaivers = WAIVERS.filter((w) => !matchedWaivers.has(w));

  if (violations.length > 0 || staleWaivers.length > 0) {
    console.error("[check:spec-defaults] FAIL");
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} [${v.kind}] ${v.text}`);
    }
    for (const w of staleWaivers) {
      console.error(
        `  stale waiver (no longer matches): ${w.file} :: ${w.linePattern}`,
      );
    }
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        check: "spec-defaults",
        status: "passed",
        detection_kinds: [
          "model_literal",
          "effort_default",
          "auth_default",
          "retry_default",
        ],
        waivers: WAIVERS.map((w) => ({ file: w.file, reason: w.reason })),
      },
      null,
      2,
    ),
  );
}

await main();
