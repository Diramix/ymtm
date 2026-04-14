/**
 * src-resolver.js  —  lives at ymtm/src/src-resolver.js
 *
 * addon src/ layout:
 *
 *   src/
 *     metadata.json        ← addon metadata (fields: script, css)
 *     assets/              ← images/fonts → assets/ in nm & ps builds
 *     ps/                  ← exclusive to PulseSync
 *     nm/                  ← exclusive to NextMusic
 *     web/                 ← exclusive to Web
 *     **\/*.js / **\/*.css  ← shared (recursive, excl. target folders & assets)
 *
 * Both build AND dev: concat all JS → one file, all CSS → one file, then minify.
 * Names from metadata.json "script" / "css" fields (fallback: script.js / style.css).
 */

import fs from "fs";
import path from "path";
import {
    ensureDir,
    copyRecursive,
    shouldIgnore,
    IMAGE_EXTS,
    bundleJS,
    minifyCSS,
    applyReplacements,
} from "./utils.js";

// Target-specific folder names — never included in "shared"
const TARGET_FOLDERS = new Set(["ps", "nm", "web"]);

// ── Source collection ─────────────────────────────────────────────────────────

/**
 * Find ALL directories named `name` anywhere inside `root`, recursively.
 * Stops descending into target folders and assets/ to avoid false matches.
 */
function findDirsNamed(root, name, ignoreRules = []) {
    const found = [];
    if (!fs.existsSync(root)) return found;

    function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const full = path.join(dir, entry.name);
            if (shouldIgnore(full, ignoreRules)) continue;
            if (entry.name === name) {
                found.push(full);
                // don't descend into the matched folder itself
                continue;
            }
            walk(full);
        }
    }

    walk(root);
    return found;
}

/**
 * Find ALL directories named `assets` anywhere inside `root`, recursively.
 * Skips descent into target folders.
 */
function findAssetsDirs(root, ignoreRules = []) {
    const found = [];
    if (!fs.existsSync(root)) return found;

    function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const full = path.join(dir, entry.name);
            if (shouldIgnore(full, ignoreRules)) continue;
            if (entry.name === "assets") {
                found.push(full);
                continue;
            }
            // don't descend into target folders
            if (TARGET_FOLDERS.has(entry.name)) continue;
            walk(full);
        }
    }

    walk(root);
    return found;
}

/**
 * Collect files for a given target.
 *
 * shared         = all files outside any target folder or assets/, recursively
 * targetSpecific = files inside ALL folders named <targetFolder> found anywhere
 * assets         = files inside ALL folders named "assets" found anywhere
 *                  (excluding those nested under another target folder)
 *
 * Order within each group: alphabetical depth-first for deterministic bundles.
 */
export function collectSourceFiles(srcDir, targetFolder, ignoreRules = []) {
    const shared = [];
    const targetSpecific = [];
    const assets = [];

    if (!fs.existsSync(srcDir)) return { shared, targetSpecific, assets };

    // Locate every occurrence of the target folder anywhere under srcDir
    const targetDirs = findDirsNamed(srcDir, targetFolder, ignoreRules);

    // Locate every assets/ dir (not nested under a target folder)
    const assetsDirs = findAssetsDirs(srcDir, ignoreRules);

    // Build a set of absolute prefixes to skip during shared collection
    const skipPrefixes = new Set([
        ...targetDirs,
        ...assetsDirs,
        // also skip ALL other target folders so they never bleed into shared
        ...[...TARGET_FOLDERS]
            .filter((f) => f !== targetFolder)
            .flatMap((f) => findDirsNamed(srcDir, f, ignoreRules)),
    ]);

    collectShared(srcDir, shared, ignoreRules, skipPrefixes);
    for (const dir of targetDirs) collectAll(dir, targetSpecific, ignoreRules);
    for (const dir of assetsDirs) collectAll(dir, assets, ignoreRules);

    return { shared, targetSpecific, assets };
}

/**
 * Recursively collect files, skipping any directory whose absolute path is
 * in skipPrefixes (or is a descendant of one).
 */
function collectShared(dir, result, ignoreRules, skipPrefixes) {
    if (!fs.existsSync(dir)) return;
    const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (shouldIgnore(full, ignoreRules)) continue;

        if (entry.isDirectory()) {
            if (skipPrefixes.has(full)) continue;
            collectShared(full, result, ignoreRules, skipPrefixes);
        } else {
            result.push(full);
        }
    }
}

