# §4-6a resubmit 확대 start-here (2026-07-07)

## 0. 현 상태 한 줄

§4-1(nested breaker)·F1 foundation(breaker concurrent 결정성) **머지 완료**(main `35a4b24`).
다음 = **§4-6a: bounded-resubmit 오류-명세 주입을 issue-stance 전용 → 여타 유닛(deliberation 등)으로
확대**. 레인 A(INV-MODEL-1 무관·무의존). 설계 SSOT가 예고한 "공유 함수 추출" 이연분이다.

## 1. §4-6a가 무엇인가 (설계 SSOT 근거)

- SSOT: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md`.
  - §3(설계 A): stance 검증 실패(`issue_evidence_refs` 화이트리스트 위반)를 맹목 재시도 대신
    **오류 명세를 packet에 주입해 교정 resubmit**한다. cap은 기존 `issue_artifact_max_retries`(기본 2)
    재사용, 오프토글 키 `review.execution.retry.resubmit.enabled` 1개. cap 소진 시 **유닛 강등**.
  - **line 97 (핵심)**: "resubmit 정책을 공유 함수로 추출하되 **이번 cut의 배선은 issue-stance 경로에
    한정한다.**" → §4-6a = 그 공유화 + 확대.
- 즉 §4-6a = (1) resubmit 메커니즘을 유닛-불문으로 일반화, (2) deliberation_response 등 **교정 가능한
  계약-검증 거부**가 있는 유닛에 배선.

## 2. 현재 코드 앵커 (main 35a4b24 재확인 — 라인 이동 주의, 재검증 필수)

resubmit은 지금 **issue-stance 전용**이다. 확대하려면 아래 3곳을 일반화:

1. **오류-명세 주입 게이트** `src/core-runtime/cli/run-review-prompt-execution.ts`:
   - `applyStanceResubmitErrorSpec` (함수 `:1768`), 게이트 `:1775`(`resubmit.enabled`)·**`:1778`
     (`output_format !== "issue-stance-response"` → return)**. 호출부 `:3739`, `:3799`.
   - 주입 내용이 stance 전용 검증에 결속: `classifyUnsupportedEvidenceRefFailure`(`:1780`),
     `readFrozenUnsupportedRefViolation`(`:1824`) — `issue_evidence_refs` 위반 전용.
2. **유닛 강등 경로** (cap 소진): `:4960-4994` 부근. `isUnsupportedEvidenceRefFailureMessage`
   (`:4960`) + `outcome.dispatch.unit_id.slice("issue-stance:".length)`(`:4994`) — stance 접두 하드코딩.
3. **확대 대상 유닛**: `executeDeliberationResponseUnit`(`:4356`), 검증 `validateDeliberationResolutionObject`
   (`:5699/5858/6218`). output_format `issue-deliberation-response`(`:205`, `:5423`). synthesis도 후보
   (`validate*`, output_format `issue-synthesis-response` `:6244`).

## 3. 설계-먼저 (구현 전 결정 필요)

resubmit은 아무 실패에나 되는 게 아니라 **"계약 위반 출력을 오류 명세로 교정 재요청 가능한"** 실패에만
적용된다(SSOT §2: 런타임 no-reason, 거부+명세 재요청만). 따라서 §4-6a는 기계적 확장이 아니라 유닛별
설계가 선행:

- **각 후보 유닛(deliberation_response 우선)의 검증-거부 실패 모드**를 실코드로 규명: `validateDeliberationResolutionObject`가
  어떤 위반을 던지나? stance의 evidence_refs처럼 **결정적으로 분류 가능하고 오류 명세로 교정될** 위반이
  있나? 없으면 그 유닛은 resubmit 대상 아님(맹목 재시도 유지가 옳음).
- 있으면: 유닛별 (a) 검증-거부 분류기, (b) 주입할 오류 명세 스키마를 정의.
- 공유화: 게이트(`:1778`)·분류기(evidence_refs 전용)·강등 slice(`:4994`)를 output_format/유닛-불문으로
  일반화하되 유닛별 분류기를 주입식으로.

**착수 형태 권장**: 먼저 deliberation 검증 경로만 정독해 "resubmit 적용 가능 여부"를 판정 →
적용 가능하면 설계 노트(어느 유닛·어떤 분류기·어떤 명세) → 구현 → 검증. 적용 불가로 판명되면
§4-6a의 실 스코프가 축소될 수 있음(정직하게 재프레이밍).

## 4. Gotchas

- **F3 하니스 작업자와 파일 충돌 주의**: §4-6a도 `run-review-prompt-execution.ts`를 건드린다(resubmit
  region ~1768/3739/4960). 하니스 작업자는 nested/breaker recording region + breaker 테스트를 건드림 —
  stance 디스패치 영역(~4900-4994)에서 겹칠 수 있다. **착수 전 하니스 작업자 스코프 확인/조율** 권장.
- **default-off 보존**: `resubmit.enabled` opt-in을 유지 — OFF면 현행 맹목 재시도 byte-동일.
- **레인**: A(INV-MODEL-1 무관). B5~B7 종속 아님.
- **검증 규율(이 세션 확립)**: 구현 후 독립 적대 교차검증 필수 — green 스위트만으론 부족. 가능하면
  cross-family(Codex `$ultracode-for-codex`)·cross-taxonomy(onto 렌즈)까지. 자기 재도출도 가설로 취급.

## 5. 참조

- 트래커(고정 순서표·D1·§4-2 재스코프): `development-records/plans/20260706-s4-backlog-work-order-and-d1-authority.md` §1(§4-6a 행).
- 설계 SSOT: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md` §3·line97.
- 메모리: `onto-mcp-s4-backlog-validity-20260706`(§4-6 재검증), `onto-mcp-post-impl-cross-verify-expectation`.
- F1 후속(별개): breaker 리뷰 풀 배선은 F3 하니스 후(`20260707-breaker-concurrent-determinism-f1-design.md` §7-3).

## 6. clear 후 첫 커맨드 (모델 명시)

```bash
cd /Users/kangmin/Documents/onto-mcp && git fetch origin && git checkout main && git pull --ff-only && \
  cat development-records/handoff/20260707-s4-6a-resubmit-expansion-start-here.md
```

첫 프롬프트(모델 Opus 4.8 권장 — 설계+계약-반경 구현): "이 start-here 읽고, §2 앵커를 현재 main에서
재검증한 뒤 §3대로 deliberation_response 검증-거부 경로를 정독해 resubmit 적용 가능 여부를 먼저
판정하라. 브랜치 새로 파고, 하니스 작업자와의 파일 충돌 여부부터 확인. 설계 확정 전 구현 금지."
