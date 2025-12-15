import { fromFileUrl, resolve } from "@std/path";
import { exists } from "@std/fs";

export interface PackageInfo {
	name: string;
	version: string;
}

export interface BuildOptions {
	root: string;
	entry: string;
	outDir: string;
	outFile: string;
	watchDirs: string[];
	strict: boolean;
	useEsbuild: boolean;
	minify: boolean;
}

export const DEFAULT_ROOT = "src";
export const DEFAULT_ENTRY_POINT = "mod.ts";
export const DEFAULT_OUT_FILENAME = "bundle.js";

export const timestamp = () =>
	new Date().toLocaleTimeString("en-GB", { hour12: false });

export async function getPackageInfo(): Promise<PackageInfo | null> {
	try {
		const baseUrl = import.meta.url;

		// JSR URL format: https://jsr.io/@scope/name/version/file.ts
		const jsrMatch = baseUrl.match(
			/^https:\/\/jsr\.io\/(@[^/]+\/[^/]+)\/([^/]+)\//
		);
		if (jsrMatch) {
			return { name: jsrMatch[1], version: jsrMatch[2] };
		}

		// Local: read from deno.json (go up one level from src/)
		if (baseUrl.startsWith("file://")) {
			const denoJsonUrl = new URL("../deno.json", baseUrl).href;
			const content = await Deno.readTextFile(fromFileUrl(denoJsonUrl));
			const json = JSON.parse(content);
			return { name: json.name, version: json.version };
		}

		return null;
	} catch {
		return null;
	}
}

export async function findImportMap(): Promise<string | undefined> {
	const candidates = ["deno.json", "deno.jsonc", "import_map.json"];
	for (const candidate of candidates) {
		const path = resolve(Deno.cwd(), candidate);
		if (await exists(path)) {
			return path;
		}
	}
	return undefined;
}

export async function typeCheck(entryPath: string): Promise<boolean> {
	const command = new Deno.Command("deno", {
		args: ["check", entryPath],
		stdout: "inherit",
		stderr: "inherit",
	});
	const { success } = await command.output();
	return success;
}
