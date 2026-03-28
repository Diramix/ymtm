import fs from 'fs';
import path from 'path';
import * as log from '../logger.js';
import {
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
} from '../utils.js';

export function buildNextMusic(config) {
    const cwd          = config._cwd;
    const name         = config.themeName;
    const version      = config.version;
    const themeDir     = config._themeDir;
    const replacements = config.web?.replaceLink ?? [];

    log.task('nextmusic');
    log.info('building', { target: 'nextmusic', themeName: name, version });

    const unpackedFolder = themeFolderName(name, version) + '_nm-unpacked';
    const outDir = path.join(cwd, 'dist', unpackedFolder, name);
    ensureDir(outDir);

    // 1. icon.<ext>
    const iconFile = findImageFile(themeDir, 'icon');
    if (iconFile) {
        const ext = path.extname(iconFile);
        fs.copyFileSync(iconFile, path.join(outDir, `icon${ext}`));
        log.file('copy', `icon${ext}`);
    } else {
        log.warn('No icon image found in theme folder');
    }

    // 2. assets
    const assetsSource = path.join(themeDir, 'assets');
    if (fs.existsSync(assetsSource)) {
        copyRecursive(assetsSource, path.join(outDir, 'assets'));
        log.file('copy', 'assets/');

        for (const f of findFiles(path.join(outDir, 'assets'), ['.css', '.js', '.html'])) {
            minifyAndWrite(f, f, replacements);
            log.file('minify', path.relative(outDir, f));
        }
        for (const f of findFiles(path.join(outDir, 'assets'), ['.json']))
            applyReplacementsToFile(f, replacements);
    }

    // 3. .js / .css вне assets
    for (const srcFile of findFiles(themeDir, ['.js', '.css'])) {
        if (srcFile.startsWith(path.join(themeDir, 'assets') + path.sep)) continue;
        const rel = path.relative(themeDir, srcFile);
        minifyAndWrite(srcFile, path.join(outDir, rel), replacements);
        log.file('minify', rel);
    }

    // 4. README.md
    const readmeSrc = path.join(themeDir, 'README.md');
    if (fs.existsSync(readmeSrc)) {
        fs.copyFileSync(readmeSrc, path.join(outDir, 'README.md'));
        log.file('copy', 'README.md');
    }

    // 4.1. handleEvents.json
    const handleEventsSrc = path.join(themeDir, 'handleEvents.json');
    if (fs.existsSync(handleEventsSrc)) {
        fs.copyFileSync(handleEventsSrc, path.join(outDir, 'handleEvents.json'));
        log.file('copy', 'handleEvents.json');
    }

    // 5. ZIP
    const zipConfig = config.nextmusic?.zip;
    if (zipConfig) {
        const zipName = resolveArtifactName(zipConfig.artifactName, config, 'nextmusic');
        const zipPath = path.join(cwd, 'dist', zipName);
        createZip(zipPath, [{ disk: outDir, archive: name }]);
        log.artifact(zipName, fileSize(zipPath));
        log.done('nextmusic', zipName);
    } else {
        log.done('nextmusic');
    }
}
