# stance 반려 진단 — evidence_refs 표기 불일치 (2026-07-12)

fable5 review-cert run(이 디렉토리)에서 candidate attempt의 약 절반을 죽인
issue-stance `executor_exit`의 반려 원문을 라이브 채집(수집기: 임시 세션
runtime-events 10초 주기 보존)으로 확보했다. 채집 세션: 20260712-551105ba
(attempt r14), 전체 원본은 세션 스크래치에 보존 후 본 문서에 요지 기록.

## 반려 원문 (전부 동일 규칙)

```
submit_issue_stance_response.stances[2].evidence_refs contains unsupported ref for issue-003: src/target.ts:14-16
submit_issue_stance_response.stances[3].evidence_refs contains unsupported ref for issue-004: src/target.ts:14-16
submit_issue_stance_response.stances[7].evidence_refs contains unsupported ref for issue-008: .onto/review/20260712-551105ba/finding-relation-graph.yaml (rel-006)
submit_issue_stance_response.stances[1].evidence_refs contains unsupported ref for issue-002: rel-007
submit_issue_stance_response.stances[0].evidence_refs contains unsupported ref for issue-001: .onto/review/20260712-551105ba/finding-relation-graph.yaml#rel-002
```

## 판독

- 단일 클래스: stance 제출의 `evidence_refs`가 등록된 ref 우주(이슈가 보유한
  artifact ref 집합)에 없는 표기를 인용. 인용 대상 실체(rel-002/006/007,
  target.ts 라인 범위)는 실재 — **환각이 아니라 표기(직렬화) 변형**이다:
  raw `file:line` 범위, `경로 (id)` 괄호형, bare id, `경로#fragment` 등
  근접-불일치 변형들.
- 재시도는 무피드백(cert가 resubmit OFF 핀)이라 매 회 다른 변형으로 같은
  규칙에 재충돌 — r14의 semantics는 3회 모두 동일 ref로 반려돼 유닛 사망.
- 이는 §4-6c(20260708) "json-schema로 lens 해결·stance 잔존" 관찰의 원인
  확정판: 문법은 schema가 강제하지만 ref 어휘 선택은 모델 몫.

## 추가 채집 (r18, 세션 20260712-e53ef701)

동일 규칙의 변형 추가 확인 — 임의 파생 라인범위(`13-14`), 괄호 주석 부가
(`8-12 (embedded materialized input)`, `14-16 (no key ordering / canonical
form)`), 코드 스니펫 직접 인용(`` src/target.ts: `return ...` ``). 모델이
등록 ref 어휘에서 고르는 대신 인용 표기를 스스로 생성하는 경향이 일관됨.

## 함의 (owner 결정 입력)

- 기존 resubmit 채널(설계 A, 20260704; §4-6a에 issue-stance evidence_refs
  배선 존재)이 정확히 이 실패를 겨냥: 반려 원문을 패킷에 주입해 재요청 —
  동일 오류 반복 구조를 끊는다. cert는 M-1 핀으로 의도적으로 OFF.
- 후속 선택지: (C) cert 계약 v2에서 resubmit ON을 run_controls로 선언·측정,
  (D) 제품 기본값 전환 검토, (E) stance 패킷의 허용 ref 어휘 명세를
  프롬프트에서 강화(모델 무관 개선). 본 run에는 어느 것도 미적용(핀 유지).
