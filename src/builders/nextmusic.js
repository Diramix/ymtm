const fs = require('fs');
const path = require('path');
const log = require('../logger');
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
} = require('../utils');

function buildNextMusic(config) {
  const cwd      = config._cwd;
  const name     = config.themeName;
  const version  = config.version;
  const themeDir = config._themeDir;
  const replacements = config.web?.replaceLink ?? [];

  log.task('nextmusic');
  log.info('building', { target: 'nextmusic', themeName: name, version });

  const unpackedFolder = themeFolderName(name, version) + '_nm-unpacked';
  const outDir    = path.join(cwd, 'dist', unpackedFolder, name);
  ensureDir(outDir);

  // 1. logo.<ext>
  const logoFile = findImageFile(themeDir, 'logo');
  if (logoFile) {
    const ext = path.extname(logoFile);
    fs.copyFileSync(logoFile, path.join(outDir, `logo${ext}`));
    log.file('copy', `logo${ext}`);
  } else {
    log.warn('No logo image found in theme folder');
  }

  // 2. assets
  const assetsSource = path.join(themeDir, 'assets');
  if (fs.existsSync(assetsSource)) {
    copyRecursive(assetsSource, path.join(outDir, 'assets'));
    log.file('copy', 'assets/');
    const assetFiles = findFiles(path.join(outDir, 'assets'), ['.css', '.js', '.json', '.html']);
    for (const f of assetFiles) applyReplacementsToFile(f, replacements);
  }

  // 3. .js и .css с минификацией
  const sourceFiles = findFiles(themeDir, ['.js', '.css']);
  for (const srcFile of sourceFiles) {
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

  // 5. ZIP
  const unpackedDir = path.join(cwd, 'dist', unpackedFolder);
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

module.exports = { buildNextMusic };
