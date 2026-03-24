const fs = require("fs");
const path = require("path");
const log = require("../logger");
const {
    ensureDir,
    copyRecursive,
    findFiles,
    minifyAndWrite,
    applyReplacementsToFile,
    createZip,
    resolveArtifactName,
    themeFolderName,
    IMAGE_EXTS,
    fileSize,
} = require("../utils");

function buildPulseSync(config) {
    const cwd = config._cwd;
    const name = config.themeName;
    const version = config.version;
    const themeDir = config._themeDir;
    const metadata = config._metadata;
    const replacements = config.web?.replaceLink ?? [];

    log.task("pulsesync");
    log.info("building", { target: "pulsesync", themeName: name, version });

    const unpackedFolder = themeFolderName(name, version) + "_ps-unpacked";
    const outDir = path.join(cwd, "dist", unpackedFolder, name);
    ensureDir(outDir);

    // 1. metadata.json
    const metaSrc = path.join(themeDir, "metadata.json");
    if (fs.existsSync(metaSrc)) {
        fs.copyFileSync(metaSrc, path.join(outDir, "metadata.json"));
        log.file("write", "metadata.json");
    } else {
        log.warn("metadata.json not found in theme folder");
    }

    // 2. assets
    const assetsSource = path.join(themeDir, "assets");
    if (fs.existsSync(assetsSource)) {
        copyRecursive(assetsSource, path.join(outDir, "assets"));
        log.file("copy", "assets/");
        const assetFiles = findFiles(path.join(outDir, "assets"), [
            ".css",
            ".js",
            ".json",
            ".html",
        ]);
        for (const f of assetFiles) applyReplacementsToFile(f, replacements);
    }

    // 3. .js и .css с минификацией
    for (const srcFile of findFiles(themeDir, [".js", ".css"])) {
        if (srcFile.startsWith(path.join(themeDir, "assets") + path.sep))
            continue;
        const rel = path.relative(themeDir, srcFile);
        minifyAndWrite(srcFile, path.join(outDir, rel), replacements);
        log.file("minify", rel);
    }

    // 4. README.md
    const readmeSrc = path.join(themeDir, "README.md");
    if (fs.existsSync(readmeSrc)) {
        fs.copyFileSync(readmeSrc, path.join(outDir, "README.md"));
        log.file("copy", "README.md");
    }

    // 4.1. handleEvents.json
    const handleEventsSrc = path.join(themeDir, "handleEvents.json");
    if (fs.existsSync(handleEventsSrc)) {
        fs.copyFileSync(
            handleEventsSrc,
            path.join(outDir, "handleEvents.json"),
        );
        log.file("copy", "handleEvents.json");
    }

    // 5. Картинки — берём файл из metadata.image если указан, иначе все картинки
    const imageField = metadata?.image;
    if (imageField) {
        const imgSrc = path.join(themeDir, imageField);
        if (fs.existsSync(imgSrc)) {
            fs.copyFileSync(imgSrc, path.join(outDir, imageField));
            log.file("copy", imageField);
        } else {
            log.warn(`image "${imageField}" from metadata not found`);
        }
    } else {
        for (const entry of fs.readdirSync(themeDir)) {
            const srcFile = path.join(themeDir, entry);
            if (fs.statSync(srcFile).isDirectory()) continue;
            if (IMAGE_EXTS.includes(path.extname(entry).toLowerCase())) {
                fs.copyFileSync(srcFile, path.join(outDir, entry));
                log.file("copy", entry);
            }
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
        createZip(zipPath, [{ disk: outDir, archive: name }]);
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
            fs.readdirSync(outDir).map((e) => ({
                disk: path.join(outDir, e),
                archive: e,
            })),
        );
        log.artifact(pextName, fileSize(pextPath));
        artifacts.push(pextName);
    }

    log.done("pulsesync", artifacts.join(", "));
}

module.exports = { buildPulseSync };
