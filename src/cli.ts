import { loadConfig } from "./config.js";
import { buildAll, buildPackage } from "./builder.js";
import { runDev } from "./dev.js";
import { init } from "./init.js";
import * as log from "./logger.js";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const { version } = _require("../package.json") as { version: string };

export function run(args: string[]): void {
    const [command, ...rest] = args;

    if (command === "init") {
        try {
            init(process.cwd());
        } catch (e) {
            log.error(`Init failed: ${(e as Error).message}`);
            process.exit(1);
        }
        return;
    }

    if (command === "dev") {
        runDev(rest[0]).catch((e: Error) => {
            log.error(`Dev failed: ${e.message}`);
            if (process.env.DEBUG) console.error(e.stack);
            process.exit(1);
        });
        return;
    }

    if (command === "build") {
        log.header("ymtm", version);

        let config;
        try {
            config = loadConfig();
        } catch (e) {
            log.error(`Failed to load config: ${(e as Error).message}`);
            process.exit(1);
        }

        try {
            if (rest.length === 0) {
                buildAll(config);
            } else {
                for (const pkg of rest) buildPackage(config, pkg);
            }
        } catch (e) {
            log.error(`Build failed: ${(e as Error).message}`);
            if (process.env.DEBUG) console.error((e as Error).stack);
            process.exit(1);
        }
        return;
    }

    if (command === "version" || command === "ver") {
        console.log(`ymtm: ${version}`);
        return;
    }

    log.error(`Unknown command: "${command}"`);
    process.exit(1);
}
