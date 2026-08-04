#!/usr/bin/env node
// G14 shipped-links — 배포되는 문서의 링크는 설치본 안에서 풀린다.
//
// 레포에서 살아 있는 링크가 설치본에서는 죽는다. `files` allowlist가 문서 일부만
// 싣기 때문이다: 계약은 실리고 `docs/`·`INVARIANTS.md`·`src/`는 실리지 않는다.
// npm으로 받은 사람이 그 링크를 따라가면 아무 데도 없다.
//
// 판정은 결정 가능하다: 링크가 가리키는 경로가 tarball 파일 목록에 있거나 없거나다.
// 그래서 차단한다. 레포 안에서만 유효한 참조는 GitHub URL로 적는다 — 그러면 설치본
// 독자도 따라갈 수 있고, `check-doc-currency.sh`가 URL 안의 경로 조각이 실재하는지
// 계속 검증한다.
//
//   node scripts/check-shipped-links.mjs              검사
//   node scripts/check-shipped-links.mjs --self-test  게이트가 실패할 수 있는지 확인
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** tarball에 실제로 들어가는 파일 목록. `files` allowlist를 다시 구현하지 않고
 *  npm에게 직접 묻는다 — 규칙이 바뀌어도 이 게이트는 따라간다. */
function shippedPaths() {
  const raw = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const parsed = JSON.parse(raw);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed[Object.keys(parsed)[0]];
  if (!entry?.files) throw new Error("npm pack --json 출력에 files가 없다");
  return new Set(entry.files.map((f) => f.path));
}

function deadLinks(shipped) {
  const dead = [];
  let linkCount = 0;
  let docCount = 0;
  for (const file of shipped) {
    if (!file.endsWith(".md")) continue;
    docCount += 1;
    const dir = path.posix.dirname(file);
    const text = fs.readFileSync(path.join(REPO, file), "utf8");
    for (const match of text.matchAll(/\]\(([^)\s#]+)/g)) {
      const ref = match[1];
      if (/^(https?:|mailto:|#)/.test(ref)) continue;
      linkCount += 1;
      const target = path.posix.normalize(path.posix.join(dir, ref)).replace(/\/$/, "");
      if (shipped.has(target)) continue;
      // 디렉터리를 가리키는 링크는 그 아래 파일이 하나라도 실리면 산 것이다.
      let covered = false;
      for (const s of shipped) {
        if (s.startsWith(`${target}/`)) { covered = true; break; }
      }
      if (!covered) dead.push({ file, ref, target });
    }
  }
  return { dead, linkCount, docCount };
}

function run() {
  const shipped = shippedPaths();

  // 공집합 방지. 대상이 비면 "죽은 링크 없음"은 아무것도 증명하지 않는다.
  if (shipped.size < 100) {
    console.error(`shipped-links: tarball 파일이 ${shipped.size}개뿐이다 — 검사가 공허하다`);
    process.exit(2);
  }
  const { dead, linkCount, docCount } = deadLinks(shipped);
  if (docCount < 1 || linkCount < 1) {
    console.error(`shipped-links: 배포 문서 ${docCount}개 / 상대링크 ${linkCount}개 — 검사가 공허하다`);
    process.exit(2);
  }

  if (dead.length > 0) {
    for (const d of dead) console.error(`  ${d.file}\n      → ${d.ref}   (설치본에 ${d.target} 없음)`);
    console.error(`shipped-links: FAIL — 배포 문서의 링크 ${dead.length}건이 설치본에서 죽는다.`);
    console.error("  레포 안에서만 유효한 참조는 GitHub URL로 적는다.");
    return 1;
  }
  console.log(`shipped-links: OK (배포 문서 ${docCount}개, 상대링크 ${linkCount}건 전부 설치본에서 해석됨)`);
  return 0;
}

function selfTest() {
  // 배포되는 위치에 죽은 링크를 심고 게이트가 실제로 죽는지 본다. 실패 카나리아가
  // 없는 게이트는 영원히 초록이다.
  const probe = path.join(REPO, ".onto/roles/link-canary.md");
  let status = 0;
  try {
    fs.writeFileSync(probe, "canary [dead](../../docs/architecture/repo-layout.md)\n");
    if (run() === 0) {
      console.error("self-test: FAIL — 죽은 링크를 심었는데 게이트가 통과했다");
      status = 1;
    } else {
      console.log("self-test: OK (심은 죽은 링크에 죽는다)");
    }
  } finally {
    fs.rmSync(probe, { force: true });
  }
  if (run() !== 0) {
    console.error("self-test: FAIL — 위반을 치웠는데 게이트가 여전히 죽는다 (실제 위반이 있다)");
    status = 1;
  } else {
    console.log("self-test: 통제군 OK (위반이 없으면 통과한다)");
  }
  return status;
}

process.exit(process.argv[2] === "--self-test" ? selfTest() : run());
