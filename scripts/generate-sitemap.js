import { execFileSync } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";

const site = "https://exclusive.jason-shadow.com";
const routes = [
  { path: "/", files: ["index.html", "src", "assets/css"] },
  { path: "/de/", files: ["de", "assets/css/seo-landing.css"] },
  { path: "/en/", files: ["en", "assets/css/seo-landing.css"] },
  { path: "/linktree/", files: ["linktree"] },
  { path: "/legal/", files: ["legal/index.html", "assets/css/adult.css"] },
  { path: "/legal/eu/", files: ["legal/eu"] },
  { path: "/legal/us/", files: ["legal/us"] },
];

function isoDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function lastModified(files) {
  try {
    const dirty = execFileSync("git", ["status", "--porcelain", "--", ...files], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (dirty) return isoDay(Date.now());
    if (!dirty) {
      const committed = execFileSync("git", ["log", "-1", "--format=%cs", "--", ...files], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(committed)) return committed;
    }
  } catch {
    // A source archive may not include Git metadata; file timestamps are the fallback.
  }
  const timestamps = files.flatMap((file) => {
    try {
      return [statSync(file).mtimeMs];
    } catch {
      return [];
    }
  });
  return isoDay(timestamps.length ? Math.max(...timestamps) : Date.now());
}

const entries = routes.map(({ path, files }) => `  <url>
    <loc>${site}${path}</loc>
    <lastmod>${lastModified(files)}</lastmod>
  </url>`).join("\n");

writeFileSync("public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`, "utf8");
