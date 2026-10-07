/**
 * Rewrites lucide-react imports in shadcn/ui components to react-icons/lu.
 * shadcn generates components that import Lucide icons; the project rule is
 * "icons from react-icons", so run this after every `shadcn add`:
 *
 *   pnpm icons:swap
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as lu from "react-icons/lu";

/** Lucide names that were renamed upstream and therefore differ in react-icons. */
const RENAMED: Record<string, string> = {
  Loader2: "LoaderCircle",
  MoreHorizontal: "Ellipsis",
  MoreVertical: "EllipsisVertical",
  AlertTriangle: "TriangleAlert",
  AlertCircle: "CircleAlert",
  CheckCircle: "CircleCheck",
  XCircle: "CircleX",
};

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*["']lucide-react["'];?/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

function toReactIcon(lucideName: string): string {
  const base = lucideName.replace(/Icon$/, "");
  const target = `Lu${RENAMED[base] ?? base}`;
  if (!(target in lu)) throw new Error(`No react-icons/lu equivalent for ${lucideName} (tried ${target})`);
  return target;
}

const roots = process.argv.slice(2);
const files = (roots.length > 0 ? roots : ["src"]).flatMap(walk);
let changed = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("lucide-react")) continue;

  const renames = new Map<string, string>();
  let next = source.replace(IMPORT_RE, (_match, names: string) => {
    const icons = names
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const [imported, local] = n.split(/\s+as\s+/);
        if (!imported) throw new Error(`Unparseable import in ${file}: ${n}`);
        const target = toReactIcon(imported);
        renames.set(local ?? imported, target);
        return target;
      });
    return `import { ${[...new Set(icons)].join(", ")} } from "react-icons/lu"`;
  });

  for (const [from, to] of renames) {
    next = next.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }

  if (next !== source) {
    writeFileSync(file, next);
    changed += 1;
    console.log(`swapped icons in ${file}`);
  }
}

console.log(`${changed} file(s) updated`);
