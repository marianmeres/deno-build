import { fromFileUrl, resolve } from "@std/path";
import { exists } from "@std/fs";

/**
 * Package metadata containing name and version.
 */
export interface PackageInfo {
	/** Package name (e.g., "@scope/package-name") */
	name: string;
	/** Package version (e.g., "1.0.0") */
	version: string;
}

/**
 * Configuration options for the build process.
 */
export interface BuildOptions {
	/** Source root directory relative to cwd (e.g., "src") */
	root: string;
	/** Entry point file name within root (e.g., "mod.ts") */
	entry: string;
	/** Output directory relative to cwd (e.g., "./dist") */
	outDir: string;
	/** Output file name (e.g., "bundle.js") */
	outFile: string;
	/** Additional directories to watch in watch mode */
	watchDirs: string[];
	/** Run TypeScript type checking before bundling */
	strict: boolean;
	/** Use esbuild instead of @deno/emit (enables npm: specifier support) */
	useEsbuild: boolean;
	/** Minify the output bundle */
	minify: boolean;
}

/** Default source root directory */
export const DEFAULT_ROOT: string = "src";

/** Default entry point file name */
export const DEFAULT_ENTRY_POINT: string = "mod.ts";

/** Default output file name */
export const DEFAULT_OUT_FILENAME: string = "bundle.js";

/**
 * Returns a formatted timestamp string for logging.
 * @returns Current time in HH:MM:SS format (24-hour)
 * @example
 * ```ts
 * console.log(`[${timestamp()}] Building...`); // [14:32:05] Building...
 * ```
 */
export const timestamp = (): string =>
	new Date().toLocaleTimeString("en-GB", { hour12: false });

/**
 * Retrieves package name and version from package metadata.
 *
 * When running from JSR, parses the URL to extract package info.
 * When running locally, reads from deno.json in the package root.
 *
 * @returns Package info object or null if unavailable
 * @example
 * ```ts
 * const pkg = await getPackageInfo();
 * if (pkg) {
 *   console.log(`${pkg.name} v${pkg.version}`);
 * }
 * ```
 */
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

/**
 * Searches for an import map file in the current working directory.
 *
 * Checks for files in order: deno.json, deno.jsonc, import_map.json
 *
 * @returns Absolute path to the import map file, or undefined if not found
 * @example
 * ```ts
 * const importMap = await findImportMap();
 * if (importMap) {
 *   console.log(`Using import map: ${importMap}`);
 * }
 * ```
 */
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

/**
 * Runs TypeScript type checking on the specified entry point using `deno check`.
 *
 * Output is streamed to stdout/stderr for visibility.
 *
 * @param entryPath - Absolute path to the entry point file to check
 * @returns True if type checking passes, false otherwise
 * @example
 * ```ts
 * const success = await typeCheck("/path/to/src/mod.ts");
 * if (!success) {
 *   throw new Error("Type checking failed");
 * }
 * ```
 */
export async function typeCheck(entryPath: string): Promise<boolean> {
	const command = new Deno.Command("deno", {
		args: ["check", entryPath],
		stdout: "inherit",
		stderr: "inherit",
	});
	const { success } = await command.output();
	return success;
}
