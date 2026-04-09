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
        dev: "ymtm dev",
        build: "ymtm build",
        "build:pulsesync": "ymtm build pulsesync",
        "build:nextmusic": "ymtm build nextmusic",
        "build:web": "ymtm build web",
    },
    build: {
        src: "src",
        targets: ["nextmusic", "pulsesync", "web"],
    },
    nextmusic: {
        tarGz: { artifactName: "${addon.name}_${addon.version}_nm.tar.gz" },
    },
    pulsesync: {
        zip: { artifactName: "${addon.name}_${addon.version}_ps.zip" },
        pext: { artifactName: "${addon.name}_${addon.version}_ps.pext" },
    },
    web: {
        onefile: { artifactName: "${addon.name}_${addon.version}_web.user.js" },
    },
    devDependencies: {
        ymtm: "github:your-username/ymtm",
    },
};

export function init(cwd = process.cwd()) {
    log.task("init");

    // package.json
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
        log.warn("package.json already exists, skipping");
    } else {
        fs.writeFileSync(pkgPath, JSON.stringify(DEFAULT_PKG, null, 2), "utf8");
        log.file("write", "package.json");
    }

    // src/
    const srcDir = path.join(cwd, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    log.file("write", "src/");

    // src/metadata.json
    const metaPath = path.join(srcDir, "metadata.json");
    if (!fs.existsSync(metaPath)) {
        fs.writeFileSync(
            metaPath,
            JSON.stringify(DEFAULT_METADATA, null, 2),
            "utf8",
        );
        log.file("write", "src/metadata.json");
    }

    // src/style.css
    const cssPath = path.join(srcDir, "style.css");
    if (!fs.existsSync(cssPath)) {
        fs.writeFileSync(cssPath, "/* shared styles */\n", "utf8");
        log.file("write", "src/style.css");
    }

    // src/script.js
    const jsPath = path.join(srcDir, "script.js");
    if (!fs.existsSync(jsPath)) {
        fs.writeFileSync(jsPath, "// shared script\n", "utf8");
        log.file("write", "src/script.js");
    }

    // src/assets/  (placeholder)
    const assetsDir = path.join(srcDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    log.file("write", "src/assets/");

    // src/assets/branding/  — иконка и баннер аддона
    const brandingDir = path.join(assetsDir, "branding");
    fs.mkdirSync(brandingDir, { recursive: true });
    log.file("write", "src/assets/branding/");

    // src/ps/  — PulseSync-specific
    const psDir = path.join(srcDir, "ps");
    fs.mkdirSync(psDir, { recursive: true });
    log.file("write", "src/ps/");

    // src/nm/  — NextMusic-specific
    const nmDir = path.join(srcDir, "nm");
    fs.mkdirSync(nmDir, { recursive: true });
    log.file("write", "src/nm/");

    // src/web/  — Web-specific
    const webDir = path.join(srcDir, "web");
    fs.mkdirSync(webDir, { recursive: true });
    log.file("write", "src/web/");

    // .buildignore
    const ignorePath = path.join(cwd, ".buildignore");
    if (!fs.existsSync(ignorePath)) {
        fs.writeFileSync(
            ignorePath,
            "# Files to exclude from builds\n.DS_Store\n*.map\n",
            "utf8",
        );
        log.file("write", ".buildignore");
    }

    log.done("init");
}
