import fs from "fs";
import path from "path";
import * as log from "../logger.js";
import {
	ensureDir,
	resolveArtifactName,
	fileSize,
	bundleJS,
	minifyCSS,
	compileSCSS,
} from "../utils.js";
import { collectSourceFiles } from "../src-resolver.js";
import { generateEnvReplacements } from "../env.js";
import type { Config, Replacement } from "../types.js";

// Helpers

function fileToDataUrl(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	const mimeMap: Record<string, string> = {
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

function findAssetFile(assetsDir: string, targetName: string): string | null {
	if (!fs.existsSync(assetsDir)) return null;
	const stack: string[] = [assetsDir];
	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) stack.push(full);
			else if (entry.name === targetName) return full;
		}
	}
	return null;
}

function extractFileNameFromUrlOrPath(value: unknown): string | null {
	if (!value || typeof value !== "string") return null;
	const clean = value.split("?")[0].split("#")[0];
	const normalized = clean.replace(/\\/g, "/");
	const parts = normalized.split("/");
	return parts[parts.length - 1] || null;
}

function buildWebReplacementMap(config: Config): Replacement[] {
	const srcDir = config._srcDir;
	const assetsDir = path.join(srcDir, "assets");
	const replacements = config.web?.replaceLink ?? [];
	const map: Replacement[] = [];

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
			log.warn(`web replace skipped: cannot resolve filename from ${from}`);
			continue;
		}

		const assetFile = findAssetFile(assetsDir, fileName);
		if (!assetFile) {
			log.warn(`web replace skipped: asset not found — ${fileName}`);
			continue;
		}

		map.push({ from, to: fileToDataUrl(assetFile) });
		log.file(
			"inline",
			`${from} → assets/${path.relative(assetsDir, assetFile)}`,
		);
	}

	return map;
}

function applyReplacements(
	content: string,
	replacements: Replacement[],
): string {
	let result = content;
	for (const { from, to } of replacements)
		if (from && to) result = result.split(from).join(to);
	return result;
}

function cssToJS(cssContent: string): string {
	const escaped = cssContent
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "\\`")
		.replace(/\$/g, "\\$");
	return `(function(){var s=document.createElement('style');s.textContent=\`${escaped}\`;document.head.appendChild(s)})();`;
}

function buildTMHeader(metadata: Config["_metadata"], config: Config): string {
	const icon = config?.web?.icon || "";
	const name = metadata?.name || config.addonName || "Addon";
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

// Build

function buildWebOnefile(config: Config): string {
	const cwd = config._cwd;
	const srcDir = config._srcDir;
	const metadata = config._metadata;
	const webReplacements = buildWebReplacementMap(config);
	const onefileCfg = config.web?.onefile;

	// Generate env-based replacements for production (only YMTM_PUBLIC_)
	const envReplacements = generateEnvReplacements(config._env, false);

	// Combine web replacements with env replacements
	const replacements = [...webReplacements, ...envReplacements];

	const { shared, targetSpecific } = collectSourceFiles(srcDir, "web");
	const allFiles = [...shared, ...targetSpecific];

	let cssBlock = "";

	const jsFiles: string[] = [];
	const cssFiles: string[] = [];

	for (const f of allFiles) {
		const ext = path.extname(f).toLowerCase();
		if (ext === ".js" || ext === ".ts") {
			jsFiles.push(f);
			log.file("minify", path.relative(srcDir, f));
		} else if (ext === ".css" || ext === ".scss") {
			cssFiles.push(f);
		}
	}

	for (const f of cssFiles) {
		const ext = path.extname(f).toLowerCase();
		let content = fs.readFileSync(f, "utf8");
		content = applyReplacements(content, replacements);
		content = ext === ".scss" ? compileSCSS(f, content) : minifyCSS(f, content);
		cssBlock += cssToJS(content).trim();
		log.file("minify", `${path.relative(srcDir, f)} → css-in-js`);
	}

	const jsBlock =
		jsFiles.length > 0 ? bundleJS(jsFiles, replacements).trim() : "";

	const header = buildTMHeader(metadata, config);
	const body = `${cssBlock}${jsBlock}`.trim();
	const output = header + body + "\n";

	ensureDir(path.join(cwd, "release"));
	const artifactName = resolveArtifactName(
		onefileCfg!.artifactName,
		config,
		"web",
	);
	const outPath = path.join(cwd, "release", artifactName);
	fs.writeFileSync(outPath, output, "utf8");
	log.artifact(artifactName, fileSize(outPath));
	return artifactName;
}

export function buildWeb(config: Config): void {
	log.task("web");
	log.info("building", {
		target: "web",
		addonName: config.addonName,
		version: config.version,
	});

	const artifactName = buildWebOnefile(config);
	log.done("web", artifactName || undefined);
}
