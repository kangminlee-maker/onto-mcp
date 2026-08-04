#!/usr/bin/env bash
# G13 doc-currency — 활성 런타임은 현재만 말한다 (AGENTS.md 규칙 1).
#
# 이력·설계 서사·핸드오프·기각된 대안은 `development-records/`에만 산다. 활성
# 런타임(코드·계약·활성 문서)은 그 안의 파일을 가리키지 않는다. 이유는 문서 위생이
# 아니라 오독 방지다 — 코드 옆의 설계 포인터는 읽는 사람과 LLM 모두에게 현재의
# 사실로 읽히고, 그 설계는 구현이 끝나는 순간부터 낡는다.
#
# 세 검사, 그중 둘만 차단한다:
#
#   1. 격리 (차단) — 활성 런타임이 `development-records/` 안의 파일을 가리킨다.
#      결정 가능하다: 경로가 있거나 없거나다. 판단이 개입하지 않는다.
#   2. dangling (차단) — 활성 파일이 디스크에 없는 레포 문서를 가리킨다.
#      결정 가능하다: 파일이 있거나 없거나다.
#   3. 과거 서사 (보고) — 활성 주석의 과거형 표지. 어떤 문장이 현재를 서술하는지는
#      판단이라 보고만 한다. 휴리스틱으로 차단하면 다들 게이트를 우회하는 법부터 배운다.
#
# 사용:
#   scripts/check-doc-currency.sh              검사 (기본)
#   scripts/check-doc-currency.sh --self-test  게이트 자신이 실패할 수 있는지 확인
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

# rg가 필수다. 이 트리에는 비ASCII가 많은 파일이 있어 grep이 바이너리로 오인하고
# 매치를 놓친다 — 차단 게이트에서 그것은 거짓 초록이다.
command -v rg >/dev/null 2>&1 || {
  echo "doc-currency: rg가 없다 (grep은 이 트리에서 거짓 음성을 낸다)" >&2
  exit 2
}

# ── 실패 카나리아 ─────────────────────────────────────────────────────────────
# 실패할 수 있음을 증명하기 전엔 초록을 믿지 않는다. 두 차단 검사 각각에 대해
# 알려진 위반을 심고 게이트가 실제로 죽는지 확인한다. 검사 하나가 정규식 오타로
# 아무것도 안 잡게 되면 여기서 걸린다 — 본 검사는 그때도 초록이기 때문이다.
if [ "${1:-}" = "--self-test" ]; then
  probe="docs/architecture/.doc-currency-canary.md"
  trap 'rm -f "$ROOT/$probe"' EXIT
  st=0

  printf 'canary: development-records/design/some-superseded-design.md\n' > "$ROOT/$probe"
  if bash "$0" >/dev/null 2>&1; then
    echo "self-test: FAIL — 격리 위반을 심었는데 게이트가 통과했다" >&2
    st=1
  else
    echo "self-test: 격리 검사 OK (심은 위반에 죽는다)"
  fi

  printf 'canary: docs/architecture/this-file-does-not-exist.md\n' > "$ROOT/$probe"
  if bash "$0" >/dev/null 2>&1; then
    echo "self-test: FAIL — dangling 위반을 심었는데 게이트가 통과했다" >&2
    st=1
  else
    echo "self-test: dangling 검사 OK (심은 위반에 죽는다)"
  fi

  # NUL 바이트를 가진 파일. rg는 그런 파일을 바이너리로 판단해 매치 대신
  # "binary file matches" 통지만 내보내는데, 그러면 차단 검사가 그 파일을 조용히
  # 건너뛴다 — 실제로 `src/`에 리터럴 NUL을 쓰는 소스가 있다(해시 구분자).
  # `--text`가 그것을 막는지 여기서 확인한다.
  printf 'canary: development-records/design/some-superseded-design.md\nsep\000tail\n' > "$ROOT/$probe"
  if bash "$0" >/dev/null 2>&1; then
    echo "self-test: FAIL — NUL 든 파일의 위반을 게이트가 건너뛴다" >&2
    st=1
  else
    echo "self-test: NUL 파일 OK (바이너리로 오인해 건너뛰지 않는다)"
  fi

  rm -f "$ROOT/$probe"
  if ! bash "$0" >/dev/null 2>&1; then
    echo "self-test: FAIL — 위반을 치웠는데 게이트가 여전히 죽는다 (레포에 실제 위반이 있다)" >&2
    st=1
  else
    echo "self-test: 통제군 OK (위반이 없으면 통과한다)"
  fi

  exit "$st"
