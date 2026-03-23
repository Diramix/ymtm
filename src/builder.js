const log = require('./logger');
const { buildPulseSync } = require('./builders/pulsesync');
const { buildNextMusic } = require('./builders/nextmusic');
const { buildWeb } = require('./builders/web');

const BUILDERS = {
  pulsesync: buildPulseSync,
  nextmusic:  buildNextMusic,
  web:        buildWeb,
};

function buildAll(config) {
  const packages = config.build?.package ?? [];
  if (packages.length === 0) {
    log.warn('No packages defined in build.package');
    return;
  }
  for (const pkg of packages) buildPackage(config, pkg);
}

function buildPackage(config, pkg) {
  const key = pkg.toLowerCase();
  const builder = BUILDERS[key];
  if (!builder) {
    log.error(`Unknown package: "${pkg}". Available: ${Object.keys(BUILDERS).join(', ')}`);
    return;
  }
  builder(config);
}

module.exports = { buildAll, buildPackage };
