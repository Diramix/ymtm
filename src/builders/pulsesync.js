import fs from "fs";
import path from "path";
import * as log from "../logger.js";
import {
    ensureDir,
    copyRecursive,
    findFiles,
    minifyAndWrite,
    applyReplacementsToFile,
    createZip,
    resolveArtifactName,
    addonFolderName,
    IMAGE_EXTS,
    fileSize,
    parseBuildIgnore,
} from "../utils.js";

export function buildPulseSync(config) {
    const cwd = config._cwd;
    const name = config.addonName;
    const version = config.version;
    const addonDir = config._addonDir;
    const replacements = config.web?.replaceLink ?? [];
    const ignoreRules = parseBuildIgnore(config._buildIgnore);

    log.task("pulsesync");
    log.info("building", { target: "pulsesync", addonName: name, version });

    const unpackedFolder = addonFolderName(name, version) + "_ps-unpacked";
    const outDir = path.join(cwd, "dist", unpackedFolder, name);
    ensureDir(outDir);

    // 1. metadata.json
    const metaSrc = path.join(addonDir, "metadata.json");
    if (fs.existsSync(metaSrc)) {
        fs.copyFileSync(metaSrc, path.join(outDir, "metadata.json"));
        log.file("write", "metadata.json");
    } else {
        log.warn("metadata.json not found in addon folder");
    }

    // 2. assets
    const assetsSource = path.join(addonDir, "assets");
    if (fs.existsSync(assetsSource)) {
        copyRecursive(assetsSource, path.join(outDir, "assets"), ignoreRules);
        log.file("copy", "assets/");

        for (const f of findFiles(path.join(outDir, "assets"), [
            ".css",
            ".js",
            ".html",
        ])) {
            minifyAndWrite(f, f, replacements);
            log.file("minify", path.relative(outDir, f));
        }
        for (const f of findFiles(path.join(outDir, "assets"), [".json"]))
            applyReplacementsToFile(f, replacements);
    }

    // 3. .js / .css вне assets
    for (const srcFile of findFiles(addonDir, [".js", ".css"])) {
        if (srcFile.startsWith(path.join(addonDir, "assets") + path.sep))
            continue;
        const rel = path.relative(addonDir, srcFile);
        minifyAndWrite(srcFile, path.join(outDir, rel), replacements);
        log.file("minify", rel);
    }

    // 4. README.md
    const readmeSrc = path.join(addonDir, "README.md");
    if (fs.existsSync(readmeSrc)) {
        fs.copyFileSync(readmeSrc, path.join(outDir, "README.md"));
        log.file("copy", "README.md");
    }

    // 4.1. handleEvents.json
    const handleEventsSrc = path.join(addonDir, "handleEvents.json");
    if (fs.existsSync(handleEventsSrc)) {
        fs.copyFileSync(
            handleEventsSrc,
            path.join(outDir, "handleEvents.json"),
        );
        log.file("copy", "handleEvents.json");
    }

    // 5. Картинки
    for (const entry of fs.readdirSync(addonDir)) {
        const srcFile = path.join(addonDir, entry);
        if (fs.statSync(srcFile).isDirectory()) continue;
        if (IMAGE_EXTS.includes(path.extname(entry).toLowerCase())) {
            fs.copyFileSync(srcFile, path.join(outDir, entry));
            log.file("copy", entry);
        }
    }

    const artifacts = [];

    // 6. ZIP
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

    // 7. PEXT
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

    log.done("pulsesync", artifacts.join(", "));
}
