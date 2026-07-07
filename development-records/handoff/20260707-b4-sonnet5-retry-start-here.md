# START-HERE: INV-MODEL-1 B4 — Sonnet 5 재시도 (candidate 교체)

## 목표

B4 하니스(main·PR#180 머지)를 재사용해 **candidate 모델을 Haiku → Sonnet 5(`claude-sonnet-5`,
thinking disabled)로 교체**하고 재실행. Haiku는 grounding 경쟁력·**merge-노드 boundary 약점**으로
등록 보류됐음(→`20260707-b4-post-build-live-capture-resume.md` §B4 종결 상태). 질문: **Sonnet 5
(thinking off)가 그 boundary 약점을 넘어 candidate≥baseline을 두 메트릭 다 달성하는가**(→ 유효
cert record 가능 → B5 등록 해금). Haiku 튜닝은 그 이후 별도 시도(백로그).

## 선행 pre-req (다음 세션 첫 작업·코드 변경)

1. **`callAnthropic` thinking-disabled opt-in 배선**(`src/core-runtime/llm/llm-caller.ts` ~432행).
   현재: `reasoningEffort` 있으면 `thinking:{type:"adaptive"}`, 없으면 thinking 블록 미전송(legacy).
   추가: 명시적 config 플래그(예: LlmCallConfig에 `thinking_mode:"disabled"` opt-in) 시
   `thinking:{type:"disabled"}` 전송. ⚠️**anthropic api_key 직접 호출 경로 전용**(oauth/CLI worker는
   불가·owner 확인). 제약: 기본값=현행 무변경(byte-parity)·additive opt-in·단위테스트·SDK가
   `{type:"disabled"}` 지원하는지 **실 probe로 경험적 확인 먼저**(installed @anthropic-ai/sdk 버전).
   shipped 파일이니 invariant-change protected 0 확인.
2. **candidate/negative 좌석 config 교체**(`scripts/b4-live-realization.mts`의 `CANDIDATE` 및 좌석
   구성): `anthropic/claude-haiku-4-5-20251001` → `anthropic/claude-sonnet-5` + thinking disabled
   (위 opt-in). 여전히 **직접 구성**(registry 관측범위 밖·Haiku와 동일 메커니즘). 선언↔실행 identity
   단언 갱신.

## 재실행 (예산 승인 필요·라이브)

- 좌석: baseline/reference/judge = gpt-5.5(불변) · candidate/negative = Sonnet 5(thinking off).
- 새 run dir(예 `development-records/benchmark/synthesize-cert/<stamp>-sonnet5/`). fixture 2개
  동일(`~/Downloads/` #1 3392b185·#2 6255aef7). `--env-file=.env --go`(ANTHROPIC_API_KEY 재사용).
- forecast ≈ Haiku 때와 동일(~561콜·`--max-calls` 캡). hang 시 `--resume`.
- **선택 최적화**(무필수): reference freeze·baseline(둘 다 gpt-5.5)은 Haiku run과 동일 모델이라
  이론상 재사용 가능하나, 하니스가 부분-재사용 미지원이므로 **fresh full run이 기본**(깨끗한 비교).
  최적화는 별도 슬라이스.

## 분석 (재사용 파이프라인)

- `b4-rejudge.mts`(필요시 opus 재채점)·`b4-structured-grounding.mts`(구조화-추출·`--recompute`)·
  `b4-r7-audit.mts`(불일치 감사) 전부 그대로 재사용.
- **핵심 판정**: (1) grounding 결정론 구조검증에서 candidate≥baseline (2) **boundary**에서
  candidate≥baseline(Haiku가 실패한 지점 — merge 노드 자식-분할행 오특성화가 Sonnet 5서 사라지는가).
  둘 다 통과면 유효 record 가능 → G7(완전-패스 요구) 통과 → B5 등록 해금.

## 상태·첫 커맨드

- B4 Haiku 시도 = main 머지 완료(PR#180·origin/main 5d6499b). 하니스·verifier·증거 전부 main에.
- ⚠️로컬 main은 다른 워크트리(`onto-mcp-spreadsheet`) 점유 — **이 워크트리는 origin/main에서 새
  브랜치로 시작**.
- 첫 커맨드:
  ```
  cd /Users/kangmin/cowork/onto-mcp-claude && git fetch origin && git checkout -b feat/inv-model-1-b4-sonnet5 origin/main && git log --oneline -1
  ```
- 모델 참고: Sonnet 5 id=`claude-sonnet-5`.
