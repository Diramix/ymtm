import fs from "fs";
import path from "path";
import * as log from "../logger.js";
import {
    ensureDir,
    findImageFile,
    createZip,
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

function buildPulseSyncToDir(config, outDir, silent = false) {
    const srcDir = config._srcDir;
    const metadata = config._metadata;
    const replacements = config.web?.replaceLink ?? [];
    const ignoreRules = parseBuildIgnore(config._buildIgnore);
    const noop = () => {};
    const logFile = silent ? noop : (a, n) => log.file(a, n);
    const logWarn = silent ? noop : log.warn;

    const { shared, targetSpecific, assets } = collectSourceFiles(
        srcDir,
        "ps",
        ignoreRules,
    );
    const allFiles = [...shared, ...targetSpecific];

    ensureDir(outDir);

    // icon.<ext> и banner.<ext> — ищем сначала в assets/branding/, потом в корне src/
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

    const bannerFile =
        findImageFile(brandingDir, "banner") ?? findImageFile(srcDir, "banner");
    if (bannerFile) {
        const ext = path.extname(bannerFile);
        fs.copyFileSync(bannerFile, path.join(outDir, `banner${ext}`));
        logFile("copy", `banner${ext}`);
    }

    // metadata.json
    const metaSrc = path.join(srcDir, "metadata.json");
    if (fs.existsSync(metaSrc)) {
        fs.copyFileSync(metaSrc, path.join(outDir, "metadata.json"));
        logFile("write", "metadata.json");
    } else {
        logWarn("metadata.json not found in src/");
    }

    // assets/ → outDir/assets/  (без папки branding — она только для сборщика)
    copyAssetsToOut(srcDir, outDir, ignoreRules);
    const outBrandingPs = path.join(outDir, "assets", "branding");
    if (fs.existsSync(outBrandingPs))
        fs.rmSync(outBrandingPs, { recursive: true, force: true });
    if (assets.length > 0) logFile("copy", "assets/");

    bundleToDir(
        allFiles,
        srcDir,
        "ps",
        outDir,
        metadata,
        replacements,
        logFile,
        ignoreRules,
    );
}

// ── Production build ──────────────────────────────────────────────────────────

export function buildPulseSync(config) {
    const cwd = config._cwd;
    const name = config.addonName;
    const version = config.version;

    log.task("pulsesync");
    log.info("building", { target: "pulsesync", addonName: name, version });

    const unpackedFolder = addonFolderName(name, version) + "_ps-unpacked";
    const outDir = path.join(cwd, "dist", unpackedFolder, name);

    buildPulseSyncToDir(config, outDir, false);

    const artifacts = [];
    const ignoreRules = parseBuildIgnore(config._buildIgnore);

    const zipConfig = config.pulsesync?.zip;
    if (zipConfig) {
        const zipName = resolveArtifactName(
            zipConfig.artifactName,
            config,
            "pulsesync",
        );
        const zipPath = path.join(cwd, "dist", zipName);
        createZip(zipPath, [{ disk: outDir, archive: name }], ignoreRules);
        log.artifact(zipName, fileSize(zipPath));
        artifacts.push(zipName);
    }

    const pextConfig = config.pulsesync?.pext;
    if (pextConfig) {
        const pextName = resolveArtifactName(
            pextConfig.artifactName,
            config,
            "pulsesync",
        );
        const pextPath = path.join(cwd, "dist", pextName);
        createZip(
            pextPath,
            fs
                .readdirSync(outDir)
                .map((e) => ({ disk: path.join(outDir, e), archive: e })),
            ignoreRules,
        );
        log.artifact(pextName, fileSize(pextPath));
        artifacts.push(pextName);
    }

    log.done("pulsesync", artifacts.join(", ") || undefined);
}

// ── Dev build ─────────────────────────────────────────────────────────────────

export function buildPulseSyncDev(config) {
    const outDir = path.join(config._cwd, "dev", config.addonName);
    if (fs.existsSync(outDir))
        fs.rmSync(outDir, { recursive: true, force: true });
    buildPulseSyncToDir(config, outDir, true);
}
