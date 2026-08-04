#!/usr/bin/env python3
"""보존 seed 2벌의 source-observations에서 (경로, content_sha256) 쌍을 추출하고,
모든 쌍이 동시에 일치하는 커밋을 git 이력에서 도출한다.

실행 기록 (2026-08-01): 핀 커밋 6c364a0a5bca31fe4227cdfc4fa2d595d68d8a0f 도출,
2/2 쌍 일치. 해당 커밋 제목("arm 산출물 생성 전 핀")이 의도를 교차 확증.
상세: p0-preflight.md §③"""
import re, subprocess, hashlib, sys

REPO = "/Users/kangmin/Documents/onto-mcp"
RUNS = [
    f"{REPO}/.onto/reconstruct/20260720-dd6-live-exp1/source-observations.yaml",
    f"{REPO}/.onto/reconstruct/20260720-dd6-live-exp2/source-observations.yaml",
]
RUN_TS = "2026-07-20T10:00:00+09:00"  # created_at 00:31Z보다 넉넉히 뒤 (같은 날 오전)

def git(*args, binary=False):
    r = subprocess.run(["git", "-C", REPO, *args], capture_output=True)
    if r.returncode != 0:
        return None
    return r.stdout if binary else r.stdout.decode()

# 1) (repo-relative path, sha256) 쌍 추출 — observation 블록 단위
pairs = {}
for run in RUNS:
    text = open(run, encoding="utf-8", errors="replace").read()
    blocks = re.split(r"\n  - observation_id:", text)
    for b in blocks[1:]:
        m_ref = re.search(r"source_ref: (\S+)", b)
        m_sha = re.search(r"content_sha256: ([0-9a-f]{64})", b)
        if not (m_ref and m_sha):
            continue
        p = m_ref.group(1)
        if not p.startswith(REPO + "/"):
            continue
        rel = p[len(REPO) + 1:]
        sha = m_sha.group(1)
        prev = pairs.get(rel)
        if prev and prev != sha:
            print(f"⚠ 두 run이 같은 파일을 다른 내용으로 관측: {rel}")
            print(f"   exp1={prev[:12]} exp2={sha[:12]} → 핀 커밋이 run별로 다를 수 있음")
        pairs[rel] = sha

print(f"관측된 (파일, 해시) 쌍: {len(pairs)}개")
for rel in sorted(pairs):
    print(f"  {pairs[rel][:12]}  {rel}")

if not pairs:
    sys.exit("쌍 0개 — 추출 실패 (공허 방지: 여기서 중단)")

# 2) 후보 커밋: run 시각 이전의 커밋들 (전 브랜치)
log = git("log", "--all", "--format=%H %cI", f"--until={RUN_TS}", "-100")
if not log:
    sys.exit("git log 실패")
candidates = [l.split() for l in log.strip().splitlines()]
print(f"\nrun 시각({RUN_TS}) 이전 후보 커밋 {len(candidates)}개 검사 (최신부터)")

def verify(commit):
    misses = []
    for rel, want in pairs.items():
        blob = git("show", f"{commit}:{rel}", binary=True)
        if blob is None:
            misses.append((rel, "파일 없음"))
            continue
        got = hashlib.sha256(blob).hexdigest()
        if got != want:
            misses.append((rel, f"불일치 {got[:12]}"))
    return misses

for commit, date in candidates:
    misses = verify(commit)
    if not misses:
        print(f"\n✅ 핀 커밋 도출: {commit} ({date}) — {len(pairs)}/{len(pairs)} 쌍 전부 일치")
        subj = git("log", "-1", "--format=%s", commit)
        print(f"   제목: {subj.strip() if subj else '?'}")
        sys.exit(0)

print("\n❌ 100개 후보 내 전량 일치 커밋 없음 — 최신 후보의 불일치 상세:")
for rel, why in verify(candidates[0][0])[:10]:
    print(f"  {why}  {rel}")
sys.exit(1)
