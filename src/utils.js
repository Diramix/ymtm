const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        ensureDir(dest);
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        ensureDir(path.dirname(dest));
        fs.copyFileSync(src, dest);
    }
}

/**
 * Find files matching extensions recursively.
 */
function findFiles(dir, exts) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            results.push(...findFiles(full, exts));
        } else if (exts.some((e) => entry.endsWith(e))) {
            results.push(full);
        }
    }
    return results;
}

const IMAGE_EXTS = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".avif",
    ".svg",
    ".ico",
    ".bmp",
    ".tiff",
];

function findImageFile(dir, baseName) {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir)) {
        const ext = path.extname(entry).toLowerCase();
        const base = path.basename(entry, ext);
        if (base === baseName && IMAGE_EXTS.includes(ext)) {
            return path.join(dir, entry);
        }
    }
    return null;
}

// ── Minification ─────────────────────────────────────────────────────────────

function minifyCSS(src) {
    let content = fs.readFileSync(src, "utf8");
    // Remove /* ... */ comments (including multi-line)
    content = content.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove // line comments (outside strings – best-effort)
    content = content.replace(/(?<!https?:)(?<!["'])\/\/[^\n]*/g, "");
    // Collapse whitespace / newlines to single space
    content = content.replace(/\s+/g, " ").trim();
    return content;
}

function minifyJS(src) {
    let content = fs.readFileSync(src, "utf8");
    // Remove block comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove single-line comments (careful with URLs)
    content = content.replace(/(?<!['":/])\/\/[^\n]*/g, "");
    // Collapse whitespace / newlines to single space
    content = content.replace(/\s+/g, " ").trim();
    return content;
}

function minifyAndWrite(srcFile, destFile, replacements = []) {
    const ext = path.extname(srcFile).toLowerCase();
    let content;
    if (ext === ".css") {
        content = minifyCSS(srcFile);
    } else if (ext === ".js") {
        content = minifyJS(srcFile);
    } else {
        content = fs.readFileSync(srcFile, "utf8");
    }

    content = applyReplacements(content, replacements);

    ensureDir(path.dirname(destFile));
    fs.writeFileSync(destFile, content, "utf8");
}

// ── Link replacement ──────────────────────────────────────────────────────────

/**
 * replacements: [ { from: "url", to: "url" }, ... ]
 */
function applyReplacements(content, replacements = []) {
    for (const { from, to } of replacements) {
        if (!from || !to) continue;
        // Escape special regex chars in `from`
        const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        content = content.replace(new RegExp(escaped, "g"), to);
    }
    return content;
}

function applyReplacementsToFile(file, replacements = []) {
    if (!replacements.length) return;
    let content = fs.readFileSync(file, "utf8");
    content = applyReplacements(content, replacements);
    fs.writeFileSync(file, content, "utf8");
}

// ── ZIP creation (pure Node.js, no dependencies) ─────────────────────────────

function uint16LE(n) {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n, 0);
    return b;
}
function uint32LE(n) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n >>> 0, 0);
    return b;
}

function dosDateTime(date) {
    const d = date || new Date();
    const dosDate =
        ((d.getFullYear() - 1980) << 9) |
        ((d.getMonth() + 1) << 5) |
        d.getDate();
    const dosTime =
        (d.getHours() << 11) |
        (d.getMinutes() << 5) |
        Math.floor(d.getSeconds() / 2);
    return { date: dosDate, time: dosTime };
}

function crc32(buf) {
    const table =
        crc32.table ||
        (crc32.table = (() => {
            const t = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let j = 0; j < 8; j++)
                    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
                t[i] = c;
            }
            return t;
        })());
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++)
        crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Collect all files from a disk path into flat list with archive names.
 */
function collectFiles(diskPath, archiveName, result = []) {
    const stat = fs.statSync(diskPath);
    if (stat.isDirectory()) {
        // Add directory entry
        const dirName = archiveName.endsWith("/")
            ? archiveName
            : archiveName + "/";
        result.push({ disk: null, name: dirName, stat });
        for (const entry of fs.readdirSync(diskPath)) {
            collectFiles(
                path.join(diskPath, entry),
                archiveName + "/" + entry,
                result,
            );
        }
    } else {
        result.push({ disk: diskPath, name: archiveName, stat });
    }
    return result;
}

/**
 * Create a zip archive using only built-in Node.js modules.
 * @param {string} outputPath
 * @param {Array<{disk: string, archive: string}>} entries
 */
function createZip(outputPath, entries) {
    ensureDir(path.dirname(outputPath));

    // Collect all files
    const files = [];
    for (const entry of entries) {
        collectFiles(entry.disk, entry.archive, files);
    }

    const chunks = [];
    const centralDir = [];

    for (const file of files) {
        const nameBytes = Buffer.from(file.name, "utf8");
        const { date: dosDate, time: dosTime } = dosDateTime(file.stat.mtime);
        const offset = chunks.reduce((s, c) => s + c.length, 0);

        let compressed, crc, uncompressedSize;

        if (file.disk === null) {
            // Directory entry
            compressed = Buffer.alloc(0);
            crc = 0;
            uncompressedSize = 0;
        } else {
            const raw = fs.readFileSync(file.disk);
            uncompressedSize = raw.length;
            crc = crc32(raw);
            compressed = zlib.deflateRawSync(raw, { level: 9 });
            // Use stored if deflate makes it bigger
            if (compressed.length >= raw.length) {
                compressed = raw;
            }
        }

        const method =
            file.disk === null ||
            compressed.length === (file.disk ? fs.statSync(file.disk).size : 0)
                ? 0 // stored
                : 8; // deflated

        // Determine actual method
        const isDir = file.disk === null;
        const rawSize = isDir ? 0 : fs.readFileSync(file.disk).length; // already read above, reuse compressed
        const useDeflate = !isDir && compressed.length < rawSize;
        const finalMethod = isDir ? 0 : useDeflate ? 8 : 0;
        const finalData = isDir
            ? Buffer.alloc(0)
            : useDeflate
              ? compressed
              : fs.readFileSync(file.disk);
        const finalCrc = isDir ? 0 : crc32(fs.readFileSync(file.disk));
        const finalUncompressed = isDir ? 0 : fs.statSync(file.disk).size;

        // Local file header
        const localHeader = Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
            uint16LE(20), // version needed
            uint16LE(0), // flags
            uint16LE(finalMethod), // compression
            uint16LE(dosTime),
            uint16LE(dosDate),
            uint32LE(finalCrc),
            uint32LE(finalData.length), // compressed size
            uint32LE(finalUncompressed), // uncompressed size
            uint16LE(nameBytes.length),
            uint16LE(0), // extra length
            nameBytes,
        ]);

        chunks.push(localHeader);
        chunks.push(finalData);

        // Central directory entry
        centralDir.push(
            Buffer.concat([
                Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
                uint16LE(20), // version made by
                uint16LE(20), // version needed
                uint16LE(0), // flags
                uint16LE(finalMethod),
                uint16LE(dosTime),
                uint16LE(dosDate),
                uint32LE(finalCrc),
                uint32LE(finalData.length),
                uint32LE(finalUncompressed),
                uint16LE(nameBytes.length),
                uint16LE(0), // extra length
                uint16LE(0), // comment length
                uint16LE(0), // disk start
                uint16LE(isDir ? 16 : 0), // internal attrs
                uint32LE(isDir ? 0x41ed0000 : 0x81a40000), // external attrs (permissions)
                uint32LE(offset), // local header offset
                nameBytes,
            ]),
        );
    }

    const centralDirBuf = Buffer.concat(centralDir);
    const centralDirOffset = chunks.reduce((s, c) => s + c.length, 0);

    // End of central directory record
    const eocd = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x05, 0x06]),
        uint16LE(0), // disk number
        uint16LE(0), // disk with central dir
        uint16LE(centralDir.length), // entries on disk
        uint16LE(centralDir.length), // total entries
        uint32LE(centralDirBuf.length),
        uint32LE(centralDirOffset),
        uint16LE(0), // comment length
    ]);

    fs.writeFileSync(
        outputPath,
        Buffer.concat([...chunks, centralDirBuf, eocd]),
    );
}

