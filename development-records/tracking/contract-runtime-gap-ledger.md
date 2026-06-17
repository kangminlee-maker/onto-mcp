# Contract ↔ Runtime Gap Ledger (청사진 vs 실물)

> **목적**: onto의 *선언/계약(청사진)* 과 *실제 배선된 런타임(실물)* 사이의 gap을 **현 시점 기준으로 명확히 판단·문서화**하고, **gap이 줄어들 때마다 갱신**하는 living 원장. 설계가 "문서에 적힌 능력"을 "이미 구현된 것"으로 착각하는 함정(= S1 검증 §11에서 드러난 근본 원인)을 전역에서 방지한다.
> **As of**: 2026-06-18 (브랜치 `feat/spreadsheet-followup`; C-recon = spreadsheet 게이트 활성화).
> **갱신 규칙**: gap을 닫는 PR/커밋은 이 표의 해당 행을 **같은 커밋에서** 갱신한다(실물 칸·status·닫힘 조건). 새 계약/profile 추가 시 행을 추가한다. 이 문서는 *현재 상태 대시보드*이지 이력이 아니다 — 닫힌 gap은 행을 "✅ closed (커밋)"로 압축한다.
> **권위**: 선언 status의 SSOT는 각 레지스트리/계약 헤더다(아래 "출처" 칼럼). 이 원장은 그 선언 + 실배선 spot-check의 **판정 projection**이며, 충돌 시 레지스트리/코드가 우선.

## 0. status 어휘 (선언값)
- reconstruct source profile `runtime_implementation_status`: `planned`(미배선) < `partially_wired` < `wired` < `supported`. `partial_composite_only`/`unsupported_halt_or_clarify`(mixed/unknown 전용).
- 계약 `> Status:` 헤더: `active*` (런타임 존재) / `design*`·`future ... no active runtime` (미배선).
- **핵심 주의**: `partially_wired` ≠ "profile 내용대로 다 함". 현재 모든 kind의 관측 본체는 generic `minimal-${kind}-structure-observer`(textStats: basename/ext/size/line/char + content_excerpt)일 뿐이다. profile의 Scan Targets·관측 예시는 **LLM 프롬프트 가이드**이지 결정론 추출이 아니다.

## 1. reconstruct — source profile 관측

| 영역 | 청사진(선언/계약) | 실물(실배선) | gap | 닫힘 조건 |
|---|---|---|---|---|
| code 관측 | profile `code.md` active, **partially_wired**. Scan Targets=선언/import/시그니처/scout 축 | generic textStats(텍스트) + **code/document-scoped 정규식 scout**(actor/action/state). **AST·import/call 그래프·선언 추출 없음** | profile이 기술하는 구조 추출의 대부분이 LLM 가이드일 뿐 결정론 미구현 | 결정론 declaration/graph 추출기 도입 시 |
| document 관측 | active, **partially_wired** | text-readable(.md/.txt/.adoc)만 generic textStats; **binary(.pdf/.docx/.ppt) 추출기 없음**(쓰레기) | 바이너리 문서 L1(추출) 부재 | 문서 L1 어댑터 도입 시 |
| **spreadsheet 관측** | active, **partially_wired**(C-recon flip). profile §spreadsheet.md | ✅ **wired** — 공유 `observeSpreadsheetSource`가 reconstruct full 파이프라인(materialize seam)서 csv/xlsx → `workbook_inventory` 결정론 산출. seed 프롬프트는 `projectInventoryForPrompt`로 bounded 투영(무예산 경로 차단)+정직 매니페스트 | **✅ closed** (게이트 활성+추출기 실배선+프롬프트 예산) | ✅ closed (C-recon, `feat/spreadsheet-followup`) |
| database 관측 | active, **planned** | 없음 | L1·관측 전무 | 미정(후속) |
| mixed / unknown | active_public_kind, `partial_composite_only` / `unsupported_halt_or_clarify` | per-member 위임 / halt-or-clarify | 설계대로(갭 작음) | — |

## 2. reconstruct — L2 관측(scout) 레이어

