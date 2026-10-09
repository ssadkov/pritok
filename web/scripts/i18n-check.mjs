// Lists every Russian string in src that is missing from the en/kk dictionary,
// and flags Russian text that cannot be a dictionary key (JSX text, templates).
// Usage: node scripts/i18n-check.mjs [--json out.json]
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../src");
const skip = /(^|[\\/])(idl|i18n-dict\.ts|pritok-client\.ts)/;
const cyr = /[А-Яа-яЁё]/;
const files = fs.readdirSync(root, { recursive: true }).map((f) => path.join(root, f)).filter((f) => /\.tsx?$/.test(f) && !skip.test(f));

const found = new Map();
const problems = [];
for (const file of files) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const rel = path.relative(root, file);
  const visit = (n) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && cyr.test(n.text)) {
      if (!found.has(n.text)) found.set(n.text, rel);
    } else if (ts.isTemplateExpression(n) && [n.head, ...n.templateSpans.map((s) => s.literal)].some((p) => cyr.test(p.text))) {
      problems.push(`${rel}: template with Russian text: ${n.getText().slice(0, 80)}`);
    } else if (ts.isJsxText(n) && cyr.test(n.text)) {
      problems.push(`${rel}: JSX text: ${n.text.trim().slice(0, 80)}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}

const dictSrc = fs.readFileSync(path.join(root, "lib/i18n-dict.ts"), "utf8");
const dictFile = ts.createSourceFile("d.ts", dictSrc, ts.ScriptTarget.Latest, true);
const dict = new Set();
const walk = (n) => {
  if (ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name) || ts.isIdentifier(n.name))) dict.add(n.name.text);
  ts.forEachChild(n, walk);
};
walk(dictFile);

const missing = [...found].filter(([k]) => !dict.has(k));
const unused = [...dict].filter((k) => !found.has(k));
const out = process.argv.indexOf("--json");
if (out > 0) fs.writeFileSync(process.argv[out + 1], JSON.stringify(Object.fromEntries(missing), null, 1));
for (const p of problems) console.log("PROBLEM", p);
for (const [k, f] of missing) console.log("MISSING", f, "|", k);
for (const k of unused) console.log("UNUSED", k);
console.log(`${found.size} strings, ${missing.length} missing, ${unused.length} unused, ${problems.length} problems`);
process.exit(missing.length || problems.length ? 1 : 0);
