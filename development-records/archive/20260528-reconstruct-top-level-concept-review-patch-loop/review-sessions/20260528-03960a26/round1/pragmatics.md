# Pragmatics Lens Review

## Verdict

PASS — pragmatics 관점에서 material documentation/design-contract issue는 남아 있지 않습니다.

현재 diff는 Seed 소비자가 실제로 물을 핵심 질문에 대해 단일 경로로 답할 수 있게 정리되어 있습니다. 특히 answerability, lifecycle, demotion bridge, source snapshot authority, pressure transition, migration compatibility의 답변 경로가 각각 명시적인 authority field로 수렴합니다.

## Findings

No material findings.

## Why This Is Answerable

- `answerability_scope`는 선언 질문, supported/deferred/unsupported 상태 버킷, action support edge를 한 자리에서 제공하므로 “이 Seed가 어떤 질문과 행동을 지원하는가?”에 답할 수 있습니다. 질문 ID uniqueness, status bucket closed inventory, action ID uniqueness, `supported_actions[].supported_by_question_ids[]`의 단방향 support edge도 명시되어 있습니다. Evidence: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:147`, `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:181`.

- lifecycle transition authority는 `concept_identity_events`와 `relation_identity_events`로 수렴합니다. `prior_concept_mappings`, `prior_relation_mappings`, `current_detail_ids` 같은 별도 authority field는 발견되지 않았고, demotion은 `concept_identity_events[].target_detail_ids`에서 `lower_level_detail_placements[].detail_id`로 이어지는 방식으로 답변 가능합니다. Evidence: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:338`, `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:417`, `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1013`.

- source snapshot authority도 단일 해석입니다. 현재 snapshot은 `lifecycle.source_snapshot_refs`, prior snapshot은 `source_snapshot_transition.prior_snapshot_refs`로 분리되어 current/prior가 혼합되지 않습니다. Evidence: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:327`, `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:412`.

- relation participation exception은 `status: isolated`만 허용하고, connected participation은 `top_level_relations` endpoint membership에서 derivation하도록 되어 있어 “이 concept가 왜 relation graph 밖에 있는가?”에 대한 해석이 하나입니다. Evidence: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:439`, `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:446`.

- pressure 상태와 convergence 답변 경로도 실용적으로 추적 가능합니다. `frontier_pressure_log`가 pressure authority이고 lifecycle, answerability, coverage, convergence refs가 모두 pressure ID로 연결됩니다. Evidence: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:548`, `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:593`, `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:683`.

- README와 IMPLEMENTATION_MAP의 요약은 field-level authority를 세부 field로 중복 정의하지 않고 canonical contract로 안내하므로, 실사용자는 상세 질문을 contract에서 확인할 수 있습니다. Evidence: `README.md:281`, `IMPLEMENTATION_MAP.html:670`.

## Residual Limits

This review stayed within the prompt-declared boundary and did not inspect other Round 1 lens outputs or use web research. The review target is a documentation/design-contract diff, so this lens did not verify runtime implementation behavior.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/competency_qs.md"
  source_version_or_snapshot_id: "version 8"
  anchor: "CQ-A-01, CQ-A-02, CQ-A-08, CQ-A-12, CQ-A-14"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version 4"
  anchor: "Response Format Constraints; Ownership Boundary Structure; Output Sink Constraints"

### Domain Context Assumptions
[]