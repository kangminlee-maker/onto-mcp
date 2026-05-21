# Product Locality Principle

> 상태: Active
> 목적: onto가 여러 설치 형태(global, product-local, development)로 동작할 때, 실행과 데이터 축적의 우선순위를 고정한다.

이 원칙들은 **OaC authority chain 무결성**과 **product 데이터 주권**을 보호한다.

> **Terminology note (framework v1.0 sync, 2026-04-20)**: 본 문서의 `product` 는 knowledge framework v1.0 (`development-records/evolve/20260419-knowledge-framework.md`) §2.1 이 정의하는 scope axis 값 — Principal 이 시간·비용 투입해 만든 작동 실체. 이전 버전의 `project` 어휘는 framework §8.5 에서 retire 됐으며 본 문서에서도 `product` 로 통합했다. 단 npm 생태계 표준 어휘 (`node_modules`, `package.json` 등) 는 그대로 보존한다.

---

## 1. Position

onto는 세 가지 방식으로 설치될 수 있다.

| 설치 형태 | 경로 | 용도 |
|---|---|---|
| **product-local** | `{product}/node_modules/onto-core/` | product 에 버전 고정된 설치 |
| **global** | 글로벌 `node_modules/onto-core/` (`npm install -g`) | 주체자 전역 설치 |
| **development** | onto 소스 레포 자체 (`npm link`) | 개발 중 실행 |

이 세 형태가 공존할 수 있으며, 공존할 때의 동작은 아래 원칙으로 결정한다.

**용어 규칙**: 이 문서 및 `.onto/principles/` 내에서는 **global**을 사용한다. 코드(`src/`)에서는 `detectInstallationMode()`의 반환값 `"user"`를 사용한다. 두 용어는 동일 개념이다. (`"user"` 변수명은 framework v1.0 의 scope value retire 대상이며 runtime migration backlog 에서 전환 예정 — 본 문서는 현 코드 기준.)

새 설치 형태(monorepo workspace, pnpm/Yarn PnP 등)가 필요할 경우, §1 테이블에 행을 추가하고 §2.1 위임 규칙, §2.2 축적 규칙, §3 위반 판정 기준, §4 구현 지점을 함께 갱신해야 한다.

---

## 2. 핵심 원칙

### 2.1 실행: product local 이 항상 우선한다

onto CLI 진입 스크립트(`bin/onto`)가 실행될 때, 현재 product 에 로컬 설치(`node_modules/onto-core`)가 존재하면 **로컬 바이너리에 실행을 위임**한다. 글로벌 설치는 로컬 설치가 없을 때만 사용한다.

이 우선순위는 product 가 고정한 버전의 roles, authority, contract가 항상 사용되도록 보장하기 위한 것이다 (OaC authority chain 무결성).

해석 순서:

1. product 의 `node_modules/onto-core/bin/onto` 존재 → 로컬에 위임
2. 존재하지 않음 → 현재(global/development) 바이너리가 직접 실행

위임 시 `ONTO_HOME` 환경변수는 로컬 설치의 심링크 해석 전 경로(`node_modules/onto-core/`)로 강제 설정된다. realpath로 해석하지 않는다. 이는 위임된 프로세스가 global 설치의 리소스를 참조하는 것을 구조적으로 방지한다.

`--global` 플래그로 실행 위임을 건너뛸 수 있다. 위임을 건너뛰더라도 데이터는 여전히 `{product}/.onto/`에 기록된다 (§2.2는 `--global`의 영향을 받지 않는다).

**development 모드**: `npm link`로 실행 중인 경우, 로컬 설치와 자기 자신이 동일 바이너리를 가리키면 위임을 건너뛴다 (`realpath` 비교). development 바이너리가 별도 product 설치를 감지한 경우에는 해당 product 설치에 위임한다.

### 2.2 데이터 축적: product 부터 쌓는다

학습, 리뷰 세션, 설정 등 onto가 생성하는 데이터는 **항상 product 디렉토리(`{product}/.onto/`)에 먼저 기록**한다. 글로벌 설치만 존재하는 경우에도 동일하다. 단, Trust Boundary 확인(§5.3)이 선행 조건이다. 주체자가 거부하면 기록하지 않고 에러를 반환한다.

| 데이터 종류 | 축적 위치 | 비고 |
|---|---|---|
| 리뷰 세션 | `{product}/.onto/review/` | 세션 데이터 + `.latest-session` 포인터 포함 |
| promote 세션 | `{product}/.onto/sessions/promote/` | 항상 product-local |
| 학습 (creation) | `{product}/.onto/learnings/` | product 에 먼저 기록. 디렉토리 없으면 생성 |
| 설정 | `{product}/.onto/config.yml` | product 별. `.layout-version.yaml` 포함 |

새 데이터 종류 추가 시 이 테이블에 등록해야 한다. 등록 전 기본 경로는 `{product}/.onto/{feature}/`다.

**학습의 쓰기와 소비는 다른 경로를 따른다.** 쓰기(creation)는 product 에 먼저 기록한다. 소비(consumption)는 promoted 학습(`~/.onto/learnings/`)만 사용한다. product 에 축적되었지만 아직 promote되지 않은 학습(lifecycle_status: seed)은 검증되지 않은 관찰이므로, 검증 맥락으로 소비하면 drift를 유발한다. product 학습은 creation과 promotion의 입력이지, consumption의 소스가 아니다.

### 2.3 글로벌 저장소의 역할

