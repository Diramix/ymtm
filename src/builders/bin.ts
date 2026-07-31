import fs from "fs";
import path from "path";
import * as log from "../logger.js";
import {
	resolveArtifactName,
	fileSize,
	parseBuildIgnore,
	bundleJS,
	compileSCSS,
	minifyCSS,
	applyReplacements,
	readBin,
	writeBin,
	IMAGE_EXTS,
} from "../utils.js";
import {
	collectSourceFiles,
	findDirsNamed,
	TARGET_FOLDERS,
} from "../src-resolver.js";
import { generateEnvReplacements } from "../env.js";
import type { Config } from "../types.js";

async function bundleBin(
	config: Config,
	opts: { outPath: string; isDev: boolean; silent: boolean },
): Promise<boolean> {
	const srcDir = config._srcDir;
	const ignoreRules = parseBuildIgnore(config._buildIgnore);
	const logFile: (action: string, name: string) => void = opts.silent
		? () => {}
		: (a, n) => log.file(a, n);

	// Target-agnostic format: abort if the source tree is split by target.
	for (const folder of TARGET_FOLDERS) {
		const found = findDirsNamed(srcDir, folder, ignoreRules);
		if (found.length > 0) {
			log.error(
				`bin build does not support targets: found "${folder}/" in src. Remove target folders (web/ps/nm) to build a .bin module.`,
			);
			return false;
		}
	}

	const replacements = [
		...(config.web?.replaceLink ?? []),
		...generateEnvReplacements(config._env, opts.isDev),
	];

	const { shared } = collectSourceFiles(srcDir, "bin", ignoreRules);

	const jsFiles: string[] = [];
	const cssChunks: string[] = [];
	const binJs: string[] = [];

	for (const srcFile of shared) {
		const ext = path.extname(srcFile).toLowerCase();
		if (IMAGE_EXTS.includes(ext)) continue;

		if (ext === ".js" || ext === ".ts") {
			jsFiles.push(srcFile);
			logFile("minify", path.relative(srcDir, srcFile));
		} else if (ext === ".css") {
			let content = fs.readFileSync(srcFile, "utf8");
			content = applyReplacements(content, replacements);
			cssChunks.push((await minifyCSS(srcFile, content)).trim());
			logFile("minify", path.relative(srcDir, srcFile));
		} else if (ext === ".scss") {
			let content = fs.readFileSync(srcFile, "utf8");
			content = applyReplacements(content, replacements);
			cssChunks.push((await compileSCSS(srcFile, content)).trim());
			logFile("minify", path.relative(srcDir, srcFile));
		} else if (ext === ".bin") {
			const mod = readBin(srcFile);
			if (mod.css) cssChunks.unshift(mod.css.trim());
			if (mod.js) binJs.push(mod.js);
			logFile("merge", path.relative(srcDir, srcFile));
		}
	}

	let jsOut =
		jsFiles.length > 0
			? await bundleJS(jsFiles, replacements, opts.isDev)
			: "";
	jsOut += binJs.join("");
	const cssOut = cssChunks.join("");

	if (!jsOut && !cssOut) {
		log.warn("nothing to bundle: no styles or scripts found");
		return false;
	}

	writeBin(opts.outPath, { css: cssOut, js: jsOut });
	return true;
}

// Production build
export async function buildBin(config: Config): Promise<void> {
	const cwd = config._cwd;
	const name = config.addonName;
	const version = config.version;

	log.task("bin");
	log.info("building", { target: "bin", addonName: name, version });

	const artifactName = resolveArtifactName(
		config.bin?.artifactName ?? "${addon.name}_${addon.version}.bin",
		config,
		"bin",
	);
	const outPath = path.join(cwd, "release", artifactName);

	const ok = await bundleBin(config, {
		outPath,
		isDev: false,
		silent: false,
	});
	if (!ok) return;

	log.artifact(artifactName, fileSize(outPath));
	log.done("bin", artifactName);
}

// Dev build
export async function buildBinDev(config: Config): Promise<void> {
	const artifactName = resolveArtifactName(
		config.bin?.artifactName ?? "${addon.name}_${addon.version}.bin",
		config,
		"bin",
	);
	const outPath = path.join(config._cwd, "dist", artifactName);

	await bundleBin(config, { outPath, isDev: true, silent: true });
}
