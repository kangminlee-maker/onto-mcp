// Adversarial shape 3: mostly top-level statements (script style) — little
// declaration structure; partition must stay valid and honest about low signal.
import fs from "node:fs";

const input = fs.readFileSync(process.argv[2] ?? "data.txt", "utf8");
const lines = input.split("\n").filter((l) => l.trim().length > 0);
let total = 0;
for (const line of lines) {
  const n = Number.parseFloat(line);
  if (!Number.isNaN(n)) {
    total += n;
  }
}
const mean = lines.length === 0 ? 0 : total / lines.length;
console.log(JSON.stringify({ count: lines.length, total, mean }));
if (mean > 100) {
  console.error("mean unexpectedly large");
  process.exit(1);
}
