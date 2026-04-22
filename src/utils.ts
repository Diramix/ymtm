import fs from "fs";
import path from "path";
import zlib from "zlib";
import { createRequire } from "module";
import type {
	ArchiveEntry,
	TarEntry,
	ZipFileEntry,
	Replacement,
} from "./types.js";

// esbuild (lazy-loaded)
const _require = createRequire(import.meta.url);
let _esbuild: any = null;
let _sass: any = null;

function getEsbuild(): any {
	if (!_esbuild) {
		try {
			_esbuild = _require("esbuild");
		} catch {
			throw new Error(
				"esbuild is not installed. Run: npm install --save-dev esbuild",
			);
		}
	}
	return _esbuild;
}

function getSass(): any {
	if (!_sass) {
		try {
			_sass = _require("sass");
		} catch {
			throw new Error("sass is not installed. Run: npm install sass");
		}
	}
	return _sass;
}

export function parseBuildIgnore(raw = ""): string[] {
	return raw
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"));
}

export function shouldIgnore(diskPath: string, rules: string[]): boolean {
	if (!rules || rules.length === 0) return false;

	const normalised = diskPath.replace(/\\/g, "/");
	const basename = path.basename(diskPath);
	const ext = path.extname(basename).toLowerCase();

	for (const rule of rules) {
		if (
			rule.startsWith("*.") ||
			(rule.startsWith(".") && !rule.includes("/"))
		) {
			const ruleExt = rule.startsWith("*.") ? rule.slice(1) : rule;
			if (ext === ruleExt.toLowerCase()) return true;
			continue;
		}

		if (!rule.includes("/") && rule.includes("*")) {
			if (minimatch(basename, rule)) return true;
			continue;
		}

		const ruleClean = rule.replace(/\/$/, "");
		if (!ruleClean.includes("/")) {
			if (basename === ruleClean) return true;
		} else {
			if (
				normalised.endsWith("/" + ruleClean) ||
				normalised.includes("/" + ruleClean + "/")
			)
				return true;
		}
	}
	return false;
}

function minimatch(str: string, pattern: string): boolean {
	const re = new RegExp(
		"^" +
			pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
			"$",
	);
	return re.test(str);
}

export function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

export function copyRecursive(
	src: string,
	dest: string,
	ignoreRules: string[] = [],
): void {
	if (!fs.existsSync(src)) return;
	if (shouldIgnore(src, ignoreRules)) return;
	const stat = fs.statSync(src);
	if (stat.isDirectory()) {
		ensureDir(dest);
		for (const entry of fs.readdirSync(src))
			copyRecursive(path.join(src, entry), path.join(dest, entry), ignoreRules);
	} else {
		ensureDir(path.dirname(dest));
		fs.copyFileSync(src, dest);
	}
}

