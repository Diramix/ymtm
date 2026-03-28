import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';

// ── esbuild (lazy-loaded) ─────────────────────────────────────────────────────

const _require = createRequire(import.meta.url);
let _esbuild = null;

function getEsbuild() {
    if (!_esbuild) {
        try {
            _esbuild = _require('esbuild');
        } catch {
            throw new Error(
                'esbuild is not installed. Run: npm install --save-dev esbuild',
            );
        }
    }
    return _esbuild;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

export function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        ensureDir(dest);
        for (const entry of fs.readdirSync(src))
            copyRecursive(path.join(src, entry), path.join(dest, entry));
    } else {
        ensureDir(path.dirname(dest));
        fs.copyFileSync(src, dest);
    }
}

export function findFiles(dir, exts) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
            results.push(...findFiles(full, exts));
        } else if (exts.some((e) => entry.endsWith(e))) {
            results.push(full);
        }
    }
    return results;
}

export const IMAGE_EXTS = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.avif', '.svg', '.ico', '.bmp', '.tiff',
];

export function findImageFile(dir, baseName) {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir)) {
        const ext = path.extname(entry).toLowerCase();
        const base = path.basename(entry, ext);
        if (base === baseName && IMAGE_EXTS.includes(ext))
            return path.join(dir, entry);
    }
    return null;
}

// ── Minification ──────────────────────────────────────────────────────────────

export function minifyCSS(src, content) {
    const code = content !== undefined ? content : fs.readFileSync(src, 'utf8');
    return getEsbuild().transformSync(code, { loader: 'css', minify: true }).code;
}

export function minifyJS(src, content) {
    const code = content !== undefined ? content : fs.readFileSync(src, 'utf8');
    return getEsbuild().transformSync(code, {
        loader: 'js',
        format: 'iife',
        minify: true,
    }).code;
}

export function minifyHTML(src, content) {
    let code = content !== undefined ? content : fs.readFileSync(src, 'utf8');
    code = code.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
    code = code.replace(/>\s+</g, '><');
    code = code.replace(/\s{2,}/g, ' ').trim();
    return code;
}

export function minifyAndWrite(srcFile, destFile, replacements = []) {
    const ext = path.extname(srcFile).toLowerCase();
    let content = fs.readFileSync(srcFile, 'utf8');
    content = applyReplacements(content, replacements);
    if (ext === '.css')       content = minifyCSS(srcFile, content);
    else if (ext === '.js')   content = minifyJS(srcFile, content);
    else if (ext === '.html') content = minifyHTML(srcFile, content);
    ensureDir(path.dirname(destFile));
    fs.writeFileSync(destFile, content, 'utf8');
}

// ── Replacements ──────────────────────────────────────────────────────────────

export function applyReplacements(content, replacements = []) {
    for (const { from, to } of replacements) {
        if (!from || !to) continue;
        const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escaped, 'g'), to);
    }
    return content;
}

export function applyReplacementsToFile(file, replacements = []) {
    if (!replacements.length) return;
    let content = fs.readFileSync(file, 'utf8');
    content = applyReplacements(content, replacements);
    fs.writeFileSync(file, content, 'utf8');
}

// ── ZIP (pure Node.js) ────────────────────────────────────────────────────────

function uint16LE(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function uint32LE(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

function dosDateTime(date) {
    const d = date || new Date();
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    return { date: dosDate, time: dosTime };
}

function crc32(buf) {
    const table =
        crc32.table ||
        (crc32.table = (() => {
            const t = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
                t[i] = c;
            }
            return t;
        })());
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++)
        crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function collectFiles(diskPath, archiveName, result = []) {
    const stat = fs.statSync(diskPath);
    if (stat.isDirectory()) {
        const dirName = archiveName.endsWith('/') ? archiveName : archiveName + '/';
        result.push({ disk: null, name: dirName, stat });
        for (const entry of fs.readdirSync(diskPath))
            collectFiles(path.join(diskPath, entry), archiveName + '/' + entry, result);
    } else {
        result.push({ disk: diskPath, name: archiveName, stat });
    }
    return result;
}

export function createZip(outputPath, entries) {
    ensureDir(path.dirname(outputPath));

    const files = [];
    for (const entry of entries) collectFiles(entry.disk, entry.archive, files);

    const chunks = [];
    const centralDir = [];

    for (const file of files) {
        const nameBytes = Buffer.from(file.name, 'utf8');
        const { date: dosDate, time: dosTime } = dosDateTime(file.stat.mtime);
        const offset = chunks.reduce((s, c) => s + c.length, 0);

        const isDir = file.disk === null;
        let raw, compressed, finalCrc, finalUncompressed;

        if (isDir) {
            compressed = Buffer.alloc(0);
            finalCrc = 0;
            finalUncompressed = 0;
        } else {
            raw = fs.readFileSync(file.disk);
            finalUncompressed = raw.length;
            finalCrc = crc32(raw);
            compressed = zlib.deflateRawSync(raw, { level: 9 });
        }

        const useDeflate = !isDir && compressed.length < raw.length;
        const finalMethod = isDir ? 0 : useDeflate ? 8 : 0;
        const finalData   = isDir ? Buffer.alloc(0) : useDeflate ? compressed : raw;

        const localHeader = Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x03, 0x04]),
            uint16LE(20), uint16LE(0), uint16LE(finalMethod),
            uint16LE(dosTime), uint16LE(dosDate),
            uint32LE(finalCrc),
            uint32LE(finalData.length),
            uint32LE(finalUncompressed),
            uint16LE(nameBytes.length), uint16LE(0),
            nameBytes,
        ]);

        chunks.push(localHeader);
        chunks.push(finalData);

        centralDir.push(Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x01, 0x02]),
            uint16LE(20), uint16LE(20), uint16LE(0), uint16LE(finalMethod),
            uint16LE(dosTime), uint16LE(dosDate),
            uint32LE(finalCrc),
            uint32LE(finalData.length),
            uint32LE(finalUncompressed),
            uint16LE(nameBytes.length), uint16LE(0), uint16LE(0), uint16LE(0),
            uint16LE(isDir ? 16 : 0),
            uint32LE(isDir ? 0x41ed0000 : 0x81a40000),
            uint32LE(offset),
            nameBytes,
        ]));
    }

    const centralDirBuf    = Buffer.concat(centralDir);
    const centralDirOffset = chunks.reduce((s, c) => s + c.length, 0);

    const eocd = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x05, 0x06]),
        uint16LE(0), uint16LE(0),
        uint16LE(centralDir.length), uint16LE(centralDir.length),
        uint32LE(centralDirBuf.length),
        uint32LE(centralDirOffset),
        uint16LE(0),
    ]);

    fs.writeFileSync(outputPath, Buffer.concat([...chunks, centralDirBuf, eocd]));
}

// ── Artifact name resolver ────────────────────────────────────────────────────

const PKG_SHORT = { nextmusic: 'nm', pulsesync: 'ps', web: 'web' };

export function resolveArtifactName(template, config, pkg) {
    const shortPkg  = PKG_SHORT[pkg.toLowerCase()] ?? pkg;
    const safeName  = (config.themeName || config.theme?.name || '').replace(/\s+/g, '-');
    return template
        .replace('${theme.name}',    safeName)
        .replace('${theme.version}', config.version || config.theme?.version || '')
        .replace('${build.package}', shortPkg);
}

export function themeFolderName(name, version) {
    return name.replace(/\s+/g, '-') + '_' + version;
}

export function fileSize(filePath) {
    try {
        const bytes = fs.statSync(filePath).size;
        if (bytes < 1024)         return `${bytes} B`;
        if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    } catch { return ''; }
}
