# 경로 분류의 단일 권위. G13(doc-currency)과 G15(push-currency)가 여기만 읽는다.
#
# 두 게이트는 서로 다른 질문을 한다. 그래서 목록도 둘이다 — 하지만 **어느 경로가
# 어느 부류인가**는 한 곳에서만 정해진다. 두 스크립트가 각자 목록을 들고 있으면
# 하나가 조용히 드리프트하고, 같은 경로를 두고 두 게이트가 다른 답을 낸다.
#
# | 경로 | G13이 산문을 검사하나 | G15가 맵 갱신을 요구하나 | 왜 |
# |---|---|---|---|
# | `src/` | ✔ | ✔ | 런타임 코드 — 주석이 현재를 말해야 하고, 동작이 바뀌면 맵도 바뀐다 |
# | `.onto/{authority,principles,processes,roles,domains}/` | ✔ | ✔ | 배포되는 계약 |
# | `docs/` | ✔ | ✘ | 문서가 문서를 바꾼 것은 맵을 낡게 만들지 않는다 |
# | `.onto/settings.json` | ✘ | ✔ | 산문이 아니라 값이다. 그런데 opt-in을 켜고 끄므로 맵의 현황표를 낡게 만든다 |
# | `scripts/`·`.githooks/`·`.github/` | ✘ | ✔ | 집행 코드와 그 배선. 하니스는 자기 출력 경로를 이름 부를 수 있어 산문 검사에서 빠지지만, 게이트가 바뀌면 맵의 검증 체계 서술이 낡는다 — 워크플로가 게이트 스텝을 지워도 마찬가지다 |
# | `bin/`·`vendor/`·`packaging/`·`package.json`·`package-lock.json`·`tsconfig*.json` | ✘ | ✔ | 배포·빌드 산출에 직접 영향. lock은 의존 버전을 고정하므로 런타임 동작을 바꾼다 |

# G13 산문 검사 대상 — git이 소스로 보는 파일 중 이 최상위 경로들.
ONTO_PROSE_SUBJECT_PATHS='src
.onto
docs'

# G15가 "맵을 함께 옮겨야 한다"고 판정하는 변경 경로.
ONTO_MAP_TRIGGER_RE='^(src|bin|vendor|packaging|scripts|\.githooks|\.github)/|^\.onto/(authority|principles|processes|roles|domains)/|^\.onto/settings\.json$|^package(-lock)?\.json$|^tsconfig.*\.json$'

# 지도 — 이력이 어디 사는지 말하는 것이 일인 문서. G13의 격리 검사에서 빠지되
# dangling 검사에는 포함된다. 추측이 아니라 열거다.
ONTO_MAP_DOCS='README.md
AGENTS.md
CLAUDE.md
IMPLEMENTATION_MAP.html
docs/architecture/repo-layout.md'
