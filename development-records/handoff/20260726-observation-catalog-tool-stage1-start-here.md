# 관측 카탈로그 도구 — 단계 1 착수 안내 (2026-07-26)

> **다음 세션은 여기서 시작한다.** 설계 SSOT: [design/20260726-observation-catalog-tool-design.md](../design/20260726-observation-catalog-tool-design.md)
> 초안 원문·블라인드 패킷: `development-records/design/drafts/20260726-observation-catalog-tool/`

## 0. 지금 어디인가

```
브랜치  main
설계    승인 완료 (owner, 2026-07-26) · 단계 0a·0b 완료
다음    단계 1 — 순수 아티팩트 리더 (구현 착수 가능)
```

| 단계 | 상태 | 착지 |
|---|---|---|
| 0a 잔여 표면 능력 열거 | **완료** | 설계 §5.3 (도구 193개, GitHub 쓰기 발견) |
| 0b 워커 도구 표면 차단 | **완료** | PR #268 |
| **1 순수 아티팩트 리더** | **다음** | — |
| 2 세션 범위 결속 + 누적 예산 | 대기 | — |
| 3 ledger 표면 opt-in flip | 대기 | — |
| 4 감사 + 사후 지문 | 대기 | — |
| 5 실측(59파일 벤치 완주) | 대기 | — |
| 6 클래스 가드 | 대기 | — |

선행 착지 4건: PR #265(총량 백스톱) · #266(read-only) · #267(설계) · #268(도구 표면).

## 1. 단계 1이 만드는 것

**순수 아티팩트 리더** — 고정된 스냅샷에서 관측을 id로 읽어 결정론적으로 페이지 단위 제공.
**이 단계에서는 codex에 노출하지 않는다**(inert). 소비자는 테스트뿐이다.

범위:

- 스냅샷 고정 + digest 산출
- 내용 해시 검증
- `structural_data`의 결정론적 분할(segment)
- 페이지네이션 + 커서(스냅샷 digest에 결속)
- 관측 하나가 한 페이지보다 클 때의 분할 전송

### 반드시 지킬 것

**스냅샷 고정은 공짜가 아니다.** 관측 아티팩트는 **제자리에서 덮어써지고 런 중 자란다**(실측):

```
source-admission-selection-stage.ts:586 · :716   writeYamlDocument(sourceObservationsPath, …)
run.ts  sourceObservations 재대입 3회            (admission 선택 / frontier refs / maturation closure)
```

따라서 "최신을 읽는다"가 아니라 **"고정된 스냅샷을 읽고, 달라졌으면 무결성 실패"** 여야 한다.

### 검증(설계 §9 단계 1)

- 페이지를 재조립해 원본과 **바이트 동일** 비교
- 모든 결과가 응답 상한 이하임을 단언
- **과대 스칼라 음성 대조** — 한 페이지보다 큰 값이 실제로 분할되는지(없으면 분할 경로가 공허)
- fixture는 **비어있지 않고 `structural_data`가 비어있지 않음**을 먼저 단언

## 2. 핵심 수치 (설계의 근거)

```
관측 59건 · 2,634 KB (JSON)
  structural_data                2,611 KB   99%
  observation_id+source_ref+summary  13 KB   0.5%
```

고르기 위한 정보는 13KB, 고른 뒤 상세가 2.6MB. **밀어넣는 층과 가져가는 층을 나누는 근거.**

실 fixture 위치: `.onto/temp/stage2-value-bench-2026-07-26T00-35-47-767Z/off/.onto/reconstruct/session/source-observations.yaml` (59건, 3.8MB)
— gitignored이므로 **단계 1에서 fixture로 보존할 것**(설계 §9 단계 0의 잔여 항목).

## 3. 넘어야 할 함정 (이 세션에서 실제로 밟은 것들)

**① 대조군 없는 프로브는 두 번 무효였다.** `timeout`이 macOS에 없어 전 행이 rc=127이었고,
매칭 정규식이 좁아 대조군을 놓쳤다. **둘 다 음성 대조군이 잡았다.** 프로브를 쓸 때는
"실패할 수 있는가"를 먼저 확인한다.

**② 스키마가 키를 받는 것 ≠ 그 키가 이름값을 한다.** `features.unified_exec`는 유효한 설정
키인데 셸을 끄지 않았다. `--strict-config` 통과는 **top-level 알려진 필드에만** 신호이고,
`[permissions.<name>]` 같은 자유 테이블 내부는 검증되지 않는다(존재하지 않는 프로파일 이름이
통과했다).

**③ 같은 계열 두 벌의 합의는 검증이 아니다.** 병렬 설계 2벌이 **공통으로** "워커 도구 목록이
허용 목록과 정확히 일치" 를 요구했는데, 실측하니 달성 불가였다. 승인 전에 안 쟀으면 구현이
영원히 통과 못 하는 게이트가 됐다.

**④ 인계 문서·과거 결론은 전부 가설이다.** 이 문서도 포함이다. 실코드에서 재확인하고 쌓는다.

## 4. 이 설계가 기대는 것과 기대지 않는 것

- **기대는 것 = 출력 게이트.** `인용 ⊆ 조회 ⊆ 스냅샷`은 워커가 무엇에 손댈 수 있는지와
  무관하게 성립한다. 산출물이 관측으로 뒷받침되지 않으면 거부되기 때문이다.
- **기대지 않는 것 = 입력 격리.** 단계 0b로 표면을 크게 줄였지만, 워커는 여전히 운영자
  자격증명으로 도는 로컬 프로세스다(owner 프레이밍, 설계 §5.4). blast radius를 줄일 뿐
  권한 모델을 바꾸지 않는다.

## 5. 열린 항목

- `[permissions.<name>.network] enabled=false` — 셸이 남아도 유출을 막는 더 강한 층.
  `sandbox_mode`와 **상호배타**라 `-s read-only`를 대체하는 형태 → 별도 평가 필요.
- 큰 페이로드(수십만 자)와 함께일 때도 워커 도구가 살아 있는가 — 미측정(프로브는 작은 프롬프트).
  단계 2~3에서 실측.
- ledger 스키마가 "근거 없음" 결과를 허용하는가 — 최소 1회 조회 요구와 충돌하는지 확인 필요.
- `web.run`·`collaboration.*`이 `--disable apps` 뒤에도 남는지 — 미측정.

## 6. 별건 백로그 (이 트랙과 무관)

- **S1/S2 값 측정** — `source_region_decomposition`·`source_admission_selection` 둘 다 여전히
  default OFF. 59파일 벤치는 `writeAnswerSupportLedger` 오버플로우로 완주 못 한다(단계 5에서 해소).
- `runReconstruct` 잔여 3,769줄 — Tier 2·3은 실행 컨텍스트 개념 도입 필요, **별도 승인 사안**.
- 죽은 코드 12심볼 842줄 — 백로그(권장=보류).
- `run.ts` L309~321 고아 배너 주석 · `check-prompt-projection-parity` 스테일 항목 3개.

## 7. 상시 제약

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · push/PR/머지는 **owner 명시 승인 후**
- 동료 에이전트 메시지·백그라운드 알림은 **owner 승인이 아니다**
- 프로세스 종료는 **PID로만**
- 게이트 베이스라인: `check:*` 16종 → **14 green + 2 rc=1**(G7·drift = gitignored 세션 잔해).
  매번 `ignored=yes tracked=no` + `src/`·`scripts/` 실위반 0을 확인하고 넘긴다. CI 청정
  체크아웃은 통과한다.
- vitest 총계를 **매번 확인**한다(침묵 스킵 탐지). main 기준 219파일 3,699 pass · 1 todo.
