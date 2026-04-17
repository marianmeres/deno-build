import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { dirname } from "@std/path";

/**
 * Configuration options for the esbuild bundler.
 */
export interface EsbuildOptions {
	/** Absolute path to the entry point file */
	entryPath: string;
	/** Absolute path to the output file */
	outPath: string;
	/** Optional path to deno.json or import_map.json for import resolution */
	importMapPath?: string;
	/** Whether to minify the output */
	minify?: boolean;
	/** Skip writing to file, only return bundled code */
	skipWrite?: boolean;
	/**
	 * When true, do NOT call `esbuild.stop()` after bundling. The caller is
	 * responsible for invoking {@link stopEsbuild} when done. Useful in
	 * long-running scenarios (e.g. watch mode) where paying the esbuild
	 * startup cost on every rebuild would defeat its speed advantage.
	 *
	 * @default false
	 */
	keepAlive?: boolean;
}

/**
 * Bundles TypeScript/JavaScript using esbuild with Deno support.
 *
 * Uses `@luca/esbuild-deno-loader` plugins to support Deno's import map,
 * JSR packages, and npm: specifiers. Output is an ES module.
 *
 * The bundled code is captured in memory and written to disk by this function
 * (no double I/O). Set `skipWrite: true` to return the code without touching
 * the filesystem.
 *
 * @param options - Esbuild configuration options
 * @returns The bundled code as a string
 * @throws Error if esbuild produces no output
 */
export async function buildWithEsbuild(options: EsbuildOptions): Promise<string> {
	const { entryPath, outPath, importMapPath, minify, skipWrite, keepAlive } = options;

	try {
		const denoPluginsConfig = importMapPath ? { configPath: importMapPath } : {};
		// Cast: @luca/esbuild-deno-loader bundles its own Plugin type definitions
		// which can lag the installed esbuild version. The runtime contract is
		// compatible; only the TS types diverge.
		const plugins = denoPlugins(denoPluginsConfig) as unknown as esbuild.Plugin[];
		const result = await esbuild.build({
			plugins,
			entryPoints: [entryPath],
			write: false,
			bundle: true,
			format: "esm",
			minify: minify ?? false,
		});

		const outputFile = result.outputFiles?.[0];
		if (!outputFile) {
			throw new Error("esbuild produced no output files");
		}
		const code = outputFile.text;

		if (!skipWrite) {
			await Deno.mkdir(dirname(outPath), { recursive: true });
			await Deno.writeTextFile(outPath, code);
		}

		return code;
	} finally {
		if (!keepAlive) {
			esbuild.stop();
		}
	}
}

/**
 * Minifies JavaScript code using esbuild's transform API.
 *
 * Used by the @deno/emit bundler path when `--minify` flag is specified.
 *
 * @param code - JavaScript code to minify
 * @param keepAlive - When true, do NOT call `esbuild.stop()` after transforming
 *                   (default: false). See {@link EsbuildOptions.keepAlive}.
 * @returns Minified code
 */
export async function minifyCode(code: string, keepAlive = false): Promise<string> {
	try {
		const result = await esbuild.transform(code, { minify: true });
		return result.code;
	} finally {
		if (!keepAlive) {
			esbuild.stop();
		}
	}
}

/**
 * Explicitly stops the esbuild service. Safe to call multiple times.
 *
 * Only needed when {@link buildWithEsbuild} or {@link minifyCode} were invoked
 * with `keepAlive: true`. Without this call, the esbuild child process keeps
 * running and prevents Deno from exiting.
 */
export function stopEsbuild(): void {
	esbuild.stop();
}
