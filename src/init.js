import fs from "fs";
import path from "path";
import * as log from "./logger.js";

const DEFAULT_METADATA = {
    name: "addon",
    author: ["developer"],
    description: "Hello, World!",
    type: "theme",
    version: "1.0.0",
    css: "style.css",
    script: "script.js",
};

const DEFAULT_PKG = {
    name: "my-addon",
    addonName: "My Addon",
    version: "1.0.0",
    description: "Hello, World!",
    author: "developer",
    license: "MIT",
    scripts: {
        build: "ymtm build",
        "build:pulsesync": "ymtm build pulsesync",
        "build:nextmusic": "ymtm build nextmusic",
        "build:web": "ymtm build web",
    },
    build: {
        package: ["nextmusic", "pulsesync", "web"],
    },
    nextmusic: {
        zip: { artifactName: "${addon.name}_${addon.version}_nm.zip" },
    },
    pulsesync: {
        zip: { artifactName: "${addon.name}_${addon.version}_ps.zip" },
        pext: { artifactName: "${addon.name}_${addon.version}_ps.pext" },
    },
    web: {
        zip: { artifactName: "${addon.name}_${addon.version}_web.zip" },
    },
    devDependencies: {
        ymtm: "github:your-username/ymtm",
    },
};

export function init(cwd = process.cwd()) {
    const addonName = DEFAULT_METADATA.name;
    const addonDir = path.join(cwd, addonName);
    const pkgPath = path.join(cwd, "package.json");

    log.task("init");

    // package.json
    if (fs.existsSync(pkgPath)) {
        log.warn("package.json already exists, skipping");
    } else {
        fs.writeFileSync(pkgPath, JSON.stringify(DEFAULT_PKG, null, 2), "utf8");
        log.file("write", "package.json");
    }

    // addon folder
    fs.mkdirSync(addonDir, { recursive: true });
    log.file("write", `${addonName}/`);

    // metadata.json
    const metaPath = path.join(addonDir, "metadata.json");
    if (!fs.existsSync(metaPath)) {
        fs.writeFileSync(
            metaPath,
            JSON.stringify(DEFAULT_METADATA, null, 2),
            "utf8",
        );
        log.file("write", `${addonName}/metadata.json`);
    }

    // style.css
    const cssPath = path.join(addonDir, "style.css");
    if (!fs.existsSync(cssPath)) {
        fs.writeFileSync(cssPath, "{}", "utf8");
        log.file("write", `${addonName}/style.css`);
    }

    // script.js
    const jsPath = path.join(addonDir, "script.js");
    if (!fs.existsSync(jsPath)) {
        fs.writeFileSync(jsPath, "{}", "utf8");
        log.file("write", `${addonName}/script.js`);
    }

    log.done("init");
}
