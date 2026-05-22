# DD-010 — Onto MCP-Native Tool Surface

**Date**: 2026-05-21
**Status**: Accepted direction
**Owner**: operations

## Decision

`onto`의 장기 제품 방향은 **TS core + MCP-native tool surface**이다.

외부 adapter 결합은 `onto`의 제품 중심 경로가 아니다. 이전 adapter
실험은 독립 관점 리뷰, artifact compatibility, controlled lens
deliberation 요구를 검증한 증거와 conformance harness로만 보존한다.

## User-Facing Goal

Codex, Claude, 또는 다른 host가 사용자의 자연어 요청을 받아 플랫폼별
명령어를 기억하지 않고도 다음처럼 `onto`를 tool calling 하듯 사용할 수
있게 한다.

```text
onto.review(target, intent, domain?, review_mode?, deliberation?)
onto.review_status(session_id)
onto.review_result(session_id)
onto.list_lenses()
onto.list_domains()
onto.prepare_review(target, intent, ...)
```

사용자에게 중요한 결과는 “어느 host에서 실행하든 같은 `onto` 의미론과
같은 review artifact를 얻는다”는 점이다.

## Architecture

```text
.onto YAML/MD contracts
        |
        v
TS onto core
  - lens/domain selection
  - prompt packet materialization
  - execution profile and execution plan
  - synthesis and ReviewRecord assembly
        |
        v
onto MCP server
  - small stable tool schemas
  - structured results and artifact refs
        |
        v
execution providers
  - codex
  - claude
  - local/mock
  - future hosts
```

## Boundary Rules

- YAML/MD remains the language-neutral contract source.
- TS runtime remains the primary executable owner of `onto` semantics.
- MCP server is a thin tool surface, not a second implementation of review
  semantics.
- Providers execute capabilities only: independent contexts, persistent agents,
  controlled deliberation transport, concurrency, timeout, and artifact collection.
- External adapter code must not accumulate new canonical `onto` semantics. It may
  remain as conformance tests, bridge code, or optional provider proof.

## Provider Capability Contract

The provider contract should be small and capability-based.

```ts
interface OntoExecutionProvider {
  capabilities(): {
    independentContexts: boolean;
    persistentAgents: boolean;
    crossProcessMessaging: boolean;
    maxParallel: number;
  };

  runLens(packet: ReviewUnitPacketRef): Promise<ReviewUnitResult>;
  deliberate?(request: DeliberationRequest): Promise<DeliberationResult>;
  synthesize?(packet: ReviewUnitPacketRef): Promise<ReviewUnitResult>;
}
```

This keeps platform-specific work bounded. A provider does not decide what
MCP review means; it only reports and performs what its host can execute.
The canonical behavior is always: isolated lens contexts, controlled
lens-deliberation result, then synthesize consumption of `deliberation.md`.

## Consequences

- Do not bind a concrete host/plugin/messaging backend to an external adapter
  dispatcher as the next product step.
- Reclassify Slice A-I as evidence for the MCP/provider contract and as a
  compatibility test bed.
- Next implementation should happen in or around the TS `onto` runtime:
  exported core API first, then MCP server, then provider adapters.

## Next Work

1. Inventory TS `onto` review APIs that can become library calls instead of
   process-bound worker calls.
2. Define MCP tool schemas and result shapes.
3. Map current `.onto` YAML/MD and TS runtime artifacts to those tool schemas.
4. Define provider conformance tests using mock/local provider first.
5. Decide which Python parity code is kept as fixture, bridge, or removed.
