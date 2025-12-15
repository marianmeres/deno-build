import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";

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
}

/**
 * Bundles TypeScript/JavaScript using esbuild with Deno support.
 *
 * Uses `@luca/esbuild-deno-loader` plugins to support Deno's import map,
 * JSR packages, and npm: specifiers. Output is an ES module.
 *
 * @param options - Esbuild configuration options
 * @example
 * ```ts
 * import { buildWithEsbuild } from "jsr:@marianmeres/deno-build/lib";
 *
 * await buildWithEsbuild({
 *   entryPath: "/path/to/src/mod.ts",
 *   outPath: "/path/to/dist/bundle.js",
 *   importMapPath: "/path/to/deno.json",
 *   minify: true,
 * });
 * ```
 */
export async function buildWithEsbuild(options: EsbuildOptions): Promise<void> {
	const { entryPath, outPath, importMapPath, minify } = options;

	await esbuild.build({
		plugins: [...denoPlugins({ configPath: importMapPath })],
		entryPoints: [entryPath],
		outfile: outPath,
		bundle: true,
		format: "esm",
		minify: minify ?? false,
	});

	esbuild.stop();
}

/**
 * Minifies JavaScript code using esbuild's transform API.
 *
 * Used by the @deno/emit bundler path when `--minify` flag is specified.
 *
 * @param code - JavaScript code to minify
 * @returns Minified code
 * @example
 * ```ts
 * import { minifyCode } from "jsr:@marianmeres/deno-build/lib";
 *
 * const minified = await minifyCode(`
 *   export function greet(name) {
 *     return "Hello, " + name + "!";
 *   }
 * `);
 * ```
 */
export async function minifyCode(code: string): Promise<string> {
	const result = await esbuild.transform(code, { minify: true });
	esbuild.stop();
	return result.code;
}
