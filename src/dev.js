import fs from "fs";
import path from "path";
import * as log from "./logger.js";
import { loadConfig } from "./config.js";
import { buildDevTarget } from "./builder.js";

// Display names
const TARGET_DISPLAY = {
    nextmusic: "Next Music",
    pulsesync: "PulseSync",
};

function displayName(target) {
    return TARGET_DISPLAY[target] ?? target;
}

// Interactive arrow-key prompt
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const CLEAR_LINE = "\x1b[2K\x1b[1G";

function prompt(question, choices) {
    return new Promise((resolve) => {
        let selected = 0;
        let drawn = false;

        function render() {
            if (drawn) {
                process.stdout.write(`\x1b[${choices.length}A`);
            }
            drawn = true;

            for (let i = 0; i < choices.length; i++) {
                const label = displayName(choices[i]);
                if (i === selected) {
                    process.stdout.write(
                        `${CLEAR_LINE}  ${CYAN}> ${label}${RESET}\n`,
                    );
                } else {
                    process.stdout.write(`${CLEAR_LINE}    ${label}\n`);
                }
            }
        }

        process.stdout.write(`\n  ${question}\n\n`);
        render();

        const stdin = process.stdin;
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");

        function cleanup() {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener("data", onData);
        }

        function onData(key) {
            // Ctrl+C
            if (key === "\u0003") {
                cleanup();
                process.stdout.write("\n");
                process.exit(0);
            }
            // Enter
            if (key === "\r" || key === "\n") {
                cleanup();
                process.stdout.write("\n");
                resolve(choices[selected]);
                return;
            }
            // Up arrow
            if (key === "\x1b[A") {
                selected = (selected - 1 + choices.length) % choices.length;
                render();
                return;
            }
            // Down arrow
            if (key === "\x1b[B") {
                selected = (selected + 1) % choices.length;
                render();
                return;
            }
        }

        stdin.on("data", onData);
    });
}

// Silent build wrapper
function buildSilent(config, target) {
    process.stdout.write("  compiling...");
    const start = Date.now();
    try {
        buildDevTarget(config, target);
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        process.stdout.write(`\r  compiled in ${elapsed}s    \n`);
    } catch (e) {
        process.stdout.write("\r  failed           \n");
        log.error(`Build failed: ${e.message}`);
    }
}

// File watcher
const TARGET_DIRS = { pulsesync: "ps", nextmusic: "nm" };

let _rebuildTimer = null;
let _isBuilding = false;

function isChangeRelevant(filename, target) {
    if (!filename) return false;
    const normalised = filename.replace(/\\/g, "/");
    for (const [t, dir] of Object.entries(TARGET_DIRS)) {
        if (t === target) continue;
        // изменение лежит внутри папки другого таргета — пропускаем
        if (
            normalised === dir ||
            normalised.startsWith(dir + "/") ||
            normalised.includes("/" + dir + "/")
        )
            return false;
    }
    return true;
}

function scheduleRebuild(config, target, filename) {
    if (!isChangeRelevant(filename, target)) return;
    if (_rebuildTimer) clearTimeout(_rebuildTimer);
    _rebuildTimer = setTimeout(() => {
        if (_isBuilding) return;
        _isBuilding = true;
        buildSilent(config, target);
        _isBuilding = false;
    }, 150);
}

function watchDir(watchPath, config, target) {
    if (!fs.existsSync(watchPath)) return;
    try {
        fs.watch(watchPath, { recursive: true }, (_event, filename) => {
            scheduleRebuild(config, target, filename);
        });
    } catch {
        watchDirFallback(watchPath, config, target);
    }
}

function watchDirFallback(dir, config, target) {
    if (!fs.existsSync(dir)) return;
    if (fs.statSync(dir).isDirectory()) {
        fs.watch(dir, (_event, filename) => {
            scheduleRebuild(config, target, filename);
        });
        for (const entry of fs.readdirSync(dir))
            watchDirFallback(path.join(dir, entry), config, target);
    }
}

// Entry point
export async function runDev(cliTarget) {
    let config;
    try {
        config = loadConfig();
    } catch (e) {
        log.error(`Failed to load config: ${e.message}`);
        process.exit(1);
    }

    const allTargets = config._targets ?? [];
    const devTargets = allTargets.filter((t) => t !== "web");

    if (devTargets.length === 0) {
        log.error(
            'No dev-compatible targets found. Add "nextmusic" or "pulsesync" to build.targets.',
        );
        process.exit(1);
    }

    let target;

    if (cliTarget) {
        const key = cliTarget.toLowerCase();
        if (!devTargets.includes(key)) {
            log.error(
                `Target "${cliTarget}" is not listed in build.targets. Available dev targets: ${devTargets.join(", ")}`,
            );
            process.exit(1);
        }
        target = key;
    } else if (devTargets.length === 1) {
        target = devTargets[0];
    } else {
        target = await prompt("Select build target:", devTargets);
    }

    log.header("ymtm", config._version);
    process.stdout.write(
        `  target  ${displayName(target)}  •  ${config.addonName}\n\n`,
    );

    // Initial build
    buildSilent(config, target);

    // Watch
    const watchPath = config._srcDir;
    if (!fs.existsSync(watchPath)) {
        log.warn(`Source directory not found: ${watchPath}`);
    } else {
        watchDir(watchPath, config, target);
    }

    // Keep alive
    process.stdin.resume();
    process.on("SIGINT", () => {
        process.stdout.write("\n");
        process.exit(0);
    });
}
