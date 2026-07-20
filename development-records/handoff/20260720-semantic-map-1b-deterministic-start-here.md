# semantic-map 1b deterministic + 경계 배선 — start-here (2026-07-20, /clear 후 재개용)

> task #10 마무리 트랙("코드 완성 + 멀티파일 티어") 후속. 이 세션에서 live 검증 사이클
> 전체가 종결되고 전략이 **결정론-우선**으로 전환됐다. 재개 시 pwd/branch/HEAD 재검증 필수.

## 0. 상태 핀 (2026-07-20 세션 종료 시점)

- 브랜치 `fix/semantic-map-code-inventory-prompt-bound` = main(`43c0bf1`) + 10커밋,
  HEAD `724b1a1` (+이 핸드오프 커밋). **PR #235 오픈** — 런타임 변경 2커밋(교차검증 완료) +
  disclosure/설계 8커밋. owner 머지 대기.
- 스위트 기준: `npx vitest run` = **3,301 green**(202 files, +1 todo). 검증 6종 전건 green
  (tsc·vitest·semantic-map-golden·reduce/code-reduce harness·import-boundary·
  final-output-sections-parity 9).
- `.onto/settings.json` **원복 확인**(diff 0 — `semantic_map_code` 키 부재 = OFF).
- live 세션 산출물(미커밋, replay용): `.onto/reconstruct/20260720-dd6-live-exp1/`(완주),
  `20260720-dd6-live-exp2/`(맵 완주·하류 maturation fail-loud 중단). disclosure 사본은 커밋됨.
- 무관 트랙 미커밋 파일 잔존: longform-observation 4종(별도 트랙 — 이 브랜치에 넣지 말 것).

## 1. 이 세션에서 종결된 것 (요약 — 상세는 각 disclosure/설계)

1. **PRE-LIVE 인벤토리 봉인** (`d662735`+`7a091cf`): `code_structure_inventory` 무한 프롬프트
   주입 → bounded projection **40,000자 pretty 실측 계약**(callJsonAuthor 직렬화 기준,
   render-budget 전례). 모듈 = `src/core-runtime/code-structure-inventory-projection.ts`
   (observer 파일과 분리 — 당시 G-SEM 동결). 3-렌즈 교차검증 전건 반영. 실측: run.ts
   620,973→39,858자(118/1,280 spans)·review-invoke 95,563→39,974(137/209).
2. **실험1 (fit regime)**: G-SEM **FAIL 1/5** — 단 v1 0/5 전패 대비 answerable 포괄-상회·
   지는 문항 0(DD6′+DD10 실질 개선), B2 원시 소스 8문 전승.
   disclosure `benchmark/20260720-semantic-map-dd6-live/`.
3. **실험2 (초과 regime, 중첩 3-조건 ①head200K ②+인벤토리 ③+맵)**: **C1 PASS 5/5 ·
   C2 FAIL 1/5** — 가치 원천 = 결정론 인벤토리, LLM 맵의 신규 지점 사실 기여 0(judge 명문).
   run은 하류 maturation ledger fail-loud로 중단(측정 무손상 — RESULT 공시).
   disclosure `benchmark/20260720-semantic-map-midfile-live/`. **run.ts 7h 풀런 근거 소멸.**
4. **Phase 1b 최종 설계 v3** (`design/20260720-semantic-map-phase1b-set-tier-design.md`,
   `8685e4a`): **owner 병렬 설계 표준 1회차** — fable v2 + sol@xhigh blind packet 독립 설계
   → 양방향 교차리뷰(MATERIAL 13+갭 3, 기각 0) → FD1~FD14 + 게이트(sol G1~G12+4보강) +
   OD-1~8. 입력 문서: sol 설계/패킷/교차리뷰 3파일(같은 디렉터리).
5. **owner 결정 확정**: OD-1=`semantic_map_code_set_tier` 별도 키 · OD-2=code-only 단일
   root · OD-5=per-file 보존+degraded · OD-6=기존 projection 타입 재사용. **OD-7 방향 =
   deterministic 우선**(재귀LLM 코드 추가투자 중단 — 대화로 수용, 착수 시 1줄 재확인).
   OD-3=보수적 resolver(비용 설명 후 이의 없음 — 착수 시 1줄 재확인). OD-4=실측 후 수치
   확정. OD-8=deterministic 모드면 G11 불적용·G10 축소판.
