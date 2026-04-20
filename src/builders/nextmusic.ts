import fs from "fs";
import path from "path";
import * as log from "../logger.js";
import {
	createTarGz,
	resolveArtifactName,
	addonFolderName,
	fileSize,
	parseBuildIgnore,
} from "../utils.js";
import { buildToDir } from "../build-core.js";
import type { Config } from "../types.js";

// Production build
export function buildNextMusic(config: Config): void {
	const cwd = config._cwd;
	const name = config.addonName;
	const version = config.version;

	log.task("nextmusic");
	log.info("building", { target: "nextmusic", addonName: name, version });

	const unpackedFolder = addonFolderName(name, version) + "_nm-unpacked";
	const outDir = path.join(cwd, "dist", unpackedFolder, name);

	buildToDir(config, { targetFolder: "nm", outDir });

	const ignoreRules = parseBuildIgnore(config._buildIgnore);
	const tarGzConfig = config.nextmusic?.tarGz;

	if (tarGzConfig) {
		const tarGzName = resolveArtifactName(
			tarGzConfig.artifactName,
			config,
			"nextmusic",
		);
		const tarGzPath = path.join(cwd, "dist", tarGzName);
		createTarGz(tarGzPath, [{ disk: outDir, archive: name }], ignoreRules);
		log.artifact(tarGzName, fileSize(tarGzPath));
		log.done("nextmusic", tarGzName);
	} else {
		log.done("nextmusic");
	}
}

// Dev build
export function buildNextMusicDev(config: Config): void {
	const outDir = path.join(config._cwd, "dev", config.addonName);
	if (fs.existsSync(outDir))
		fs.rmSync(outDir, { recursive: true, force: true });
	buildToDir(config, { targetFolder: "nm", outDir, silent: true });
}
