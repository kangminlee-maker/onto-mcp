#!/usr/bin/env node
// prepare 가드 — 소스가 없는 곳에서는 빌드를 시작하지 않는다.
//
// `prepare`는 레포와 git 설치에서 TS를 빌드하려고 있다. 같은 스크립트가 설치본에서
// 실행되면 `build:ts-core`의 첫 단계인 `clean:ts-core`가 **배포된 `dist/`를 먼저
// 지우고**, 그 다음 `tsconfig.json`도 `src/`도 `tsc`도 없어 빌드가 실패한다.
// 남는 것은 런타임이 사라진 설치다.
//
// 소스가 없으면 빌드할 것도 없다: 조용히 통과한다. 소스가 있으면 빌드는 그대로
// 돌고, 실패는 그대로 전파된다 — 이 가드는 실패를 삼키지 않는다.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hasSource =
  existsSync(path.join(root, "src")) && existsSync(path.join(root, "tsconfig.json"));

if (!hasSource) process.exit(0);

execFileSync("npm", ["run", "build:ts-core"], { cwd: root, stdio: "inherit" });
