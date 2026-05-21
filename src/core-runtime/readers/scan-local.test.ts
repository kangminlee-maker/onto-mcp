import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { scanLocal } from "./scan-local.js";

const TMP = join(import.meta.dirname ?? ".", ".tmp-scanlocal-test");

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("scanLocal", () => {
  // Depends on patterns/ module (deferred — code parser infrastructure not yet absorbed)
  it.skip("scans a directory and returns ScanResult", () => {
    writeFileSync(join(TMP, "app.ts"), 'import { foo } from "./foo";\nconst x = process.env.API_KEY;');
    writeFileSync(join(TMP, "foo.ts"), "export const foo = 1;");

    const result = scanLocal({ type: "add-dir", path: TMP });

    expect(result.files.length).toBeGreaterThanOrEqual(2);
    expect(result.dependency_graph.length).toBeGreaterThan(0);
    expect(result.config_patterns.length).toBeGreaterThan(0);
    expect(Object.keys(result.content_hashes).length).toBe(1);
  });

  // Depends on patterns/ module (deferred)
  it.skip("scans a single file", () => {
    const filePath = join(TMP, "single.ts");
    writeFileSync(filePath, 'import { bar } from "bar";');

    const result = scanLocal({ type: "add-dir", path: filePath });

    expect(result.files).toHaveLength(1);
    expect(result.dependency_graph).toHaveLength(1);
  });

  it("returns empty for non-existent path", () => {
    const result = scanLocal({ type: "add-dir", path: join(TMP, "nope") });
    expect(result.files).toEqual([]);
    expect(result.dependency_graph).toEqual([]);
  });

  it("excludes .git and node_modules", () => {
    mkdirSync(join(TMP, ".git"), { recursive: true });
    writeFileSync(join(TMP, ".git", "config"), "git");
    mkdirSync(join(TMP, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(TMP, "node_modules", "pkg", "index.js"), "code");
    writeFileSync(join(TMP, "app.ts"), "const a = 1;");

    const result = scanLocal({ type: "add-dir", path: TMP });
    expect(result.files.map(f => f.path)).toEqual(["app.ts"]);
  });

  // Depends on patterns/ module (deferred)
  it.skip("detects API patterns in Java file", () => {
    writeFileSync(join(TMP, "Controller.java"),
      '@GetMapping("/api/users")\npublic List<User> getUsers() {}');

    const result = scanLocal({ type: "add-dir", path: TMP });
    expect(result.api_patterns.length).toBeGreaterThan(0);
    expect(result.api_patterns[0]!.method).toBe("GET");
  });

  // Depends on patterns/ module (deferred)
  it.skip("detects schema patterns", () => {
    writeFileSync(join(TMP, "V1__init.sql"), "CREATE TABLE users (\n  id BIGINT PRIMARY KEY\n);");

    const result = scanLocal({ type: "add-dir", path: TMP });
    expect(result.schema_patterns.length).toBeGreaterThan(0);
    expect(result.schema_patterns[0]!.table).toBe("users");
  });

  it("produces consistent hashes", () => {
    writeFileSync(join(TMP, "a.ts"), "const a = 1;");
    const r1 = scanLocal({ type: "add-dir", path: TMP });
    const r2 = scanLocal({ type: "add-dir", path: TMP });
    expect(Object.keys(r1.content_hashes)[0]).toBe(Object.keys(r2.content_hashes)[0]);
  });

  // ─── W-A-76: ontology-absent path (r−) fallback grounding surface ───
  //
  // scan-local 이 ontology YAML 부재 시 review lens 에게 제공하는 최소 grounding 재료를
  // 검증한다. files 와 content_hashes 는 patterns/ 모듈 미이전과 독립적으로 산출되어야
  // r− 경로의 기준선 grounding 을 보장한다.

  describe("W-A-76 r− fallback grounding", () => {
    it("ontology YAML 이 전혀 없어도 files 배열에 직접 파일들을 나열한다", () => {
      writeFileSync(join(TMP, "README.md"), "# project\n");
      writeFileSync(join(TMP, "service.ts"), "export const x = 1;\n");
      writeFileSync(join(TMP, "settings.json"), "key: value\n");

      const result = scanLocal({ type: "add-dir", path: TMP });

      // lens 가 grounding 에 쓸 수 있는 최소 signal: 파일 경로 + content_hash
      const paths = result.files.map((f) => f.path).sort();
      expect(paths).toEqual(["README.md", "settings.json", "service.ts"]);
      expect(Object.keys(result.content_hashes).length).toBe(1);
    });

    it("code-mapping.yaml / behavior.yaml / model.yaml 이 존재해도 scan-local 자체는 ontology 를 consume 하지 않는다", () => {
      // r− 경로는 scan-local 을 사용하는데, scan-local 은 ontology 구조를 해석하지 않고
      // 파일만 나열한다. 이것이 r− 경로의 grounding 한계를 구조적으로 보장한다.
      writeFileSync(join(TMP, "code-mapping.yaml"), "glossary: []\n");
      writeFileSync(join(TMP, "behavior.yaml"), "actions: []\n");
      writeFileSync(join(TMP, "model.yaml"), "entities: []\n");
      writeFileSync(join(TMP, "service.ts"), "export const x = 1;\n");

      const result = scanLocal({ type: "add-dir", path: TMP });

      // ontology YAML 들은 단순 파일로만 등장. matched_entities 같은 구조화된 산출 없음.
      const paths = result.files.map((f) => f.path).sort();
      expect(paths).toContain("code-mapping.yaml");
      expect(paths).toContain("behavior.yaml");
      expect(paths).toContain("model.yaml");
      expect(paths).toContain("service.ts");
      // scan-local 은 OntologyQueryResult 를 반환하지 않음 — 형식 자체가 다름.
      expect("matched_entities" in result).toBe(false);
    });

    it("빈 디렉터리도 r− fallback 의 적법한 baseline 을 반환한다 (files=[], 해시 구조 유지)", () => {
      const result = scanLocal({ type: "add-dir", path: TMP });

      expect(result.files).toEqual([]);
      // 디렉터리 스캔은 빈 해시 맵이라도 content_hashes 키를 하나 둔다 (source key).
      expect(Object.keys(result.content_hashes).length).toBe(1);
      // lens 는 이 baseline 에서 "대상 비어있음" 을 판단할 수 있다.
    });
  });
});
