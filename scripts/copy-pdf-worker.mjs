// Copies the pdf.js worker (legacy build) from node_modules into public/, so the worker
// always matches the installed pdfjs-dist version. Runs automatically before every build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "pdf.worker.min.mjs");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`pdf.js worker ${require("pdfjs-dist/package.json").version} copied to public/`);