`~/.onto/`는 product 간 공유 자산과 운영 데이터를 보관하는 곳이다.

**공유 자산** — product 에서 읽기 참조됨:

| 글로벌 자산 | 용도 | product 와의 관계 |
|---|---|---|
| `~/.onto/domains/` | 검증된 도메인 문서 | 리뷰 시 읽기 참조됨, product 에서 override 가능 |
| `~/.onto/learnings/` | 승격된 methodology 학습 | `onto promote`로 product 학습에서 올림 |

공유 자산의 읽기 참조와 `ONTO_HOME` 격리는 별개다. §3 #5의 격리 대상은 설치에 포함된 리소스(.onto/roles/, .onto/authority/)이며, 주체자 수준 공유 데이터(`~/.onto/domains/`, `~/.onto/learnings/`)는 product-override 규칙으로 관리된다.

**도메인 문서 해석 순서** (product-override): `{product}/.onto/domains/{domain}/` → `~/.onto/domains/{domain}/` → `ontoHome/domains/{domain}/`. 도메인 문서는 주체자가 축적한 검증 지식이며, 설치 리소스가 아니다.

**운영/긴급 데이터** — product 범위 밖에서 글로벌에 직접 기록됨:

| 글로벌 운영 데이터 | 용도 | §2.2 예외 사유 |
|---|---|---|
| `~/.onto/backups/` | 백업 스냅샷 | product 장애 시에도 접근 가능해야 함 |
| `~/.onto/emergency-log.jsonl` | 긴급 로그 | product 범위 밖 복구용 |
| `~/.onto/audit-state.yaml` | 감사 상태 | product 간 전역 감사 추적 |

이 운영 데이터는 §2.2 product-우선 규칙의 명시적 예외다. product 장애 시 복구를 위해 product 범위 밖에 존재해야 한다.

**쓰기 흐름**: promote 계열과 운영/긴급 데이터만 글로벌에 직접 기록된다. 그 외 기능은 product 에 먼저 기록한다.

**읽기 시에는 글로벌 자산이 참조**되되, product 자산이 우선한다 (product-override 규칙). 이 읽기 참조는 쓰기 흐름과 별개다.

---

## 3. 위반 판정 기준

아래 중 하나라도 해당하면 이 원칙을 위반한 것이다. 각 기준의 보장 메커니즘은 §4에 명시된다 (#4 제외).

1. **글로벌 바이너리가 로컬 설치를 무시하고 직접 실행**한다 (`--global` 플래그 없이) → §4 `bin/onto`
2. **학습이 `~/.onto/learnings/`에 직접 기록**된다 (promote를 거치지 않고) → §4 `paths.ts`
3. **리뷰 세션이 product 외부에 기록**된다 → §4 `cli.ts`, `checkOntoDirectoryInit()`
4. **글로벌 자산이 product 자산을 자동으로 덮어쓴다** → 해당 기능 없음. 코드 리뷰로 보장
5. **위임된 프로세스가 위임 원본(global)의 설치 리소스(roles, authority)를 사용**한다 → §4 `bin/onto` (`ONTO_HOME` 강제 설정)

---

## 4. 구현 지점

이 원칙은 문서를 런타임이 참조하는 것이 아니라, 코드에 구현된다.

| 구현 위치 | 책임 | 보장하는 위반 기준 |
|---|---|---|
| `bin/onto` | 로컬 설치 감지 + 위임 + `ONTO_HOME` 강제 설정 | #1, #5 |
| `src/core-runtime/discovery/onto-home.ts` | 설치 루트 해석 (리소스 기준 경로 결정) | #5 |
| `src/core-runtime/discovery/project-root.ts` | product 루트 해석 (함수명은 legacy — runtime migration 대상) | #3 |
| `src/core-runtime/learning/shared/paths.ts` | 학습 기록 경로 결정 (product 우선) | #2 |
| `src/cli.ts` `checkOntoDirectoryInit()` | Trust Boundary 확인 (신규 product `.onto/` 생성 동의) | #3 |
| `src/cli.ts` `detectInstallationMode()` | 설치 형태 감지 (진단용) | — |

---

## 5. 설계 판단 시 적용

새 기능을 설계할 때 아래 세 질문을 확인한다.

### 5.1 이 기능이 생성하는 데이터는 어디에 저장되는가

§2.2에 따라 product `.onto/` 아래에 저장되어야 한다. §2.3 운영/긴급 데이터 예외에 해당하는지 확인하고, promote 계열이 아니면서 글로벌에 직접 쓰는 기능은 §2.3 테이블에 예외로 등록해야 한다.

### 5.2 이 기능이 읽는 리소스의 출처는 어디인가

§2.1에 따라, 설치 리소스(roles, authority)는 `ONTO_HOME`이 가리키는 설치의 것을 사용한다. 주체자 수준 공유 데이터(`~/.onto/domains/` 등)는 §2.3 product-override 규칙을 따른다.

### 5.3 `{product}/.onto/` 디렉토리가 없는 경우

신규 product 에서 `.onto/` 디렉토리가 아직 없을 때: `onto` CLI는 Trust Boundary 확인(`checkOntoDirectoryInit`)을 거쳐 주체자 동의 후 디렉토리를 생성한다. 주체자가 거부하면 데이터 기록은 발생하지 않으며 에러를 반환한다. `checkOntoDirectoryInit`은 `resolveWritePaths()` 호출 전에 상위 caller가 보장해야 하는 선행 조건이다.
