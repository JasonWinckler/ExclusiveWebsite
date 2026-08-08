import { cp, mkdir, rm } from "node:fs/promises";

const siteEntries = [
  "assets",
  "datenschutz",
  "de",
  "en",
  "impressum",
  "legal",
  "linktree",
];

await rm("dist", { force: true, recursive: true });
await mkdir("dist", { recursive: true });
await Promise.all(siteEntries.map((entry) => cp(entry, `dist/${entry}`, { recursive: true })));

