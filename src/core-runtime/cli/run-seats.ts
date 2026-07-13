/**
 * `onto seats` — print a read-only inventory of every LLM model seat the
 * runtime can dispatch, resolved against the settings.json chain for the
 * current project. Discovery only: it writes nothing and changes no behaviour.
 */
import { resolveSettingsChain } from "../discovery/settings-chain.js";
import {
  collectSeatInventory,
  renderSeatInventoryTable,
} from "../discovery/seat-inventory.js";

export async function runSeats(argv: string[]): Promise<number> {
  const asJson = argv.includes("--json");
  const settings = await resolveSettingsChain(process.cwd(), process.cwd());
  const rows = collectSeatInventory(settings);
  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  console.log(renderSeatInventoryTable(rows));
  return 0;
}
