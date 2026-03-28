import * as log from './logger.js';
import { buildPulseSync } from './builders/pulsesync.js';
import { buildNextMusic } from './builders/nextmusic.js';
import { buildWeb } from './builders/web.js';

const BUILDERS = {
    pulsesync: buildPulseSync,
    nextmusic:  buildNextMusic,
    web:        buildWeb,
};

export function buildAll(config) {
    const packages = config.build?.package ?? [];
    if (packages.length === 0) {
        log.warn('No packages defined in build.package');
        return;
    }
    for (const pkg of packages) buildPackage(config, pkg);
}

export function buildPackage(config, pkg) {
    const key     = pkg.toLowerCase();
    const builder = BUILDERS[key];
    if (!builder) {
        log.error(`Unknown package: "${pkg}". Available: ${Object.keys(BUILDERS).join(', ')}`);
        return;
    }
    builder(config);
}
