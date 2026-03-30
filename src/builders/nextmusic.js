import fs from "fs";
import path from "path";
import * as log from "../logger.js";
import {
    ensureDir,
    copyRecursive,
    findFiles,
    findImageFile,
    minifyAndWrite,
    applyReplacementsToFile,
    createTarGz,
    resolveArtifactName,
    addonFolderName,
    fileSize,
} from "../utils.js";

export function buildNextMusic(config) {
    const cwd = config._cwd;
    const name = config.addonName;
    const version = config.version;
    const addonDir = config._addonDir;
    const replacements = config.web?.replaceLink ?? [];

    log.task("nextmusic");
    log.info("building", { target: "nextmusic", addonName: name, version });

    const unpackedFolder = addonFolderName(name, version) + "_nm-unpacked";
    const outDir = path.join(cwd, "dist", unpackedFolder, name);
    ensureDir(outDir);

    // 1. icon.<ext>
    const iconFile = findImageFile(addonDir, "icon");
    if (iconFile) {
        const ext = path.extname(iconFile);
        fs.copyFileSync(iconFile, path.join(outDir, `icon${ext}`));
        log.file("copy", `icon${ext}`);
    } else {
        log.warn("No icon image found in addon folder");
    }

    // 2. assets
    const assetsSource = path.join(addonDir, "assets");
    if (fs.existsSync(assetsSource)) {
        copyRecursive(assetsSource, path.join(outDir, "assets"));
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

    // 5. TAR.GZ
    const tarGzConfig = config.nextmusic?.tarGz;
    if (tarGzConfig) {
        const tarGzName = resolveArtifactName(
            tarGzConfig.artifactName,
            config,
            "nextmusic",
        );
        const tarGzPath = path.join(cwd, "dist", tarGzName);
        createTarGz(tarGzPath, [{ disk: outDir, archive: name }]);
        log.artifact(tarGzName, fileSize(tarGzPath));
        log.done("nextmusic", tarGzName);
    } else {
        log.done("nextmusic");
    }
}