fi

# 격리 폴더. 이 안의 파일을 가리키는 활성 참조는 실패한다.
#
# 폴더 이름만 언급하는 것은 위반이 아니다. 레포의 모양을 서술하는 일이고,
# `docs/architecture/repo-layout.md`는 그것을 할 수 있어야 한다. 막는 형태는
# 폴더 안 파일을 가리키는 경로다 — 독자를 낡은 내용으로 보내는 포인터.
HISTORY_FILE_RE='development-records/[A-Za-z0-9._/-]*\.(md|yaml|yml|json|html|ts|mts|ndjson|xlsx|csv|txt|sh)'

# 활성 문서가 가리킬 수 있는 레포 문서 경로. 이 형태로 적힌 것은 디스크에 있어야 한다.
#
# `evidence/*.json`도 포함한다: `supported-models.yaml`의 `benchmark_evidence_refs`는
# 독자용 링크가 아니라 검증기가 경로로 조회하는 **기계 키**라, 어긋나면 모델 등록이
# 근거를 잃는다. URL로 적으면 조회가 깨진다 — 상대경로여야 한다.
DOC_REF_RE='(docs|development-records|evidence)/[A-Za-z0-9._/-]*\.(md|html)|evidence/[A-Za-z0-9._/-]*\.json|\.onto/(authority|principles|processes|roles|domains)/[A-Za-z0-9._/-]*\.(md|yaml)'

# 대상은 **git이 소스로 보는 파일** — 추적 중이거나, 새로 만들었지만 ignore되지
# 않은 것. `.onto/`에는 실행 세션 산출물(`review/`, `reconstruct/`)과 벤치 작업
# 영역(`temp/`, 외부 코퍼스 사본 포함)이 같이 사는데 그것들은 소스가 아니다.
# ignore 규칙을 도구의 순회에 맡기면 경로 인자를 어떻게 넘겼느냐에 따라 결과가
# 달라진다 — git에게 직접 묻는 것은 그렇지 않다.
#
# `--others`가 있어야 아직 커밋하지 않은 새 파일의 위반도 잡힌다. 추적 파일만
# 보면 방금 만든 파일은 게이트에 보이지 않는다.
#
# 테스트는 제외한다: 테스트는 자신이 파생된 아티팩트를 정당하게 이름 부를 수 있다.
# 하니스(`scripts/`)도 제외한다: 자기가 만드는 기록의 출력 경로를 적는 것이 일이다.
tracked() {
  git ls-files --cached --others --exclude-standard -- "$@" 2>/dev/null \
    | sort -u | grep -v '\.test\.ts$'
}

# 격리 검사 대상 = 활성 런타임.
#
# README.md·AGENTS.md·CLAUDE.md는 여기서 빠진다. 이 셋은 런타임의 포인터가 아니라
# 지도다: 이력이 어디 사는지 말하는 것이 그들의 일이라 격리 폴더를 이름 부를 수
# 있어야 한다. 대신 dangling 검사에는 포함된다 — 죽은 링크는 지도에서도 죽은 링크다.
isolation_files=$(tracked src .onto docs)

# dangling 검사 대상 = 활성 런타임 + 지도.
#
# `evidence/`에서는 README만 본다. 승격된 기록은 자기 실행이 만든 아티팩트를
# 이름 부르는데, 그 아티팩트는 그 실행의 사실이지 지금 존재해야 할 파일이 아니다.
dangling_files=$(tracked src .onto docs README.md AGENTS.md CLAUDE.md INVARIANTS.md llms.txt evidence/README.md)

fail=0

