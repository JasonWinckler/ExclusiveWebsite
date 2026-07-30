import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const assetDirectory = join(process.cwd(), "dist", "assets");
const files = await readdir(assetDirectory);
const budgets = [
  { pattern: /^index-[\w-]+\.js$/, label: "main JavaScript", maximumBytes: 450_000 },
  { pattern: /^index-[\w-]+\.css$/, label: "main CSS", maximumBytes: 120_000 },
];

for (const budget of budgets) {
  const matching = files.filter((file) => budget.pattern.test(file));
  if (matching.length !== 1) {
    throw new Error(`Expected one ${budget.label} bundle, found ${matching.length}.`);
  }
  const file = matching[0];
  const details = await stat(join(assetDirectory, file));
  if (details.size > budget.maximumBytes) {
    throw new Error(
      `${budget.label} exceeds budget: ${details.size} > ${budget.maximumBytes} bytes (${file}).`,
    );
  }
  console.log(`${budget.label}: ${details.size}/${budget.maximumBytes} bytes`);
}
