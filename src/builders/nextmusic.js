import fs from "fs";
import path from "path";
import * as log from "../logger.js";
import {
    ensureDir,
    findImageFile,
    createTarGz,
    resolveArtifactName,
    addonFolderName,
    fileSize,
    parseBuildIgnore,
} from "../utils.js";
import {
    collectSourceFiles,
    copyAssetsToOut,
    bundleToDir,
} from "../src-resolver.js";

// ── Shared core ───────────────────────────────────────────────────────────────

function buildNextMusicToDir(config, outDir, silent = false) {
    const srcDir = config._srcDir;
    const metadata = config._metadata;
    const replacements = config.web?.replaceLink ?? [];
    const ignoreRules = parseBuildIgnore(config._buildIgnore);
    const noop = () => {};
    const logFile = silent ? noop : (a, n) => log.file(a, n);
    const logWarn = silent ? noop : log.warn;

    const { shared, targetSpecific, assets } = collectSourceFiles(
        srcDir,
        "nm",
        ignoreRules,
    );
    const allFiles = [...shared, ...targetSpecific];

    ensureDir(outDir);

    // icon.<ext> — ищем сначала в assets/branding/, потом в корне src/
    const brandingDir = path.join(srcDir, "assets", "branding");
    const iconFile =
        findImageFile(brandingDir, "icon") ?? findImageFile(srcDir, "icon");
    if (iconFile) {
        const ext = path.extname(iconFile);
        fs.copyFileSync(iconFile, path.join(outDir, `icon${ext}`));
        logFile("copy", `icon${ext}`);
    } else {
        logWarn("No icon image found in assets/branding/ or src/");
    }

    // banner.<ext> — ищем сначала в assets/branding/, потом в корне src/
    const bannerFile =
        findImageFile(brandingDir, "banner") ?? findImageFile(srcDir, "banner");
    if (bannerFile) {
        const ext = path.extname(bannerFile);
        fs.copyFileSync(bannerFile, path.join(outDir, `banner${ext}`));
        logFile("copy", `banner${ext}`);
    }

    // assets/ → outDir/assets/  (без папки branding — она только для сборщика)
    copyAssetsToOut(srcDir, outDir, ignoreRules);
    const outBrandingNm = path.join(outDir, "assets", "branding");
    if (fs.existsSync(outBrandingNm))
        fs.rmSync(outBrandingNm, { recursive: true, force: true });
    if (assets.length > 0) logFile("copy", "assets/");

    bundleToDir(
        allFiles,
        srcDir,
        "nm",
        outDir,
        metadata,
        replacements,
        logFile,
        ignoreRules,
    );
}

// ── Production build ──────────────────────────────────────────────────────────

export function buildNextMusic(config) {
    const cwd = config._cwd;
    const name = config.addonName;
    const version = config.version;

    log.task("nextmusic");
    log.info("building", { target: "nextmusic", addonName: name, version });

    const unpackedFolder = addonFolderName(name, version) + "_nm-unpacked";
    const outDir = path.join(cwd, "dist", unpackedFolder, name);

    buildNextMusicToDir(config, outDir, false);

    const ignoreRules = parseBuildIgnore(config._buildIgnore);
    const tarGzConfig = config.nextmusic?.tarGz;

    if (tarGzConfig) {
        const tarGzName = resolveArtifactName(
            tarGzConfig.artifactName,
            config,
            "nextmusic",
        );
        const tarGzPath = path.join(cwd, "dist", tarGzName);
        createTarGz(tarGzPath, [{ disk: outDir, archive: name }], ignoreRules);
        log.artifact(tarGzName, fileSize(tarGzPath));
        log.done("nextmusic", tarGzName);
    } else {
        log.done("nextmusic");
    }
}

// ── Dev build ─────────────────────────────────────────────────────────────────

export function buildNextMusicDev(config) {
    const outDir = path.join(config._cwd, "dev", config.addonName);
    if (fs.existsSync(outDir))
        fs.rmSync(outDir, { recursive: true, force: true });
    buildNextMusicToDir(config, outDir, true);
}
