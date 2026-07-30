/**
 * B안(배달만 구간화, 인용은 관찰 단위)이 실제로 무엇을 해결하는지 재는 스크립트.
 *
 * 인용이 관찰 단위로 남으면 게이트는 여전히 "이 관찰이 전부 도달했는가"를 묻는다. 그러면 크기 절벽이
 * 사라지는 게 아니라 **호출 비용**으로 바뀔 뿐이다. 얼마나 바뀌는지가 결정을 가른다.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  fixObservationSnapshot,
  readObservationPage,
} from "../../../src/core-runtime/reconstruct/observation-read.js";

const F = "/Users/kangmin/Documents/onto-mcp/scripts/fixtures/observation-catalog";
const snapshot = fixObservationSnapshot(
  readFileSync(`${F}/source-observations.yaml`, "utf8"),
  parseYaml(readFileSync(`${F}/source-safety-ledger.yaml`, "utf8")) as never,
);

/** Pages needed to fetch ONE observation alone at a budget = calls needed to fully deliver it. */
function soloPages(id: string, budget: number): number {
  let cursor: string | undefined;
  let pages = 0;
  for (;;) {
    const page = readObservationPage({
      snapshot,
      request: cursor === undefined ? { observation_ids: [id] } : { cursor },
      pageCharBudget: budget,
    });
    pages += 1;
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return pages;
}

const CALL_LIMIT = 32;
for (const budget of [65_536, 32_000]) {
  const costs = snapshot.entries
    .map((e) => ({ id: e.observation_id, chars: e.body.length, pages: soloPages(e.observation_id, budget) }))
    .sort((a, b) => b.pages - a.pages);
  const onePage = costs.filter((c) => c.pages === 1).length;
  const total = costs.reduce((a, c) => a + c.pages, 0);
  console.log(`\n=== 예산 ${budget.toLocaleString()} · 호출 상한 ${CALL_LIMIT} ===`);
  console.log(`1페이지에 담기는 관찰      : ${onePage} / ${costs.length}`);
  console.log(`가장 비싼 관찰            : ${costs[0]!.pages}페이지 (${costs[0]!.chars.toLocaleString()}자)`);
  console.log(`상위 5개 페이지 수        : ${costs.slice(0, 5).map((c) => c.pages).join(", ")}`);
  console.log(`전 관찰을 전부 배달하려면  : ${total}호출 (상한 ${CALL_LIMIT} 대비 ${(total / CALL_LIMIT).toFixed(1)}배)`);

  // Greedy: how many observations can be FULLY delivered inside the call limit, cheapest first?
  const cheapFirst = [...costs].sort((a, b) => a.pages - b.pages);
  let spent = 0;
  let delivered = 0;
  for (const c of cheapFirst) {
    if (spent + c.pages > CALL_LIMIT) break;
    spent += c.pages;
    delivered += 1;
  }
  console.log(`상한 안에서 전부 배달 가능 : ${delivered}개 (${spent}호출) — 나머지 ${costs.length - delivered}개는 인용 불가`);
  // Cost of ONE large observation against the whole budget.
  console.log(`최대 관찰 하나가 쓰는 몫   : ${costs[0]!.pages}/${CALL_LIMIT} = ${((costs[0]!.pages / CALL_LIMIT) * 100).toFixed(0)}%`);
}
