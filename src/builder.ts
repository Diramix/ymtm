import * as log from "./logger.js";
import { buildPulseSync, buildPulseSyncDev } from "./builders/pulsesync.js";
import { buildNextMusic, buildNextMusicDev } from "./builders/nextmusic.js";
import { buildWeb } from "./builders/web.js";
import { buildBin } from "./builders/bin.js";
import type { Config } from "./types.js";

// Builder registry
const BUILDERS: Record<string, (config: Config) => Promise<void>> = {
	pulsesync: buildPulseSync,
	nextmusic: buildNextMusic,
	web: buildWeb,
	bin: buildBin,
};

const DEV_BUILDERS: Record<string, (config: Config) => Promise<void>> = {
	pulsesync: buildPulseSyncDev,
	nextmusic: buildNextMusicDev,
};

// Production build
export async function buildAll(config: Config): Promise<void> {
	const targets = config._targets ?? [];
	if (targets.length === 0) {
		log.warn("No targets defined in build.targets");
		return;
	}
	for (const t of targets) await buildPackage(config, t);
}

export async function buildPackage(config: Config, pkg: string): Promise<void> {
	const key = pkg.toLowerCase();
	const builder = BUILDERS[key];
	if (!builder) {
		log.error(
			`Unknown target: "${pkg}". Available: ${Object.keys(BUILDERS).join(", ")}`,
		);
		return;
	}
	await builder(config);
}

// Dev build
export async function buildDevTarget(
	config: Config,
	target: string,
): Promise<void> {
	const key = target.toLowerCase();
	const builder = DEV_BUILDERS[key];
	if (!builder) {
		log.error(`Dev build not supported for target: "${target}"`);
		return;
	}
	await builder(config);
}
