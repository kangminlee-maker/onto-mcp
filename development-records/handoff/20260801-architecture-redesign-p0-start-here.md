# 아키텍처 재설계 → P0 프로브 착수 시작 지점 (2026-08-01)

> 상태: 재설계 설계 트랙 **종결** (문서 확정 + owner 결정 반영). 다음 세션의 일은 **P0 결합 프로브 실행**이며, 선행 조건은 전부 PASS로 닫혀 있다.
> 설계 SSOT: [../design/20260731-architecture-redesign/ARCHITECTURE.md](../design/20260731-architecture-redesign/ARCHITECTURE.md) (721줄, 2026-08-01 개정판)
> 선행 조건 실측: [../design/20260731-architecture-redesign/p0-preflight.md](../design/20260731-architecture-redesign/p0-preflight.md)

## 1. 무엇이 결정됐나

- **전면 재작성 기각 — `incremental_only`.** 50-에이전트 워크플로(연구 19·독립 초안 4·적대 비평 20·심사 3) 산출. 심사는 2:1(소수 mission-fit=B/partial)이었고 종합이 소수 실질(B 스키마 어휘 선반영)을 흡수했다. 심사 패널은 2회 표집에 1좌석 플립 — 견고한 이견으로 읽지 말 것(부록 B.2 각주).
- **owner 결정 (2026-08-01):** D1 결정 — "0은 지향이지 성공 기준이 아니다. 판정 기준은 관여 여부가 아니라 **산출물 정확성**"(→ F3 해소, F4는 '보정된 정확도를 실은 추정' 사양으로 재규정). D3 승인(P0 실행). D4 승인(Arm 2 독립 격발 포함 개정판). **D2·D5는 잔여** — D2는 P0 층별 데이터 후 재결정이 설계 자체다.
- **§1.5 reconstruct 작업 가설 (owner 진술 등재):** 의도=원리적 확증 불가 → 산출물은 정확도가 측정되는 추정 / 일관성(≠규칙성)=의도의 증거 / 도메인 원칙=사전확률 / 코퍼스 일관성=신뢰도 상한 / 반이행 코퍼스="의도 2개+방향". **Arm B(마스킹 재유도)가 이 가설 vs §11.1 F2 비관의 사전 등록 대립 실험이다.**

## 2. P0 선행 조건 — 전부 PASS (재확인 불필요, 기록만 신뢰)

| 조건 | 결과 |
|---|---|
| codex 좌석 | 실 디스패치 카나리 `OK` rc=0 (`~/.codex/bin/codex-run --profile hermetic --model gpt-5.6-sol`) — 1계열 폴백 불발동 |
| SE 팩 오염 감사 | 의역 겹침 5항목(INV-CFG-1/G2·G1·INV-SCHEMA-1·principles-유래 fail-loud/LLM권위·INV-MOCK-1부분) **채점 제외**. SE 팩은 마스킹 대상과 **저작 계보 공유** → 도메인 lift 주 측정은 Arm 4(스프레드시트 × accounting 팩) |
| Arm 1 핀 커밋 | **`6c364a0a`** — (경로,content_sha256) 전 쌍 일치 + 당시 커밋 제목("arm 산출물 생성 전 핀")이 교차 확증. exp1·exp2 동일 핀. 도출 스크립트 동거(`derive-pin-commit.py`) |

## 3. 다음 작업 순서 (P0 본 실행)

1. **throwaway evaluator** (~수백 줄, 폐기 전제): §11.2 공유 인프라 — **지원 predicate·query 집합을 사양에 사전 명시**부터. 이 목록 없이는 표현-기각률 지표가 성립하지 않고 escalation 원인 분기가 판정 불가.
2. `git worktree add ../onto-mcp-p0-pin 6c364a0a` — Arm 1 replay는 이 위에서만 (현행 checkout 위 평가는 시점 불일치 → kill-switch 오발동).
3. **Arm 2 blind packet**: 정답지 23종(INV 13+G1~G11) 마스킹 번역 + 디코이 5 + 복붙 규칙성 2~3 + 마이그레이션 역방향 1 + 셔플. 제외 목록은 p0-preflight.md §②가 SSOT. **격리 조건: 이 세션 계열은 재설계 워크플로를 돌렸으므로 준비자만 가능 — 재유도 좌석은 신선 세션(claude) + hermetic codex.** 도메인 on/off 대조 포함(오염 감사 반영).
4. Arm 1 replay(층별·predicate별·binding별·표현-기각률·엣지 대조·일관성 분석 렌즈) → Arm 3(material finding 30건 4-버킷, 계상 자격=check 실작성) → Arm 4(스프레드시트 × accounting 팩 — 도메인 대조 주 사이트).
5. 판정: §11.2 사전 등록 그대로. **Arm 2 실패는 독립 격발**(무인 귀납 범위 축소). Arm 1 사망은 원인-조건부 3분기(표현 불가→어휘 확장 / seed 공허·앵커 부재→부분 재작성 escalation / 혼재→최소 확장 후 재-replay).

## 4. 함정 (이 트랙에서 실제로 밟은 것)

- **워크플로 `wf_39432e40-ab6` 재개(resume) 금지** — 이미 완주했고, 재개하면 종합 에이전트가 수기 개정된 ARCHITECTURE.md를 덮어쓴다.
- 에이전트 로그의 `spend limit` 문자열은 **프롬프트 인용**일 수 있다 — grep 히트 수가 아니라 하니스의 `<failures>` 보고만 한도 실패의 증거다. 이 오진으로 작동 중인 종합을 두 번 끊었다.
- 조용함 ≠ 멈춤: max effort 종합은 33분 연속 무출력이 정상 범위였다. mtime과 프로세스 상태를 먼저 봐라.
- seed 코퍼스는 **2파일뿐**(DD6 실험이 좁았다) — Arm 1 "승격 ≥1"의 분모가 작음을 판정 시 감안, 결과는 INV-BENCH-1상 PRELIMINARY.
- 부재 주장은 전수 확인: core-lexicon 소비자 0은 문자열+글롭 로더까지 닫고 확정한 것이다(수법: authority yaml 소비 사이트 전수 = lens-registry 6·supported-models 6·model-reasoning-efforts 2).

## 5. 파일 지도

```
development-records/design/20260731-architecture-redesign/
├── ARCHITECTURE.md        # 설계 SSOT (2026-08-01 개정판) — §0 판정, §1.5 가설, §11.2 P0, §12 결정
├── p0-preflight.md        # 선행 조건 실측 3건 + Arm 2 제외 목록 SSOT
├── derive-pin-commit.py   # 핀 커밋 결정론 도출 (재실행 가능)
├── research/  (19)        # ground-* 현행 채굴 7 + theory-* 이론 판정 12
├── drafts/    (4)         # 독립 초안 A(형식)·B(증거)·C(자기적용)·D(최소델타, 승자)
└── critiques/ (20)        # 초안별 5렌즈 적대 검증
```
