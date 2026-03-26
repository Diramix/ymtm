const fs = require("fs");
const path = require("path");
const log = require("../logger");
const {
    ensureDir,
    copyRecursive,
    findFiles,
    findImageFile,
    minifyAndWrite,
    applyReplacementsToFile,
    createZip,
    resolveArtifactName,
    themeFolderName,
    fileSize,
} = require("../utils");

function buildNextMusic(config) {
    const cwd = config._cwd;
    const name = config.themeName;
    const version = config.version;
    const themeDir = config._themeDir;
    const replacements = config.web?.replaceLink ?? [];

    log.task("nextmusic");
    log.info("building", { target: "nextmusic", themeName: name, version });

    const unpackedFolder = themeFolderName(name, version) + "_nm-unpacked";
    const outDir = path.join(cwd, "dist", unpackedFolder, name);
    ensureDir(outDir);

    // 1. icon.<ext>
    const iconFile = findImageFile(themeDir, "icon");
    if (iconFile) {
        const ext = path.extname(iconFile);
        fs.copyFileSync(iconFile, path.join(outDir, `icon${ext}`));
        log.file("copy", `icon${ext}`);
    } else {
        log.warn("No icon image found in theme folder");
    }

    // 2. assets — copy first, then minify .css/.js/.html and apply replacements to .json
    const assetsSource = path.join(themeDir, "assets");
    if (fs.existsSync(assetsSource)) {
        copyRecursive(assetsSource, path.join(outDir, "assets"));
        log.file("copy", "assets/");

        // Minify CSS, JS, HTML inside assets (in-place on already-copied files)
        const minifiableFiles = findFiles(path.join(outDir, "assets"), [
            ".css",
            ".js",
            ".html",
        ]);
        for (const f of minifiableFiles) {
            minifyAndWrite(f, f, replacements);
            log.file("minify", path.relative(outDir, f));
        }

        // Apply replacements only to JSON (no minification)
        const jsonFiles = findFiles(path.join(outDir, "assets"), [".json"]);
        for (const f of jsonFiles) applyReplacementsToFile(f, replacements);
    }

    // 3. .js и .css с минификацией (вне assets)
    const sourceFiles = findFiles(themeDir, [".js", ".css"]);
    for (const srcFile of sourceFiles) {
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

    // 5. ZIP
    const zipConfig = config.nextmusic?.zip;
    if (zipConfig) {
        const zipName = resolveArtifactName(
            zipConfig.artifactName,
            config,
            "nextmusic",
        );
        const zipPath = path.join(cwd, "dist", zipName);
        createZip(zipPath, [{ disk: outDir, archive: name }]);
        log.artifact(zipName, fileSize(zipPath));
        log.done("nextmusic", zipName);
    } else {
        log.done("nextmusic");
    }
}

module.exports = { buildNextMusic };
