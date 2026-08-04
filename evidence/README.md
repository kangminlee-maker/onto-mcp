# evidence — 활성 권위가 인용하는 증거

이 폴더에는 **활성 권위 문서가 근거로 인용하는 실행 기록**만 산다. 각 파일은
어떤 주장이 참임을 보인 실제 실행의 산출물이고, 그 주장을 담은 문서가 이 경로를
직접 가리킨다.

현재 소비자:

| 인용하는 권위 | 인용하는 것 |
|---|---|
| [.onto/authority/supported-models.yaml](../.onto/authority/supported-models.yaml) | 모델별 지원 검증 기록 — `benchmark_evidence_refs` |

## 왜 `development-records/` 밖에 있나

`development-records/`는 이력이다 — 설계 서사, 핸드오프, 기각된 대안, 변경 경위.
활성 런타임은 그 안을 가리키지 않는다([AGENTS.md](../AGENTS.md) 규칙 1). 하지만
권위 값의 근거는 이력이 아니라 **지금 그 값이 참인 이유**다. 근거가 격리 폴더
안에 있으면 규칙이 권위 문서에게 자기 근거를 못 대게 만든다.

그래서 증거는 인용되는 순간 여기로 승격된다. `scripts/check-doc-currency.sh`가
그것을 강제한다 — 활성 문서가 `development-records/` 안의 파일을 가리키면 실패한다.

## 무엇이 여기 들어오지 않나

- **원시 하니스 출력** — `benchmark/`(gitignored 작업 영역)와
  `development-records/benchmark/`(추적되는 덤프)에 남는다. 인용되기 전까지는 증거가 아니다.
- **결과 서사** (`*-results.md`, `*-findings.md`) — 그것은 이력이다.
- **인용이 끊긴 기록** — 마지막 소비자가 사라지면 `development-records/benchmark/`로 되돌린다.

## 승격 절차

1. 인용하려는 기록을 `development-records/benchmark/`에서 이 폴더로 `git mv` 한다.
   실행 디렉터리 단위로 옮긴다 — 기록은 자기 preflight·capture와 함께 있어야 읽힌다.
2. 인용하는 문서의 경로를 `evidence/…`로 고친다.
3. 그 기록을 만드는 하니스가 고정 파일명으로 쓴다면 하니스의 출력 경로도 함께 고친다.
   그러지 않으면 다음 실행이 옛 경로에 사본을 만든다.
4. 위 표에 소비자를 한 줄 추가한다.
5. `npm run check:doc-currency`로 참조가 실재하는지 확인한다.
