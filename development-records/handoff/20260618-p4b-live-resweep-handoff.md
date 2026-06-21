# Handoff — P4b 라이브 재-sweep (golden 매처 fix 반영) 이어가기

> 목적: `/clear` 직후 fresh context에서 **P4b 라이브 재-sweep**을 바로 이어가기 위한 출발점.
> S1·map·golden-매처-fix는 머지 완료. 이 핸드오프는 "어디서·무엇을·어떻게 검증·다음 결정"만 잡는다.
> 사용자 선택 = **gpt-5.5 재-sweep (권장)**.

## 0. 작업 위치 / 환경

- **세션 cwd = 메인 repo** `/Users/kangmin/cowork/onto-mcp-claude`, **branch `main` = `8ebb3c5`** (재-sweep은 main에서. 새 코드 작성 시에만 브랜치).
- 다른 워크트리(onto-mcp-closure=tui-watch, onto-mcp-spreadsheet=spreadsheet-followup)는 **무접촉**.
- **라이브 경로(검증됨)**: gpt-5.5 via **codex_cli OAuth** — `codex login status` = "Logged in using ChatGPT" (구독 과금, per-token $ 아님). `.onto/settings.json` + `~/.onto/settings.json` 의 reconstruct/review unit 모델 = **gpt-5.5** 이미 설정됨 → **추가 설정 0으로 라이브 실행 가능**.
- **opus 경로(미설정)**: settings 모델을 `claude-opus-4-8`(oauth)로 + `ONTO_CLAUDE_BIN=claude-2`(또는 claude-3) 필요. `claude` 단독은 stub alias(echo 경고)라 불가. **opus 전환은 별도 결정 후**.

## 1. 직전까지의 결론 (왜 재-sweep인가)

- **P4b 파일럿**(gpt-5.5, low/med/high × 2 fixtures, 6런)이 **전체 흐름**(라이브 sweep → `calibration:effort:report` → git-tracked `effort_profile`)을 끝까지 검증. 단 **frontier 공백**(minViable=null).
- **진단**: golden gate(`src/core-runtime/reconstruct/semantic-quality-gate.ts`)는 **all-or-nothing**(q1 recall=1 ∧ q2 support=1 ∧ q3 dropped=0). q1이 모든 effort서 `fixture-source-binding` 1개 고정 누락 → 원인 = **golden 매처 편향**(gpt-5.5가 유효 source binding 2개를 정상 authored했으나 매처가 mock의 `binding-fixture-source` id에 맞춘 좁은 substring으로 탈락). q2 support(0.5→0.75)·run 변동성은 **별개 일부 실제 갭**.
- **매처 편향 수정 = PR #91 MERGED(main `b3517c2`)**: 타깃 object type을 **NAME으로 식별** 후 binding을 **`seed_ref == object_type_id` 정확일치**로 연결(모델-선택 id에 substring 안 돌림) + `source_ref` 필수 + Q2 binding-CQ는 **exact binding-id 참조**로 지원. Codex 6라운드 수렴→clean "Bravo".
- ⇒ **재-sweep 목적**: 매처 fix 반영 라이브 재실행으로 **q1 recall→1.0 확인** + 남은 **q2/안정성 갭을 실데이터로 분리**. (gate all-or-nothing이라 q1이 풀려도 q2/변동성으로 gpt-5.5가 여전히 미통과일 수 있음 — 그게 정상 관찰 결과.)

## 2. 재-sweep 실행 (그대로 복붙 가능)

> 벤치 하니스: `--runs N`은 **fixture당** 반복 → 기본 2 fixtures × `--runs 1` = effort당 2런. 1런 ≈ 10분(고effort 더 김). 파일럿(6런) ≈ ~1시간. **백그라운드 실행 + 완료 알림** 패턴 사용.

빠른 확인(선택, ~10분): 1런 `--keep-tmp`로 seed 보존 후 q1에서 `fixture-source-binding`이 이제 매칭되는지 즉시 확인 가능. 단 frontier(multi-effort)는 풀 sweep 필요.

풀 재-sweep (단일 백그라운드 스크립트):
```bash
mkdir -p /tmp/p4b-resweep
cat > /tmp/p4b-resweep/run.sh <<'SH'
#!/bin/zsh
set -u; cd /Users/kangmin/cowork/onto-mcp-claude; OUT=/tmp/p4b-resweep
echo "START $(date -u +%H:%M:%SZ)"
for E in low medium high; do
  echo "=== effort=$E $(date -u +%H:%M:%SZ) ==="
  npm run benchmark:reconstruct:pipeline -- --realization live --effort "$E" --runs 1 \
    --output "$OUT/recon-$E.json" 2>&1 | grep -vE '^\[model-call\]' | tail -6
done
npm run calibration:effort:report -- \
  --reconstruct-report "author:low:$OUT/recon-low.json" \
  --reconstruct-report "author:medium:$OUT/recon-medium.json" \
  --reconstruct-report "author:high:$OUT/recon-high.json" \
  --provider openai --model gpt-5.5 --route codex_cli --allow-preliminary \
  --output "$OUT/effort-profile.json" 2>&1 | tail -30
echo "END $(date -u +%H:%M:%SZ)"
SH
chmod +x /tmp/p4b-resweep/run.sh && zsh /tmp/p4b-resweep/run.sh   # run_in_background:true
```
주의:
- `--provider openai` (derived model_provider="openai" 와 일치 — S1.3 fail-loud). `--route codex_cli` (witnessed adapter와 corroborate). `--allow-preliminary` (effort당 2런 < 3 = decision-grade 미달, 파일럿이므로 OK).
- effort 그리드는 low/med/high (gpt-5.5는 `max` 미지원; xhigh는 최장이라 파일럿 제외).

