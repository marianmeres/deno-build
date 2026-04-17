import { dirname, fromFileUrl, join, resolve } from "@std/path";
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
 *
 * All fields are optional; sensible defaults are used when omitted.
 */
export interface BuildOptions {
	/** Source root directory relative to cwd (default: "src") */
	root?: string;
	/** Entry point file name within root (default: "mod.ts") */
	entry?: string;
	/** Output directory relative to cwd (default: "./dist") */
	outDir?: string;
	/** Output file name (default: "bundle.js") */
	outFile?: string;
	/** Additional directories to watch in watch mode (default: []) */
	watchDirs?: string[];
	/** Run TypeScript type checking before bundling (default: false) */
	strict?: boolean;
	/** Use esbuild instead of @deno/emit — enables npm: specifier support (default: false) */
	useEsbuild?: boolean;
	/** Minify the output bundle (default: false) */
	minify?: boolean;
	/** Skip writing to file; only return bundled code (default: false) */
	skipWrite?: boolean;
	/**
	 * Advanced: keep the esbuild service alive after bundling instead of calling
	 * `esbuild.stop()`. Used internally by watch mode to avoid spinning esbuild
	 * up and down between rebuilds. Callers who set this MUST call {@link stopEsbuild}
	 * when finished to allow the process to exit cleanly.
	 *
	 * @default false
	 */
	keepEsbuildAlive?: boolean;
}

/**
 * Fully-resolved build options — every field is populated with a default.
 * Used internally; returned by {@link resolveBuildOptions}.
 */
export interface ResolvedBuildOptions {
	root: string;
	entry: string;
	outDir: string;
	outFile: string;
	watchDirs: string[];
	strict: boolean;
	useEsbuild: boolean;
	minify: boolean;
	skipWrite: boolean;
	keepEsbuildAlive: boolean;
}

/** Default source root directory */
export const DEFAULT_ROOT: string = "src";

/** Default entry point file name */
export const DEFAULT_ENTRY_POINT: string = "mod.ts";

/** Default output file name */
export const DEFAULT_OUT_FILENAME: string = "bundle.js";

/** Default output directory */
export const DEFAULT_OUT_DIR: string = "./dist";

/**
 * Fills in defaults for any omitted {@link BuildOptions} fields.
 */
export function resolveBuildOptions(options: BuildOptions = {}): ResolvedBuildOptions {
	return {
		root: options.root ?? DEFAULT_ROOT,
		entry: options.entry ?? DEFAULT_ENTRY_POINT,
		outDir: options.outDir ?? DEFAULT_OUT_DIR,
		outFile: options.outFile ?? DEFAULT_OUT_FILENAME,
		watchDirs: options.watchDirs ?? [],
		strict: options.strict ?? false,
		useEsbuild: options.useEsbuild ?? false,
		minify: options.minify ?? false,
		skipWrite: options.skipWrite ?? false,
		keepEsbuildAlive: options.keepEsbuildAlive ?? false,
	};
}

/**
 * Thrown by {@link build} when the resolved entry point file does not exist.
 *
 * Callers (including the CLI) can detect this to produce a clean error message
 * without a stack trace.
 */
export class EntryNotFoundError extends Error {
	readonly entryPath: string;
	constructor(entryPath: string) {
		super(`Entry point not found: ${entryPath}`);
		this.name = "EntryNotFoundError";
		this.entryPath = entryPath;
	}
}

/**
 * Returns a formatted timestamp string for logging.
 * @returns Current time in HH:MM:SS format (24-hour)
 */
export const timestamp = (): string =>
	new Date().toLocaleTimeString("en-GB", { hour12: false });

let cachedStdoutIsTerminal: boolean | undefined;

/**
 * Returns true when stdout is attached to a terminal and CSS-style `%c` console
 * coloring should be used. Cached after first call.
 */
export function supportsColor(): boolean {
	if (cachedStdoutIsTerminal === undefined) {
		try {
			cachedStdoutIsTerminal = Deno.stdout.isTerminal();
		} catch {
			cachedStdoutIsTerminal = false;
		}
	}
	return cachedStdoutIsTerminal;
}

/**
 * Logs a message with optional `%c` color styling.
 *
 * When stdout is a terminal, the message and styles are passed through to
 * `console.log` / `console.error`. When stdout is not a terminal (piped,
 * redirected, CI), `%c` sequences are stripped so the output stays clean.
 *
 * @param stream - "out" for stdout, "err" for stderr
 * @param message - Message template containing `%c` placeholders
 * @param styles - CSS style strings, one per `%c` placeholder
 */
export function logStyled(
	stream: "out" | "err",
	message: string,
	...styles: string[]
): void {
	const fn = stream === "err" ? console.error : console.log;
	if (supportsColor()) {
		fn(message, ...styles);
	} else {
		fn(message.replace(/%c/g, ""));
	}
}

/**
 * Retrieves package name and version from package metadata.
 *
 * When running from JSR, parses the URL to extract package info.
 * When running locally, reads from deno.json in the package root.
 *
 * @returns Package info object or null if unavailable
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
 * Searches for an import map file, walking up from `startDir` toward the
 * filesystem root.
 *
 * Checks each directory for: `deno.json`, `deno.jsonc`, `import_map.json` (in
 * that order) before moving to the parent. This mirrors how Deno itself
 * locates a project config, so the tool works the same when invoked from a
 * subdirectory of the project.
 *
 * @param startDir - Directory to begin searching from (default: `Deno.cwd()`)
 * @returns Absolute path to the import map file, or undefined if none found
 */
export async function findImportMap(
	startDir: string = Deno.cwd()
): Promise<string | undefined> {
	const candidates = ["deno.json", "deno.jsonc", "import_map.json"];
	let current = resolve(startDir);
	while (true) {
		for (const candidate of candidates) {
			const path = join(current, candidate);
			if (await exists(path)) {
				return path;
			}
		}
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

/**
 * Runs TypeScript type checking on the specified entry point using `deno check`.
 *
 * Output is streamed to stdout/stderr for visibility.
 *
 * @param entryPath - Absolute path to the entry point file to check
 * @returns True if type checking passes, false otherwise
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
