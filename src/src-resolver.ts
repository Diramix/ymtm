import fs from "fs";
import path from "path";
import {
	ensureDir,
	copyRecursive,
	shouldIgnore,
	IMAGE_EXTS,
	bundleJS,
	minifyCSS,
	applyReplacements,
} from "./utils.js";
import type { Metadata, Replacement } from "./types.js";

const TARGET_FOLDERS = new Set(["ps", "nm", "web"]);

// Source collection
function findDirsNamed(
	root: string,
	name: string,
	ignoreRules: string[] = [],
): string[] {
	const found: string[] = [];
	if (!fs.existsSync(root)) return found;

	function walk(dir: string): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const full = path.join(dir, entry.name);
			if (shouldIgnore(full, ignoreRules)) continue;
			if (entry.name === name) {
				found.push(full);
				continue;
			}
			walk(full);
		}
	}

	walk(root);
	return found;
}

function findAssetsDirs(root: string, ignoreRules: string[] = []): string[] {
	const found: string[] = [];
	if (!fs.existsSync(root)) return found;

	function walk(dir: string): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const full = path.join(dir, entry.name);
			if (shouldIgnore(full, ignoreRules)) continue;
			if (entry.name === "assets") {
				found.push(full);
				continue;
			}
			if (TARGET_FOLDERS.has(entry.name)) continue;
			walk(full);
		}
	}

	walk(root);
	return found;
}

export function collectSourceFiles(
	srcDir: string,
	targetFolder: string,
	ignoreRules: string[] = [],
): { shared: string[]; targetSpecific: string[]; assets: string[] } {
	const shared: string[] = [];
	const targetSpecific: string[] = [];
	const assets: string[] = [];

	if (!fs.existsSync(srcDir)) return { shared, targetSpecific, assets };

	const targetDirs = findDirsNamed(srcDir, targetFolder, ignoreRules);
	const assetsDirs = findAssetsDirs(srcDir, ignoreRules);

	const otherTargetDirs = [...TARGET_FOLDERS]
		.filter((f) => f !== targetFolder)
		.flatMap((f) => findDirsNamed(srcDir, f, ignoreRules));

	const skipPrefixes = new Set([
		...targetDirs,
		...assetsDirs,
		...otherTargetDirs,
	]);

	collectShared(srcDir, shared, ignoreRules, skipPrefixes);
	for (const dir of targetDirs) collectAll(dir, targetSpecific, ignoreRules);
	for (const dir of assetsDirs) collectAll(dir, assets, ignoreRules);

	return { shared, targetSpecific, assets };
}

function collectShared(
	dir: string,
	result: string[],
	ignoreRules: string[],
	skipPrefixes: Set<string>,
): void {
	if (!fs.existsSync(dir)) return;
	const entries = fs
		.readdirSync(dir, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name));

	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (shouldIgnore(full, ignoreRules)) continue;

		if (entry.isDirectory()) {
			if (skipPrefixes.has(full)) continue;
			collectShared(full, result, ignoreRules, skipPrefixes);
		} else {
			result.push(full);
		}
	}
}

function collectAll(
	dir: string,
	result: string[],
	ignoreRules: string[],
): void {
	if (!fs.existsSync(dir)) return;
	const entries = fs
		.readdirSync(dir, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name));
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (shouldIgnore(full, ignoreRules)) continue;
		if (entry.isDirectory()) collectAll(full, result, ignoreRules);
		else result.push(full);
	}
}

// Asset copy
export function copyAssetsToOut(
	srcDir: string,
	outDir: string,
	ignoreRules: string[] = [],
): void {
	const assetsDirs = findAssetsDirs(srcDir, ignoreRules);
	for (const assetsDir of assetsDirs) {
		copyRecursive(assetsDir, path.join(outDir, "assets"), ignoreRules);
	}
}

// Bundle name resolution
export function getBundleNames(metadata: Metadata | null): {
	js: string;
	css: string;
} {
	return {
		js: metadata?.script ?? "script.js",
		css: metadata?.css ?? "style.css",
	};
}

// Bundler
export function bundleToDir(
	allFiles: string[],
	srcDir: string,
	targetFolder: string,
	outDir: string,
	metadata: Metadata | null,
	replacements: Replacement[],
	logFile: (action: string, name: string) => void,
	ignoreRules: string[] = [],
): void {
	const { js: jsName, css: cssName } = getBundleNames(metadata);

	const jsFiles: string[] = [];
	const cssChunks: string[] = [];

	for (const srcFile of allFiles) {
		const ext = path.extname(srcFile).toLowerCase();
		const base = path.basename(srcFile, ext);

		if (path.basename(srcFile) === "metadata.json") continue;
		if (srcFile.split(/[\\/]/).includes("assets")) continue;
		if (base === "icon" && IMAGE_EXTS.includes(ext)) continue;

		if (ext === ".js" || ext === ".ts") {
			jsFiles.push(srcFile);
			logFile("minify", path.relative(srcDir, srcFile) + " → " + jsName);
		} else if (ext === ".css") {
			let content = fs.readFileSync(srcFile, "utf8");
			content = applyReplacements(content, replacements);
			cssChunks.push(minifyCSS(srcFile, content).trim());
			logFile("minify", path.relative(srcDir, srcFile) + " → " + cssName);
		} else if (IMAGE_EXTS.includes(ext)) {
			const dest = path.join(outDir, path.basename(srcFile));
			ensureDir(path.dirname(dest));
			fs.copyFileSync(srcFile, dest);
			logFile("copy", path.relative(srcDir, srcFile));
		} else {
			const rel = relativeOutputPath(srcFile, srcDir, targetFolder);
			const dest = path.join(outDir, rel);
			ensureDir(path.dirname(dest));
			fs.copyFileSync(srcFile, dest);
			logFile("copy", rel);
		}
	}

	if (jsFiles.length > 0) {
		ensureDir(outDir);
		const bundled = bundleJS(jsFiles, replacements);
		fs.writeFileSync(path.join(outDir, jsName), bundled, "utf8");
		logFile("write", jsName);
	}

	if (cssChunks.length > 0) {
		ensureDir(outDir);
		fs.writeFileSync(path.join(outDir, cssName), cssChunks.join(""), "utf8");
		logFile("write", cssName);
	}
}

// Helpers
export function relativeOutputPath(
	filePath: string,
	srcDir: string,
	targetFolder: string,
): string {
	const parts = filePath.replace(/\\/g, "/").split("/");
	const tIdx = parts.lastIndexOf(targetFolder);
	if (tIdx !== -1) {
		return parts.slice(tIdx + 1).join("/");
	}
	return path.relative(srcDir, filePath);
}