## 3. 검증 (재-sweep 후 확인할 것)

각 `recon-$E.json` 의 `runs[].quality_gate` 와 `effort-profile.json` 에서:
```bash
for E in low medium high; do node -e '
const r=require("/tmp/p4b-resweep/recon-'$E'.json");
for(const x of r.runs||[]){const g=x.quality_gate||{};console.log("'$E'",x.fixture_id,"applied="+x.metadata?.applied_effort,"gate="+g.status,"q1="+(g.q1?.recall),"missing="+JSON.stringify(g.q1?.missing_concept_keys),"q2="+(g.q2?.support_rate));}'; done
node -e 'const p=require("/tmp/p4b-resweep/effort-profile.json");console.log("route_identities",JSON.stringify(p.route_identities),"completeness",p.route_completeness);for(const s of p.stages)console.log(s.stage,"minViable="+s.minViableEffort,"recommended="+s.recommendedEffort,"\n  rationale:",s.rationale);'
```
기대/판정:
- **q1**: `missing_concept_keys` 에서 `fixture-source-binding` 이 **사라져야** 함(매처 fix 효과). recall이 0.75→**1.0**로 오르면 q1 편향 해소 입증.
- **q2**: `support_rate` 가 여전히 <1.0이면 = 남은 실제 갭(① binding-CQ를 exact binding-id로 참조하는 질문을 gpt-5.5가 authored 안 함, ② 비-binding CQ 일부 미지원). q2 row별로 어느 cq가 unsupported인지 확인.
- **route_identities** = `[codex_cli:subscription:openai]`, completeness=complete (S1 정상).
- **frontier**: q2가 1.0 미달이면 gate fail 지속 → minViable=null 가능(정상). q1만 본 부분 진전 + q2 잔여 갭이 핵심 산출.

## 4. 재-sweep 후 결정 (사용자와)

결과를 보고 **착수 전 사용자 확인** 후 택1:
1. **decision-grade grid** (4 effort × 3 runs × 2 fixtures ≈ 24런·~4-6h) — q1/q2가 충분히 통과 가능성 보이면.
2. **opus 전환** (settings→claude-opus-4-8 + ONTO_CLAUDE_BIN=claude-2) — golden gate가 opus급 캘리브라 gpt-5.5론 통과 불가로 보이면. opus도 매처 fix 덕에 q1 편향은 없음.
3. **graded-quality frontier 설계** — gate all-or-nothing 대신 calibration이 이미 계산하는 graded qualityScore((q1+q2+q3)/3)로 frontier를 그릴지 설계 결정(추가 라이브 불필요·effort-응답성이 binary보다 풍부). 코드 변경 트랙.
4. **q2 갭 추가 진단** — 어느 CQ/claim이 왜 미지원인지(매칭 vs 실제 품질) `--keep-tmp` 로 파고들기.

## 5. 핵심 사실 / 함정

- **`git add -A` 금지**: 세션-시작 untracked(벤치 fixtures·handoff 등)를 PR에 쓸어담는다(이번에 Codex가 적발). **항상 명시 경로로 `git add <파일>`**.
- 머지 워크플로(코드 변경 시): 브랜치→ts-core+가드(import-boundary/spec-defaults/invariant-drift/invariant-change)+`npm run test:vitest`→PR→`@codex review`→폴링(inline=`gh api repos/kangminlee-maker/onto-mcp/pulls/<PR>/comments` created_at>cutoff; clean=issue 코멘트 "Didn't find any major issues" 또는 👍)→findings 반영(push, 단일커밋PR이면 `--force-with-lease`)→**사용자 확인 후** squash 머지+브랜치 정리. 커밋 끝 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`, PR 본문 끝 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- golden gate 합격 = `q1.missing==0 && q2.supported==population && q3.dropped<=0` (semantic-quality-gate.ts). 매처 동작은 [[effort-calibration-track]] RESUME + PR #91 참조.
- 메모리: `effort-calibration-track` 의 "✅ P4b 파일럿 + golden 매처 편향 fix(2026-06-18)" 항목에 전체 맥락.

## 6. 범위

- 이 핸드오프 = **P4b gpt-5.5 재-sweep + 결과 기반 다음 결정**까지. 유료(구독) 라이브이므로 grid 확대·opus 전환은 재-sweep 결과 본 뒤 사용자 확인.
