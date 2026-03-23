const fs = require("fs");
const path = require("path");

function loadConfig(cwd = process.cwd()) {
    const pkgPath = path.join(cwd, "package.json");
    if (!fs.existsSync(pkgPath))
        throw new Error(`package.json not found in ${cwd}`);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (!pkg.build) throw new Error('"build" is required in package.json');

    pkg._cwd = cwd;

    // Определяем папку с темой:
    // приоритет — themeName из package.json, иначе ищем по metadata.json в подпапках
    let themeDir = null;
    if (pkg.themeName) {
        themeDir = path.join(cwd, pkg.themeName);
    } else {
        // Ищем первую подпапку где есть metadata.json
        for (const entry of fs.readdirSync(cwd)) {
            const candidate = path.join(cwd, entry);
            if (
                fs.statSync(candidate).isDirectory() &&
                fs.existsSync(path.join(candidate, "metadata.json"))
            ) {
                themeDir = candidate;
                break;
            }
        }
    }

    // Читаем metadata.json если он есть
    let metadata = null;
    if (themeDir) {
        const metaPath = path.join(themeDir, "metadata.json");
        if (fs.existsSync(metaPath)) {
            metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        }
    }

    // Итоговые name и version — metadata приоритетнее package.json
    pkg.themeName = metadata?.name || pkg.themeName;
    pkg.version = metadata?.version || pkg.version;
    pkg._themeDir = themeDir || path.join(cwd, pkg.themeName || "theme");
    pkg._metadata = metadata;

    if (!pkg.themeName)
        throw new Error(
            '"themeName" is required (in package.json or metadata.json)',
        );

    return pkg;
}

module.exports = { loadConfig };