# ── 공집합 방지 ────────────────────────────────────────────────────────────────
# 대상이 비면 모든 검사가 공허하게 통과한다. 빈 집합은 무엇이든 만족한다.
subject_count=$(printf '%s\n' "$isolation_files" | grep -c . || true)
if [ "$subject_count" -lt 100 ]; then
  echo "doc-currency: 대상 파일이 ${subject_count}개뿐이다 — 검사가 공허하게 통과한다" >&2
  exit 2
fi

echo "=== 1. 격리 (차단) ==="
# `-H`는 파일명을 강제한다. xargs가 마지막 배치에 파일 하나만 넘기면 rg가 파일명을
# 생략하고, 그러면 아래 파일 수 집계가 조용히 틀린다.
iso_hits=$(printf '%s\n' "$isolation_files" | tr '\n' '\0' \
  | xargs -0 rg --text -H -n -o -e "$HISTORY_FILE_RE" 2>/dev/null | sort -u || true)
if [ -n "$iso_hits" ]; then
  printf '%s\n' "$iso_hits" | sed 's/^/  /'
  n=$(printf '%s\n' "$iso_hits" | grep -c .)
  f=$(printf '%s\n' "$iso_hits" | cut -d: -f1 | sort -u | grep -c .)
  echo "격리: FAIL — 활성 런타임이 이력 파일을 ${n}곳에서 가리킨다 (${f}개 파일)."
  echo "  포인터를 지우고 제약을 현재형으로 적는다. 증거가 필요하면 evidence/로 승격한다."
  fail=1
else
  echo "격리: OK (활성 런타임 → 이력 파일 참조 없음)"
fi

echo "=== 2. dangling (차단) ==="
# `...`이 든 경로는 문서가 형태를 보여주는 예시다 — 실재해야 할 포인터가 아니다.
doc_refs=$(printf '%s\n' "$dangling_files" | tr '\n' '\0' \
  | xargs -0 rg --text -o -I -e "$DOC_REF_RE" 2>/dev/null | grep -v '\.\.\.' | sort -u || true)

dangling=""
while IFS= read -r ref; do
  [ -n "$ref" ] || continue
  [ -e "$ref" ] && continue
  dangling="$dangling$ref"$'\n'
done < <(printf '%s\n' "$doc_refs")

ref_count=$(printf '%s\n' "$doc_refs" | grep -c . || true)
if [ "$ref_count" -lt 1 ]; then
  echo "doc-currency: 문서 참조가 0건이다 — 정규식이 죽었다" >&2
  exit 2
fi

if [ -n "${dangling%$'\n'}" ]; then
  printf '%s' "$dangling" | sed 's/^/  없음: /'
  echo "dangling: FAIL — 활성 파일이 존재하지 않는 경로를 가리킨다."
  echo "  가리키는 쪽을 고치거나, 가리켜지는 파일을 올린다."
  fail=1
else
  echo "dangling: OK (${ref_count}개 문서 참조 전부 실재)"
fi

echo "=== 3. 과거 서사 (보고만) ==="
# 현재의 사실을 서술할 수 없는 표지만 고른다: 각각이 "지금과 달랐다"를 주장한다.
TENSE='예전에는|이전 판|기각됐|폐기됐|라운드 [0-9]|used to be|used to live|used to read|previously |an earlier |earlier revision|a review found|rejected in review|had been'
tense_hits=$(printf '%s\n' "$isolation_files" | tr '\n' '\0' \
  | xargs -0 rg --text -H -n -e "^[[:space:]]*(//|\*|#|>)" 2>/dev/null | rg -e "$TENSE" || true)
if [ -n "$tense_hits" ]; then
  n=$(printf '%s\n' "$tense_hits" | grep -c .)
  printf '%s\n' "$tense_hits" | head -20 | sed 's/^/  /'
  [ "$n" -gt 20 ] && echo "  ... 그리고 $((n - 20))건 더"
  echo "과거 서사: ${n}줄이 과거를 서술한다. 차단하지 않는다 — 사람이 정한다."
else
  echo "과거 서사: OK"
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "doc-currency: FAILED"
  exit 1
fi
echo
echo "doc-currency: OK (대상 ${subject_count}파일, 문서 참조 ${ref_count}건)"
