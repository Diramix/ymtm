const fs = require("fs");
const path = require("path");
const log = require("../logger");
const {
    ensureDir,
    findFiles,
    minifyAndWrite,
    createZip,
    resolveArtifactName,
    themeFolderName,
    fileSize,
    minifyJS,
    minifyCSS,
} = require("../utils");

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileToDataUrl(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".avif": "image/avif",
        ".bmp": "image/bmp",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
    };

    const mime = mimeMap[ext] || "application/octet-stream";
    const data = fs.readFileSync(filePath).toString("base64");
    return `data:${mime};base64,${data}`;
}

function findAssetFile(assetsDir, targetName) {
    if (!fs.existsSync(assetsDir)) return null;

    const stack = [assetsDir];
    while (stack.length) {
        const dir = stack.pop();
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
            } else if (entry.isFile() && entry.name === targetName) {
                return full;
            }
        }
    }
    return null;
}

function extractFileNameFromUrlOrPath(value) {
    if (!value || typeof value !== "string") return null;
    const clean = value.split("?")[0].split("#")[0];
    const normalized = clean.replace(/\\/g, "/");
    const parts = normalized.split("/");
    const last = parts[parts.length - 1];
    return last || null;
}

function buildWebReplacementMap(config) {
    const themeDir = config._themeDir;
    const assetsDir = path.join(themeDir, "assets");
    const replacements = config.web?.replaceLink ?? [];
    const map = [];

    for (const item of replacements) {
        const from = item?.from;
        const to = item?.to;

        if (!from) continue;

        if (to) {
            map.push({ from, to });
            continue;
        }

        const fileName = extractFileNameFromUrlOrPath(from);
        if (!fileName) {
            log.warn?.("web replace skipped: cannot resolve filename", {
                from,
            });
            continue;
        }

        const assetFile = findAssetFile(assetsDir, fileName);
        if (!assetFile) {
            log.warn?.("web replace skipped: asset not found", {
                from,
                fileName,
                assetsDir,
            });
            continue;
        }

        map.push({
            from,
            to: fileToDataUrl(assetFile),
        });

        log.file(
            "inline",
            `${from} → assets/${path.relative(assetsDir, assetFile)}`,
        );
    }

    return map;
}

function applyReplacements(content, replacements) {
    let result = content;
    for (const { from, to } of replacements) {
        if (from && to) result = result.split(from).join(to);
    }
    return result;
}

// ── CSS-in-JS injector ────────────────────────────────────────────────────────
function cssToJS(cssContent) {
    const escaped = cssContent
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$/g, "\\$");
    return `(function(){var s=document.createElement('style');s.textContent=\`${escaped}\`;document.head.appendChild(s)})();`;
}

// ── TamperMonkey header ───────────────────────────────────────────────────────
function buildTMHeader(metadata, config) {
    const icon = config?.web?.icon || "";
    const name = metadata?.name || config.themeName || "Theme";
    const version = metadata?.version || config.version || "1.0.0";
    const description = metadata?.description || config.description || "";
    const author = Array.isArray(metadata?.author)
        ? metadata.author.join(", ")
        : metadata?.author || config.author || "";

    return [
        "// ==UserScript==",
        `// @icon          ${icon}`,
        `// @name          ${name}`,
        `// @namespace     ymtm`,
        `// @version       ${version}`,
        `// @description   ${description}`,
        `// @author        ${author}`,
        `// @match         https://music.yandex.ru/*`,
        `// @grant         none`,
        "// ==/UserScript==",
        "",
    ].join("\n");
}

// ── Normal web build ──────────────────────────────────────────────────────────
function buildWebNormal(config) {
    const cwd = config._cwd;
    const name = config.themeName;
    const version = config.version;
    const themeDir = config._themeDir;
    const replacements = buildWebReplacementMap(config);

    const unpackedFolder = themeFolderName(name, version) + "_web-unpacked";
    const outDir = path.join(cwd, "dist", unpackedFolder, name);
    ensureDir(outDir);

    for (const srcFile of findFiles(themeDir, [".js", ".css"])) {
        const rel = path.relative(themeDir, srcFile);
        const outFile = path.join(outDir, rel);

        let content;
        if (srcFile.endsWith(".css")) {
            content = minifyCSS(srcFile);
        } else {
            content = minifyJS(srcFile);
        }

        content = applyReplacements(content, replacements);

        ensureDir(path.dirname(outFile));
        fs.writeFileSync(outFile, content, "utf8");
        log.file("minify", rel);
    }

    const zipConfig = config.web?.zip;
    if (zipConfig) {
        const zipName = resolveArtifactName(
            zipConfig.artifactName,
            config,
            "web",
        );
        const zipPath = path.join(cwd, "dist", zipName);
        createZip(zipPath, [{ disk: outDir, archive: name }]);
        log.artifact(zipName, fileSize(zipPath));
        return zipName;
    }
    return null;
}

// ── Onefile / TamperMonkey build ─────────────────────────────────────────────
function buildWebOnefile(config) {
    const cwd = config._cwd;
    const name = config.themeName;
    const version = config.version;
    const themeDir = config._themeDir;
    const metadata = config._metadata;
    const replacements = buildWebReplacementMap(config);
    const onefileCfg = config.web?.onefile;

    // 1. Собираем все CSS → CSS-in-JS
    const cssFiles = findFiles(themeDir, [".css"]);
    let cssBlock = "";
    for (const f of cssFiles) {
        let content = minifyCSS(f);
        content = applyReplacements(content, replacements);
        cssBlock += cssToJS(content) + "\n";
        log.file("minify", `${path.relative(themeDir, f)} → css-in-js`);
    }

    // 2. Собираем все JS
    const jsFiles = findFiles(themeDir, [".js"]);
    let jsBlock = "";
    for (const f of jsFiles) {
        let content = minifyJS(f);
        content = applyReplacements(content, replacements);
        jsBlock += content + "\n";
        log.file("minify", path.relative(themeDir, f));
    }

    // 3. Собираем итоговый файл
    const header = buildTMHeader(metadata, config);
    const body = `${cssBlock}${jsBlock}`.trim();
    const output = header + body + "\n";

    // 4. Пишем файл
    ensureDir(path.join(cwd, "dist"));
    const artifactName = resolveArtifactName(
        onefileCfg.artifactName,
        config,
        "web",
    );
    const outPath = path.join(cwd, "dist", artifactName);
    fs.writeFileSync(outPath, output, "utf8");
    log.artifact(artifactName, fileSize(outPath));
    return artifactName;
}

// ── Entry ─────────────────────────────────────────────────────────────────────
function buildWeb(config) {
    const name = config.themeName;
    const version = config.version;

    log.task("web");
    log.info("building", { target: "web", themeName: name, version });

    const artifacts = [];

    if (config.web?.zip) {
        const r = buildWebNormal(config);
        if (r) artifacts.push(r);
    }

    if (config.web?.onefile) {
        const r = buildWebOnefile(config);
        if (r) artifacts.push(r);
    }

    if (!config.web?.zip && !config.web?.onefile) {
        buildWebNormal(config);
    }

    log.done("web", artifacts.join(", ") || undefined);
}

module.exports = { buildWeb };