// ── Artifact name resolver ────────────────────────────────────────────────────

const PKG_SHORT = {
    nextmusic: "nm",
    pulsesync: "ps",
    web: "web",
};

function resolveArtifactName(template, config, pkg) {
    const shortPkg = PKG_SHORT[pkg.toLowerCase()] ?? pkg;
    const safeName = (config.themeName || config.theme?.name || "").replace(
        /\s+/g,
        "-",
    );
    return template
        .replace("${theme.name}", safeName)
        .replace(
            "${theme.version}",
            config.version || config.theme?.version || "",
        )
        .replace("${build.package}", shortPkg);
}

// ── Theme folder name ─────────────────────────────────────────────────────────

/** "Murder Drones 1.0.6" → "Murder-Drones_1.0.6" */
function themeFolderName(name, version) {
    return name.replace(/\s+/g, "-") + "_" + version;
}

module.exports = {
    fileSize,
    ensureDir,
    copyRecursive,
    findFiles,
    findImageFile,
    minifyJS,
    minifyCSS,
    minifyAndWrite,
    applyReplacements,
    applyReplacementsToFile,
    createZip,
    resolveArtifactName,
    themeFolderName,
    IMAGE_EXTS,
};

// ── File size helper ──────────────────────────────────────────────────────────
function fileSize(filePath) {
    try {
        const bytes = fs.statSync(filePath).size;
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    } catch {
        return "";
    }
}