export function findFiles(dir: string, exts: string[]): string[] {
	const results: string[] = [];
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

export function findImageFile(dir: string, baseName: string): string | null {
	if (!fs.existsSync(dir)) return null;
	for (const entry of fs.readdirSync(dir)) {
		const ext = path.extname(entry).toLowerCase();
		const base = path.basename(entry, ext);
		if (base === baseName && IMAGE_EXTS.includes(ext))
			return path.join(dir, entry);
	}
	return null;
}

// Minification
export function compileSCSS(src: string, content?: string): string {
	const sass = getSass();
	if (content !== undefined) {
		return sass.compileString(content, { style: "compressed", url: new URL(`file://${src}`) }).css as string;
	}
	return sass.compile(src, { style: "compressed" }).css as string;
}

export function minifyCSS(src: string, content?: string): string {
	const code = content !== undefined ? content : fs.readFileSync(src, "utf8");
	return getEsbuild().transformSync(code, { loader: "css", minify: true })
		.code as string;
}

export function minifyJS(src: string, content?: string): string {
	const code = content !== undefined ? content : fs.readFileSync(src, "utf8");
	return getEsbuild().transformSync(code, {
		loader: "js",
		format: "iife",
		minify: true,
		target: "es2017",
	}).code as string;
}

export function minifyTS(src: string, content?: string): string {
	const code = content !== undefined ? content : fs.readFileSync(src, "utf8");
	return getEsbuild().transformSync(code, {
		loader: "ts",
		format: "iife",
		minify: true,
		target: "es2017",
	}).code as string;
}

export function bundleJS(
	files: string[],
	replacements: Replacement[] = [],
): string {
	if (files.length === 0) return "";

	const esbuild = getEsbuild();

	const entryContents = files
		.map((f) => `import ${JSON.stringify(f.replace(/\\/g, "/"))};`)
		.join("\n");

	let patchedContents = entryContents;
	if (replacements.length) {
		const os = _require("os") as typeof import("os");
		const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ymtm-"));
		try {
			const mappedFiles = files.map((f) => {
				let src = fs.readFileSync(f, "utf8");
				for (const { from, to } of replacements) {
					if (!from || !to) continue;
					src = src.split(from).join(to);
				}
				const mirrored = path.join(tmpRoot, f);
				fs.mkdirSync(path.dirname(mirrored), { recursive: true });
				fs.writeFileSync(mirrored, src, "utf8");
				return mirrored;
			});

			const mirroredEntry = mappedFiles
				.map((f) => `import ${JSON.stringify(f.replace(/\\/g, "/"))};`)
				.join("\n");

			const result = esbuild.buildSync({
				stdin: {
					contents: mirroredEntry,
					resolveDir: tmpRoot,
					loader: "js",
				},
				bundle: true,
				format: "iife",
				minify: true,
				target: "es2017",
				write: false,
			});

			return result.outputFiles[0].text as string;
		} finally {
			fs.rmSync(tmpRoot, { recursive: true, force: true });
		}
	}

	void patchedContents;

	const result = esbuild.buildSync({
		stdin: {
			contents: entryContents,
			resolveDir: path.dirname(files[0]),
			loader: "js",
		},
		bundle: true,
		format: "iife",
		minify: true,
		target: "es2017",
		write: false,
	});

	return result.outputFiles[0].text as string;
}

export function minifyHTML(src: string, content?: string): string {
	let code = content !== undefined ? content : fs.readFileSync(src, "utf8");
	code = code.replace(/<!--(?!\[if)[\s\S]*?-->/g, "");
	code = code.replace(/>\s+</g, "><");
	code = code.replace(/\s{2,}/g, " ").trim();
	return code;
}

export function minifyAndWrite(
	srcFile: string,
	destFile: string,
	replacements: Replacement[] = [],
): void {
	const ext = path.extname(srcFile).toLowerCase();
	let content = fs.readFileSync(srcFile, "utf8");
	content = applyReplacements(content, replacements);
	if (ext === ".css") content = minifyCSS(srcFile, content);
	else if (ext === ".scss") content = compileSCSS(srcFile, content);
	else if (ext === ".js") content = minifyJS(srcFile, content);
	else if (ext === ".html") content = minifyHTML(srcFile, content);
	ensureDir(path.dirname(destFile));
	fs.writeFileSync(destFile, content, "utf8");
}

// Replacements
export function applyReplacements(
	content: string,
	replacements: Replacement[] = [],
): string {
	for (const { from, to } of replacements) {
		if (!from || !to) continue;
		const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		content = content.replace(new RegExp(escaped, "g"), to);
	}
	return content;
}

export function applyReplacementsToFile(
	file: string,
	replacements: Replacement[] = [],
): void {
	if (!replacements.length) return;
	let content = fs.readFileSync(file, "utf8");
	content = applyReplacements(content, replacements);
	fs.writeFileSync(file, content, "utf8");
}

// TAR.GZ (pure Node.js)
function tarChecksum(block: Buffer): number {
	let sum = 0;
	for (let i = 0; i < 512; i++) {
		sum += i >= 148 && i < 156 ? 32 : block[i];
	}
	return sum;
}

function tarHeader(
	name: string,
	size: number,
	mtime: number,
	type: string,
	mode?: number,
): Buffer {
	const block = Buffer.alloc(512, 0);
	const write = (
		offset: number,
		len: number,
		value: string,
		encoding: BufferEncoding = "ascii",
	) => {
		const b = Buffer.from(value, encoding);
		b.copy(block, offset, 0, Math.min(b.length, len));
	};

	write(0, 100, name);
	write(
		100,
		8,
		(mode || (type === "5" ? 0o755 : 0o644)).toString(8).padStart(7, "0") +
			"\0",
	);
	write(108, 8, "0000000\0");
	write(116, 8, "0000000\0");
	write(124, 12, size.toString(8).padStart(11, "0") + "\0");
	write(
		136,
		12,
		Math.floor(mtime / 1000)
			.toString(8)
			.padStart(11, "0") + "\0",
	);
	write(148, 8, "        ");
	block[156] = type.charCodeAt(0);
	write(257, 6, "ustar\0");
	write(263, 2, "00");

	const sum = tarChecksum(block);
	write(148, 8, sum.toString(8).padStart(6, "0") + "\0 ");
	return block;
}

function gnuLongNameBlocks(name: string, type: string): Buffer[] {
	const nameBytes = Buffer.from(name + "\0", "utf8");
	const header = tarHeader("././@LongLink", nameBytes.length, 0, type, 0);
	header[156] = type.charCodeAt(0);
	const sum = tarChecksum(header);
	Buffer.from(sum.toString(8).padStart(6, "0") + "\0 ", "ascii").copy(
		header,
		148,
	);

	const dataBlocks = Math.ceil(nameBytes.length / 512);
	const dataBuf = Buffer.alloc(dataBlocks * 512, 0);
	nameBytes.copy(dataBuf);
	return [header, dataBuf];
}

function collectTarEntries(
	diskPath: string,
	archiveName: string,
	result: TarEntry[] = [],
	ignoreRules: string[] = [],
): TarEntry[] {
	if (shouldIgnore(diskPath, ignoreRules)) return result;
	const stat = fs.statSync(diskPath);
	if (stat.isDirectory()) {
		const dirName = archiveName.endsWith("/") ? archiveName : archiveName + "/";
		result.push({ disk: null, name: dirName, stat, type: "5" });
		for (const entry of fs.readdirSync(diskPath))
			collectTarEntries(
				path.join(diskPath, entry),
				archiveName + "/" + entry,
				result,
				ignoreRules,
			);
	} else {
		result.push({ disk: diskPath, name: archiveName, stat, type: "0" });
	}
	return result;
}

export function createTarGz(
	outputPath: string,
	entries: ArchiveEntry[],
	ignoreRules: string[] = [],
): void {
	ensureDir(path.dirname(outputPath));

	const tarEntries: TarEntry[] = [];
	for (const entry of entries)
		collectTarEntries(entry.disk, entry.archive, tarEntries, ignoreRules);

	const chunks: Buffer[] = [];

	for (const entry of tarEntries) {
		const nameBytes = Buffer.from(entry.name, "utf8");

		if (nameBytes.length > 99) {
			chunks.push(...gnuLongNameBlocks(entry.name, "L"));
		}

		if (entry.type === "5") {
			const truncName =
				entry.name.length > 99 ? entry.name.slice(-99) : entry.name;
			chunks.push(tarHeader(truncName, 0, entry.stat.mtimeMs, "5"));
		} else {
			const data = fs.readFileSync(entry.disk!);
			const truncName =
				entry.name.length > 99 ? entry.name.slice(-99) : entry.name;
			chunks.push(tarHeader(truncName, data.length, entry.stat.mtimeMs, "0"));
			const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512, 0);
			data.copy(padded);
			chunks.push(padded);
		}
	}

	chunks.push(Buffer.alloc(1024, 0));

	const tar = Buffer.concat(chunks);
	const gz = zlib.gzipSync(tar, { level: 9 });
	fs.writeFileSync(outputPath, gz);
}

// ZIP (pure Node.js)
function uint16LE(n: number): Buffer {
	const b = Buffer.alloc(2);
	b.writeUInt16LE(n, 0);
	return b;
}

function uint32LE(n: number): Buffer {
	const b = Buffer.alloc(4);
	b.writeUInt32LE(n >>> 0, 0);
	return b;
}

function dosDateTime(date: Date): { date: number; time: number } {
	const d = date || new Date();
	const dosDate =
		((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
	const dosTime =
		(d.getHours() << 11) |
		(d.getMinutes() << 5) |
		Math.floor(d.getSeconds() / 2);
	return { date: dosDate, time: dosTime };
}

let _crc32Table: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
	if (!_crc32Table) {
		const t = new Uint32Array(256);
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			t[i] = c;
		}
		_crc32Table = t;
	}
	return _crc32Table;
}

function crc32(buf: Buffer): number {
	const table = getCrc32Table();
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++)
		crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function collectZipFiles(
	diskPath: string,
	archiveName: string,
	result: ZipFileEntry[] = [],
	ignoreRules: string[] = [],
): ZipFileEntry[] {
	if (shouldIgnore(diskPath, ignoreRules)) return result;
	const stat = fs.statSync(diskPath);
	if (stat.isDirectory()) {
		const dirName = archiveName.endsWith("/") ? archiveName : archiveName + "/";
		result.push({ disk: null, name: dirName, stat });
		for (const entry of fs.readdirSync(diskPath))
			collectZipFiles(
				path.join(diskPath, entry),
				archiveName + "/" + entry,
				result,
				ignoreRules,
			);
	} else {
		result.push({ disk: diskPath, name: archiveName, stat });
	}
	return result;
}

export function createZip(
	outputPath: string,
	entries: ArchiveEntry[],
	ignoreRules: string[] = [],
): void {
	ensureDir(path.dirname(outputPath));

	const files: ZipFileEntry[] = [];
	for (const entry of entries)
		collectZipFiles(entry.disk, entry.archive, files, ignoreRules);

	const chunks: Buffer[] = [];
	const centralDir: Buffer[] = [];

	for (const file of files) {
		const nameBytes = Buffer.from(file.name, "utf8");
		const { date: dosDate, time: dosTime } = dosDateTime(file.stat.mtime);
		const offset = chunks.reduce((s, c) => s + c.length, 0);

		const isDir = file.disk === null;
		let raw: Buffer | undefined;
		let compressed: Buffer;
		let finalCrc: number;
		let finalUncompressed: number;

		if (isDir) {
			compressed = Buffer.alloc(0);
			finalCrc = 0;
			finalUncompressed = 0;
		} else {
			raw = fs.readFileSync(file.disk!);
			finalUncompressed = raw.length;
			finalCrc = crc32(raw);
			compressed = zlib.deflateRawSync(raw, { level: 9 });
		}

		const useDeflate = !isDir && compressed.length < raw!.length;
		const finalMethod = isDir ? 0 : useDeflate ? 8 : 0;
		const finalData = isDir ? Buffer.alloc(0) : useDeflate ? compressed : raw!;

		const localHeader = Buffer.concat([
			Buffer.from([0x50, 0x4b, 0x03, 0x04]),
			uint16LE(20),
			uint16LE(0),
			uint16LE(finalMethod),
			uint16LE(dosTime),
			uint16LE(dosDate),
			uint32LE(finalCrc),
			uint32LE(finalData.length),
			uint32LE(finalUncompressed),
			uint16LE(nameBytes.length),
			uint16LE(0),
			nameBytes,
		]);

		chunks.push(localHeader);
		chunks.push(finalData);

		centralDir.push(
			Buffer.concat([
				Buffer.from([0x50, 0x4b, 0x01, 0x02]),
				uint16LE(20),
				uint16LE(20),
				uint16LE(0),
				uint16LE(finalMethod),
				uint16LE(dosTime),
				uint16LE(dosDate),
				uint32LE(finalCrc),
				uint32LE(finalData.length),
				uint32LE(finalUncompressed),
				uint16LE(nameBytes.length),
				uint16LE(0),
				uint16LE(0),
				uint16LE(0),
				uint16LE(isDir ? 16 : 0),
				uint32LE(isDir ? 0x41ed0000 : 0x81a40000),
				uint32LE(offset),
				nameBytes,
			]),
		);
	}

	const centralDirBuf = Buffer.concat(centralDir);
	const centralDirOffset = chunks.reduce((s, c) => s + c.length, 0);

	const eocd = Buffer.concat([
		Buffer.from([0x50, 0x4b, 0x05, 0x06]),
		uint16LE(0),
		uint16LE(0),
		uint16LE(centralDir.length),
		uint16LE(centralDir.length),
		uint32LE(centralDirBuf.length),
		uint32LE(centralDirOffset),
		uint16LE(0),
	]);

	fs.writeFileSync(outputPath, Buffer.concat([...chunks, centralDirBuf, eocd]));
}

// Artifact name resolver
const PKG_SHORT: Record<string, string> = {
	nextmusic: "nm",
	pulsesync: "ps",
	web: "web",
};

export function resolveArtifactName(
	template: string,
	config: {
		addonName?: string;
		version?: string;
		addon?: { name?: string; version?: string };
	},
	pkg: string,
): string {
	const shortPkg = PKG_SHORT[pkg.toLowerCase()] ?? pkg;
	const safeName = (config.addonName || config.addon?.name || "").replace(
		/\s+/g,
		"-",
	);
	return template
		.replace("${addon.name}", safeName)
		.replace("${addon.version}", config.version || config.addon?.version || "")
		.replace("${build.package}", shortPkg);
}

export function addonFolderName(name: string, version: string): string {
	return name.replace(/\s+/g, "-") + "_" + version;
}

export function fileSize(filePath: string): string {
	try {
		const bytes = fs.statSync(filePath).size;
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	} catch {
		return "";
	}
}

export function removeEmptyAssetsDir(outDir: string): void {
	const assetsDir = path.join(outDir, "assets");
	if (!fs.existsSync(assetsDir)) return;

	try {
		const entries = fs.readdirSync(assetsDir);
		if (entries.length === 0) {
			fs.rmSync(assetsDir, { recursive: true, force: true });
		}
	} catch {}
}
