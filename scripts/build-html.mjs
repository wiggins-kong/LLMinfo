import { build } from "esbuild";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "llminfo.html");

const result = await build({
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  loader: { ".css": "css" },
  write: false,
  outdir: path.join(root, ".build-temp"),
  logLevel: "warning",
});

let js = "";
let css = "";
for (const file of result.outputFiles) {
  if (file.path.endsWith(".js")) js = file.text;
  if (file.path.endsWith(".css")) css = file.text;
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://models.dev data:; connect-src https://models.dev; font-src data:; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>LLMinfo · 模型信息看板</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js.replaceAll("</script>", "<\\/script>")}</script>
</body>
</html>
`;

await writeFile(outfile, html, "utf8");
await rm(path.join(root, ".build-temp"), { recursive: true, force: true });

const stats = await readFile(outfile);
console.log(`llminfo.html written: ${(stats.byteLength / 1024 / 1024).toFixed(2)} MB`);