6. **owner 전략 방향**: 코드 이해 = 결정론 3단 줌(줌3 디렉터리 롤업 / 줌2 인벤토리 40K
   투영 / 줌1 span 원문 슬라이스) + **환경 컨텍스트 1차 의미 부여**(규칙 우선+유계 LLM
   1패스) + 개념 매핑(seed 저작, 표적 본문 읽기 보강). 근거 = 실험1·2 일관 상("본문 사실은
   본문만, 구조 사실은 인벤토리, LLM 요약은 신뢰도만").
7. **설계 프로세스 표준(전 프로젝트)**: 설계 저작은 isolated frontier ≥2 병렬 + 상호
   교차검증 — 메모리 `design-parallel-frontier-crossverify`.

## 2. 다음 작업 (순서)

1. **PR #235 머지** (owner).
2. **경계 결정 마무리 (task #4 잔여)**:
   - 설계 SSOT 기록: 20260718 설계 §10에 addendum(v2.3 — 실험1/2 판정·경계: fit=원시 소스 /
     초과=bounded 인벤토리 / `semantic_map_code` 미승격) 또는 별도 결정 문서.
   - **인벤토리 독립화 배선**: 현재 code 인벤토리 캡처가 `semantic_map_code` 옵트인에 묶임
     (materialize-preparation.ts:503-516) — 맵 없이 인벤토리만 켜는 경로 필요. 선택지:
     (a) 신규 boolean `code_structure_inventory` 키 (b) 기본 ON 승격(실험2 C1 5/5 근거,
     단 default-off 규율·프롬프트 변화 파급 — breaker-observation 승격 선례 #203 참조).
     owner 결정 회부. 이것이 실험 결과의 실질 제품화다.
3. **Phase 1b 구현 — deterministic 모드 스코프** (OD-7 1줄 재확인 후):
   - 최종 설계 v3의 FD1~FD8·FD11(realization="deterministic" fold)·FD12(구조 preflight)·
     FD13(set fingerprint)·FD14. **보류**: FD9 synthesize/seed 프롬프트 계약·FD10
     passthrough(LLM 층)·G11. 게이트: G1~G8·G9(스키마 부분)·G10 축소판(결정론 overview
     렌더 확인)·G12.
   - observer `imports` 추가(FD4) **가능해짐** — 실험 종결로 G-SEM 동결 사유 소멸
     (extractor_logic_sha256 회전 = 의도된 1회, 커밋 메시지 명기). bounded projection
     동시 수정(강등 순서 hierarchy→imports→spans + sections 기록) 필수.
   - 구현 순서 = 설계 §5 단계 A~G(LLM 단계 축소). 단계 A의 실 타입 확인부터.
4. **환경 컨텍스트 프로파일 설계** — 병렬 설계 표준 적용(격리 2벌+교차). 스코프: 언어/
   프레임워크/인프라 판별(설정 파일), 레이어 분류(경로 관례), 힌트 테이블(구조 신호→
   온톨로지 후보). 1b LLM set 층의 대체재.
5. **task #6 마무리**: 최종 교차검증·IMPLEMENTATION_MAP(이번에 1차 갱신됨)·메모리·
   문서 트랙(docx/pdf — owner 필수 지정) 백로그 명기.

## 3. 백로그 (이 트랙 밖)

- maturation-convergence-ledger fail-loud(run.ts:1489, exp2 재현) — resubmit/재시도 후보.
- 문서 트랙: 텍스트 티어 + D3 비전 채널(docx/pdf 필수 — owner 2026-07-20).
- 스프레드시트 시각 채널 소급(D3), G8류 seed payload parity 부재(설계 §5 노트).
- 실험1 잔여 관찰: fit 파일 인벤토리도 pretty 47.5K > 40K라 이제 hierarchy 강등됨 —
  경계 기록 시 함께 명기.

## 4. 검증 명령 (변경 시 전건 exit 0)

```
npx tsc -p tsconfig.json --noEmit
npx vitest run
npx tsx scripts/semantic-map-golden.mts check
npx tsx scripts/reduce-proof-harness.mts
npx tsx scripts/code-reduce-proof-harness.mts
npx tsx scripts/check-import-boundary.ts
npx tsx scripts/check-final-output-sections-parity.ts
```

## 5. 참조

- 설계: `design/20260720-semantic-map-phase1b-set-tier-design.md`(v3 최종) + sol 설계·패킷·
  교차리뷰 3파일 + git `3eafb65`(fable v2 전문).
- disclosure: `benchmark/20260720-semantic-map-dd6-live/`·`20260720-semantic-map-midfile-live/`.
- 메모리: `onto-mcp-semantic-map-multiartifact-start-20260718`(트랙 전체),
  `design-parallel-frontier-crossverify`(설계 표준).
