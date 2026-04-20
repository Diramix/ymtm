export interface Metadata {
	name?: string;
	version?: string;
	description?: string;
	author?: string | string[];
	type?: string;
	css?: string;
	script?: string;
}

export interface Replacement {
	from: string;
	to?: string;
}

export interface Config {
	name: string;
	version: string;
	addonName: string;
	description?: string;
	author?: string;
	build: {
		src?: string;
		targets?: string[];
		package?: string[];
	};
	nextmusic?: {
		tarGz?: { artifactName: string };
	};
	pulsesync?: {
		zip?: { artifactName: string };
		pext?: { artifactName: string };
	};
	web?: {
		onefile?: { artifactName: string };
		icon?: string;
		replaceLink?: Replacement[];
	};
	// Internal fields added by loadConfig
	_targets: string[];
	_cwd: string;
	_version: string;
	_srcDir: string;
	_metadata: Metadata | null;
	_buildIgnore: string;
}

export interface ArchiveEntry {
	disk: string;
	archive: string;
}

import type { Stats } from "fs";

export interface TarEntry {
	disk: string | null;
	name: string;
	stat: Stats;
	type: "0" | "5";
}

export interface ZipFileEntry {
	disk: string | null;
	name: string;
	stat: Stats;
}
