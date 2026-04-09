import fs from "fs";
import path from "path";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);

export function loadConfig(cwd = process.cwd()) {
    const pkgPath = path.join(cwd, "package.json");
    if (!fs.existsSync(pkgPath))
        throw new Error(`package.json not found in ${cwd}`);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (!pkg.build) throw new Error('"build" is required in package.json');

    // ── Normalise targets list ─────────────────────────────────────────────────
    // Accepts both "targets" (new) and "package" (legacy) keys.
    const rawTargets = pkg.build.targets ?? pkg.build.package ?? [];
    pkg._targets = rawTargets.map((t) => t.toLowerCase());

    pkg._cwd = cwd;

    // ── ymtm version ──────────────────────────────────────────────────────────
    try {
        const selfPkg = _require("../package.json");
        pkg._version = selfPkg.version || "1.0.0";
    } catch {
        pkg._version = "1.0.0";
    }

    // ── Source directory ──────────────────────────────────────────────────────
    // pkg.build.src  → relative path from cwd, default "src"
    const srcRelative = pkg.build?.src ?? "src";
    pkg._srcDir = path.join(cwd, srcRelative);

    // ── metadata.json ─────────────────────────────────────────────────────────
    // Looked up directly in _srcDir (not in a named sub-folder)
    let metadata = null;
    const metaPath = path.join(pkg._srcDir, "metadata.json");
    if (fs.existsSync(metaPath))
        metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));

    pkg.addonName = metadata?.name ?? pkg.addonName;
    pkg.version = metadata?.version ?? pkg.version;
    pkg._metadata = metadata;

    if (!pkg.addonName)
        throw new Error(
            '"addonName" is required (in package.json or src/metadata.json)',
        );

    // ── .buildignore ──────────────────────────────────────────────────────────
    const ignorePath = path.join(cwd, ".buildignore");
    pkg._buildIgnore = fs.existsSync(ignorePath)
        ? fs.readFileSync(ignorePath, "utf8")
        : "";

    return pkg;
}
