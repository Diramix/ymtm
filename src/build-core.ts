/**
 * build-core.ts — единое ядро сборки для всех target'ов.
 *
 * Все правила сборки (копирование иконки/баннера, metadata.json, LICENSE,
 * assets, бандлинг JS/CSS, удаление пустой assets/) живут здесь.
 * Production и dev билдеры используют одну и ту же логику.
 */

import fs from "fs";
import path from "path";
import * as log from "./logger.js";
import {
    ensureDir,
    findImageFile,
    parseBuildIgnore,
    removeEmptyAssetsDir,
} from "./utils.js";
import {
    collectSourceFiles,
    copyAssetsToOut,
    bundleToDir,
} from "./src-resolver.js";
import type { Config } from "./types.js";

// ── Public API ────────────────────────────────────────────────────────────────

export interface BuildOptions {
    /** Target folder name inside src/ ("ps", "nm", "web") */
    targetFolder: string;
    /** Output directory for the build result */
    outDir: string;
    /** Whether to suppress logging (true for dev/watch) */
    silent?: boolean;
    /** Copy LICENSE from project root into outDir */
    copyLicense?: boolean;
    /** Copy metadata.json from src/ into outDir */
    copyMetadata?: boolean;
}

/**
 * Execute a full build into `outDir` using the given options.
 * This is the single source of truth for how ps/nm builds are assembled.
 */
export function buildToDir(config: Config, opts: BuildOptions): void {
    const srcDir = config._srcDir;
    const metadata = config._metadata;
    const replacements = config.web?.replaceLink ?? [];
    const ignoreRules = parseBuildIgnore(config._buildIgnore);
    const silent = opts.silent ?? false;

    const noop = () => {};
    const logFile: (action: string, name: string) => void = silent ? noop : (a, n) => log.file(a, n);
    const logWarn: (msg: string) => void = silent ? noop : log.warn;

    const { shared, targetSpecific, assets } = collectSourceFiles(
        srcDir,
        opts.targetFolder,
        ignoreRules,
    );
    const allFiles = [...shared, ...targetSpecific];

    ensureDir(opts.outDir);

    // ── Icon ──────────────────────────────────────────────────────────────
    const brandingDir = path.join(srcDir, "assets", "branding");
    const iconFile =
        findImageFile(brandingDir, "icon") ?? findImageFile(srcDir, "icon");
    if (iconFile) {
        const ext = path.extname(iconFile);
        fs.copyFileSync(iconFile, path.join(opts.outDir, `icon${ext}`));
        logFile("copy", `icon${ext}`);
    } else {
        logWarn("No icon image found in assets/branding/ or src/");
    }

    // ── Banner ────────────────────────────────────────────────────────────
    const bannerFile =
        findImageFile(brandingDir, "banner") ?? findImageFile(srcDir, "banner");
    if (bannerFile) {
        const ext = path.extname(bannerFile);
        fs.copyFileSync(bannerFile, path.join(opts.outDir, `banner${ext}`));
        logFile("copy", `banner${ext}`);
    }

    // ── metadata.json ─────────────────────────────────────────────────────
    if (opts.copyMetadata) {
        const metaSrc = path.join(srcDir, "metadata.json");
        if (fs.existsSync(metaSrc)) {
            fs.copyFileSync(metaSrc, path.join(opts.outDir, "metadata.json"));
            logFile("write", "metadata.json");
        } else {
            logWarn("metadata.json not found in src/");
        }
    }

    // ── LICENSE ───────────────────────────────────────────────────────────
    if (opts.copyLicense) {
        const licenseSrc = path.join(config._cwd, "LICENSE");
        if (fs.existsSync(licenseSrc)) {
            fs.copyFileSync(licenseSrc, path.join(opts.outDir, "LICENSE"));
            logFile("copy", "LICENSE");
        } else {
            logWarn("LICENSE not found in project root");
        }
    }

    // ── Assets ────────────────────────────────────────────────────────────
    copyAssetsToOut(srcDir, opts.outDir, ignoreRules);
    const outBranding = path.join(opts.outDir, "assets", "branding");
    if (fs.existsSync(outBranding))
        fs.rmSync(outBranding, { recursive: true, force: true });
    if (assets.length > 0) logFile("copy", "assets/");

    // ── Bundle JS/CSS ─────────────────────────────────────────────────────
    bundleToDir(
        allFiles,
        srcDir,
        opts.targetFolder,
        opts.outDir,
        metadata,
        replacements,
        logFile,
        ignoreRules,
    );

    // ── Cleanup: remove empty assets folder ───────────────────────────────
    removeEmptyAssetsDir(opts.outDir);
}
