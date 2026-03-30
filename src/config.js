import fs from "fs";
import path from "path";

export function loadConfig(cwd = process.cwd()) {
    const pkgPath = path.join(cwd, "package.json");
    if (!fs.existsSync(pkgPath))
        throw new Error(`package.json not found in ${cwd}`);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (!pkg.build) throw new Error('"build" is required in package.json');

    pkg._cwd = cwd;

    // Определяем папку с темой
    let themeDir = null;
    if (pkg.addonName) {
        themeDir = path.join(cwd, pkg.addonName);
    } else {
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

    // Читаем metadata.json
    let metadata = null;
    if (themeDir) {
        const metaPath = path.join(themeDir, "metadata.json");
        if (fs.existsSync(metaPath))
            metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    }

    pkg.addonName = metadata?.name || pkg.addonName;
    pkg.version = metadata?.version || pkg.version;
    pkg._themeDir = themeDir || path.join(cwd, pkg.addonName || "theme");
    pkg._metadata = metadata;

    if (!pkg.addonName)
        throw new Error(
            '"addonName" is required (in package.json or metadata.json)',
        );

    return pkg;
}
