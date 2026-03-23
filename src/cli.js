const { loadConfig } = require('./config');
const { buildAll, buildPackage } = require('./builder');
const { init } = require('./init');
const log = require('./logger');
const { version } = require('../package.json');

function run(args) {
  const [command, ...rest] = args;

  if (command === 'init') {
    try {
      init(process.cwd());
    } catch (e) {
      log.error(`Init failed: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'build') {
    log.header('ymtm', version);

    let config;
    try {
      config = loadConfig();
    } catch (e) {
      log.error(`Failed to load config: ${e.message}`);
      process.exit(1);
    }

    try {
      if (rest.length === 0) {
        buildAll(config);
      } else {
        for (const pkg of rest) {
          buildPackage(config, pkg);
        }
      }
    } catch (e) {
      log.error(`Build failed: ${e.message}`);
      if (process.env.DEBUG) console.error(e.stack);
      process.exit(1);
    }
    return;
  }

  log.error(`Unknown command: "${command}". Available: init, build`);
  process.exit(1);
}

module.exports = { run };
