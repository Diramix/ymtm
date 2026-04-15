import * as log from "./logger.js";
import { buildPulseSync, buildPulseSyncDev } from "./builders/pulsesync.js";
import { buildNextMusic, buildNextMusicDev } from "./builders/nextmusic.js";
import { buildWeb } from "./builders/web.js";
import type { Config } from "./types.js";

// ── Builder registry ──────────────────────────────────────────────────────────

const BUILDERS: Record<string, (config: Config) => void> = {
    pulsesync: buildPulseSync,
    nextmusic: buildNextMusic,
    web: buildWeb,
};

const DEV_BUILDERS: Record<string, (config: Config) => void> = {
    pulsesync: buildPulseSyncDev,
    nextmusic: buildNextMusicDev,
};

// ── Production build ──────────────────────────────────────────────────────────

export function buildAll(config: Config): void {
    const targets = config._targets ?? [];
    if (targets.length === 0) {
        log.warn("No targets defined in build.targets");
        return;
    }
    for (const t of targets) buildPackage(config, t);
}

export function buildPackage(config: Config, pkg: string): void {
    const key = pkg.toLowerCase();
    const builder = BUILDERS[key];
    if (!builder) {
        log.error(
            `Unknown target: "${pkg}". Available: ${Object.keys(BUILDERS).join(", ")}`,
        );
        return;
    }
    builder(config);
}

// ── Dev build ─────────────────────────────────────────────────────────────────

export function buildDevTarget(config: Config, target: string): void {
    const key = target.toLowerCase();
    const builder = DEV_BUILDERS[key];
    if (!builder) {
        log.error(`Dev build not supported for target: "${target}"`);
        return;
    }
    builder(config);
}