function collectAll(dir, result, ignoreRules) {
    if (!fs.existsSync(dir)) return;
    const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (shouldIgnore(full, ignoreRules)) continue;
        if (entry.isDirectory()) collectAll(full, result, ignoreRules);
        else result.push(full);
    }
}

// ── Asset copy ────────────────────────────────────────────────────────────────

export function copyAssetsToOut(srcDir, outDir, ignoreRules = []) {
    // Copy all assets/ directories found anywhere under srcDir
    const assetsDirs = findAssetsDirs(srcDir, ignoreRules);
    for (const assetsDir of assetsDirs) {
        // Preserve relative sub-path so nested assets/ land in the right place:
        // src/foo/assets/ → outDir/assets/  (collapse to flat assets/)
        copyRecursive(assetsDir, path.join(outDir, "assets"), ignoreRules);
    }
}

// ── Bundle name resolution ────────────────────────────────────────────────────

export function getBundleNames(metadata) {
    return {
        js: metadata?.script ?? "script.js",
        css: metadata?.css ?? "style.css",
    };
}

// ── Bundler (used for BOTH build and dev) ─────────────────────────────────────

/**
 * Concatenate + minify all JS into one bundle, all CSS into one bundle.
 * Non-code files (JSON, README, images, …) are copied as-is.
 *
 * @param {string[]} allFiles      - ordered: shared first, then target-specific
 * @param {string}   srcDir        - addon src root (for relative log labels)
 * @param {string}   targetFolder  - "ps" | "nm" | "web"
 * @param {string}   outDir        - destination directory
 * @param {object}   metadata      - parsed metadata.json or null
 * @param {Array}    replacements  - [{from, to}]
 * @param {Function} logFile       - log.file(action, name)
 * @param {string[]} ignoreRules
 */
export function bundleToDir(
    allFiles,
    srcDir,
    targetFolder,
    outDir,
    metadata,
    replacements,
    logFile,
    ignoreRules = [],
) {
    const { js: jsName, css: cssName } = getBundleNames(metadata);

    const jsFiles = [];
    const cssChunks = [];

    for (const srcFile of allFiles) {
        const ext = path.extname(srcFile).toLowerCase();
        const base = path.basename(srcFile, ext);

        // Handled separately by each builder
        if (path.basename(srcFile) === "metadata.json") continue;
        // Skip files that live inside any assets/ directory (handled by copyAssetsToOut)
        if (srcFile.replace(/\\/g, "/").split("/").includes("assets")) continue;
        if (base === "icon" && IMAGE_EXTS.includes(ext)) continue;

        if (ext === ".js" || ext === ".ts") {
            jsFiles.push(srcFile);
            logFile("minify", path.relative(srcDir, srcFile) + " → " + jsName);
        } else if (ext === ".css") {
            let content = fs.readFileSync(srcFile, "utf8");
            content = applyReplacements(content, replacements);
            cssChunks.push(minifyCSS(srcFile, content).trim());
            logFile("minify", path.relative(srcDir, srcFile) + " → " + cssName);
        } else if (IMAGE_EXTS.includes(ext)) {
            const dest = path.join(outDir, path.basename(srcFile));
            ensureDir(path.dirname(dest));
            fs.copyFileSync(srcFile, dest);
            logFile("copy", path.relative(srcDir, srcFile));
        } else {
            // JSON, README.md, handleEvents.json, etc.
            const rel = relativeOutputPath(srcFile, srcDir, targetFolder);
            const dest = path.join(outDir, rel);
            ensureDir(path.dirname(dest));
            fs.copyFileSync(srcFile, dest);
            logFile("copy", rel);
        }
    }

    if (jsFiles.length > 0) {
        ensureDir(outDir);
        const bundled = bundleJS(jsFiles, replacements);
        fs.writeFileSync(path.join(outDir, jsName), bundled, "utf8");
        logFile("write", jsName);
    }

    if (cssChunks.length > 0) {
        ensureDir(outDir);
        fs.writeFileSync(
            path.join(outDir, cssName),
            cssChunks.join(""),
            "utf8",
        );
        logFile("write", cssName);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function relativeOutputPath(filePath, srcDir, targetFolder) {
    // Walk up from filePath looking for a segment named targetFolder
    const parts = filePath.replace(/\\/g, "/").split("/");
    const tIdx = parts.lastIndexOf(targetFolder);
    if (tIdx !== -1) {
        return parts.slice(tIdx + 1).join("/");
    }
    return path.relative(srcDir, filePath);
}
