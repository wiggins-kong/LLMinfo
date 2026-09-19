/**
 * Next.js `output: "standalone"` emits a minimal server bundle but does not
 * copy client assets into it. The container needs `.next/static` and `public/`
 * alongside `server.js`, so this mirrors them in after every build.
 *
 * Run automatically via the `postbuild` script.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  console.log("prepare-standalone: no standalone output, skipping");
  process.exit(0);
}

const copies = [
  { from: path.join(root, ".next", "static"), to: path.join(standalone, ".next", "static") },
  { from: path.join(root, "public"), to: path.join(standalone, "public") },
];

for (const { from, to } of copies) {
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`prepare-standalone: ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}
