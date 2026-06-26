import fs from "fs";
import path from "path";
import * as log from "../logger.js";
import {
	createZip,
	resolveArtifactName,
	addonFolderName,
	fileSize,
	parseBuildIgnore,
} from "../utils.js";
import { buildToDir } from "../build-core.js";
import type { Config } from "../types.js";

// Production build
export async function buildPulseSync(config: Config): Promise<void> {
	const cwd = config._cwd;
	const name = config.addonName;
	const version = config.version;

	log.task("pulsesync");
	log.info("building", { target: "pulsesync", addonName: name, version });

	const unpackedFolder = addonFolderName(name, version) + "_ps-unpacked";
	const outDir = path.join(cwd, "release", unpackedFolder, name);

	await buildToDir(config, {
		targetFolder: "ps",
		outDir,
		copyLicense: true,
		copyMetadata: true,
	});

	const artifacts: string[] = [];
	const ignoreRules = parseBuildIgnore(config._buildIgnore);

	const zipConfig = config.pulsesync?.zip;
	if (zipConfig) {
		const zipName = resolveArtifactName(
			zipConfig.artifactName,
			config,
			"pulsesync",
		);
		const zipPath = path.join(cwd, "release", zipName);
		createZip(zipPath, [{ disk: outDir, archive: name }], ignoreRules);
		log.artifact(zipName, fileSize(zipPath));
		artifacts.push(zipName);
	}

	const pextConfig = config.pulsesync?.pext;
	if (pextConfig) {
		const pextName = resolveArtifactName(
			pextConfig.artifactName,
			config,
			"pulsesync",
		);
		const pextPath = path.join(cwd, "release", pextName);
		createZip(
			pextPath,
			fs
				.readdirSync(outDir)
				.map((e) => ({ disk: path.join(outDir, e), archive: e })),
			ignoreRules,
		);
		log.artifact(pextName, fileSize(pextPath));
		artifacts.push(pextName);
	}

	log.done("pulsesync", artifacts.join(", ") || undefined);
}

// Dev build
export async function buildPulseSyncDev(config: Config): Promise<void> {
	const outDir = path.join(config._cwd, "dist", config.addonName);
	if (fs.existsSync(outDir))
		fs.rmSync(outDir, { recursive: true, force: true });
	await buildToDir(config, {
		targetFolder: "ps",
		outDir,
		silent: true,
		copyMetadata: true,
		isDev: true,
	});
}