| 영역 | 청사진 | 실물 | gap | 닫힘 조건 |
|---|---|---|---|---|
| 결정론 source scout | "kind-불가지론 L2"로 일반화 가능(§S1 설계 §9.2 주장) | `buildSignalRowsForObservation`이 **`code`/`document`로 하드게이트**(그 외 kind는 `[]`). CODE/DOCUMENT_PATTERNS만, SPREADSHEET_PATTERNS 없음 | **csv·spreadsheet는 L2 무료가 아님**(csv=kind spreadsheet). "L1만 주면 L2 자동" 전제 거짓 | scout 게이트 확장 + kind별 pattern/축 매핑 시 |

## 3. reconstruct — source 내용 → 프롬프트 채널 거버넌스

| 영역 | 청사진 | 실물 | gap | 닫힘 조건 |
|---|---|---|---|---|
| source-safety 채널 | source 내용은 admission 거쳐 프롬프트-가시(visibility-tier·allowed-proof-form·intended-consumption·redaction·replay + `source_safety_ledger` + `delta_observation_not_prompt_visible`) | reconstruct에 ledger/타입 존재, **`content_excerpt` 채널 기준으로 작동** | 신규 관측 필드(미래 S1 §2.4)는 이 채널을 **우회** → admission/provenance/replay/미신뢰-source 취급 건너뜀 | 신규 필드를 ledger 통과/단일 채널로 모을 때 (§11 CHAN-1) |

## 4. review — source 내용 admission / 검증

| 영역 | 청사진 | 실물 | gap | 닫힘 조건 |
|---|---|---|---|---|
| review materialized-input | 타깃을 검증용으로 admit | `renderReviewTargetMaterializedInput`→**`fs.readFile utf8` 그대로**. source-safety 원장·admission **전무** | review엔 source-내용 거버넌스 자체가 없음(바이너리 illegible로 가려져 있었음) | review측 admission 계약 + 공유 projection 시 (§11 CHAN-2) |
| review target profile | `review-target-profile-contract.md` **Active** | v1 **결정론 heuristic**(artifact role/closure). 계약 §6: "**per-material validator/adapter 구현 전까지 material validation 주장 금지**" | material별 검증 미구현(전 kind) | per-material 검증 도입 시 |
| review spreadsheet 지원 | — | `reviewMaterialSupportStatus(spreadsheet)=partial`(차단 안 함, 구조 맹목) | 구조 인지 없는 "partial" | C-review(S1 인벤토리 소비) 시 |

## 5. evolve / shared 계약

| 영역 | 청사진 | 실물 | gap | 닫힘 조건 |
|---|---|---|---|---|
| evolve material-kind adapter | `material-kind-adapter-contract.md` **"future design contract, no active runtime"** | **런타임 없음**(MCP 툴·어댑터 부재) | 전체 미배선(의도된 future) | evolve 런타임 재도입 시 |
| pipeline-execution-ledger | `> Status: shared design contract` | reconstruct에 `pipeline-execution-ledger.ts` 존재(부분) | 계약↔실물 정합 spot-check 필요 | 검증 후 갱신 |
| target-material-kind 축 | `> Status: design goal contract, partially registered in core lexicon` | `detectTargetMaterialKind`(확장자 분류)는 동작; per-kind 관측은 §1대로 대부분 planned | 분류는 됨, 관측 실현은 kind별 갭 | §1 닫힘과 동기 |

## 6. 사용 메모
- 이 원장은 S1 설계 §11(검증)에서 드러난 **"선언≠배선" 함정**의 전역 카운터파트다. onto의 INV-MODEL "benchmark-validated만"·supported-model 정직성과 **같은 계열**(declared knob ≠ applied)이다.
- 새 설계는 위 표의 "실물" 칸을 먼저 확인하고, *청사진을 실물로 가정하지 않는다*. profile/계약을 인용할 때 해당 행의 status를 함께 인용한다.
- spot-check 미완 항목(§5 pipeline-ledger 정합 등)은 다음 갱신에서 코드 확인 후 확정한다.
