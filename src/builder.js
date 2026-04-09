import * as log from "./logger.js";
import { buildPulseSync } from "./builders/pulsesync.js";
import { buildNextMusic } from "./builders/nextmusic.js";
import { buildWeb } from "./builders/web.js";
import { buildPulseSyncDev } from "./builders/pulsesync.js";
import { buildNextMusicDev } from "./builders/nextmusic.js";

// ── Builder registry ──────────────────────────────────────────────────────────

const BUILDERS = {
    pulsesync: buildPulseSync,
    nextmusic: buildNextMusic,
    web: buildWeb,
};

const DEV_BUILDERS = {
    pulsesync: buildPulseSyncDev,
    nextmusic: buildNextMusicDev,
};

// ── Production build ──────────────────────────────────────────────────────────

export function buildAll(config) {
    const targets = config._targets ?? [];
    if (targets.length === 0) {
        log.warn("No targets defined in build.targets");
        return;
    }
    for (const t of targets) buildPackage(config, t);
}

export function buildPackage(config, pkg) {
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

export function buildDevTarget(config, target) {
    const key = target.toLowerCase();
    const builder = DEV_BUILDERS[key];
    if (!builder) {
        log.error(`Dev build not supported for target: "${target}"`);
        return;
    }
    builder(config);
}
