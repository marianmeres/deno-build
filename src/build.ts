import { bundle } from "@deno/emit";
import { relative, resolve } from "@std/path";
import { exists } from "@std/fs";
import { BuildOptions, findImportMap, timestamp, typeCheck } from "./utils.ts";

/**
 * Bundles TypeScript source files into a single JavaScript ES module.
 *
 * Uses @deno/emit by default, or esbuild when `useEsbuild` option is enabled.
 * Automatically detects import maps from deno.json, deno.jsonc, or import_map.json.
 *
 * @param options - Build configuration options
 * @returns The bundled code as a string
 * @throws Error if type checking fails (when strict mode is enabled)
 * @throws Error if bundling fails
 * @example
 * ```ts
 * import { build } from "jsr:@marianmeres/deno-build/lib";
 *
 * // Write to file and get code
 * const code = await build({
 *   root: "src",
 *   entry: "mod.ts",
 *   outDir: "./dist",
 *   outFile: "bundle.js",
 *   watchDirs: [],
 *   strict: false,
 *   useEsbuild: false,
 *   minify: false,
 * });
 *
 * // Get code only without writing to file
 * const codeOnly = await build({
 *   root: "src",
 *   entry: "mod.ts",
 *   outDir: "./dist",
 *   outFile: "bundle.js",
 *   watchDirs: [],
 *   strict: false,
 *   useEsbuild: false,
 *   minify: false,
 *   skipWrite: true,
 * });
 * ```
 */
export async function build(options: BuildOptions): Promise<string> {
	const { root, entry, outDir, outFile, strict, useEsbuild, minify, skipWrite } = options;
	const entryPath = resolve(Deno.cwd(), root, entry);
	const outDirPath = resolve(Deno.cwd(), outDir);
	const outPath = resolve(outDirPath, outFile);

	// Check if entry point exists
	if (!(await exists(entryPath))) {
		console.error(
			`%c[${timestamp()}] Error: Entry point not found: ${entryPath}`,
			"color: red"
		);
		Deno.exit(1);
	}

	// Run type checking if strict mode is enabled
	if (strict) {
		console.log(
			`%c[${timestamp()}]%c Type checking ${root}/${entry}...`,
			"color: gray",
			"color: inherit"
		);
		if (!(await typeCheck(entryPath))) {
			throw new Error("Type checking failed");
		}
	}

	// Auto-detect import map
	const importMapPath = await findImportMap();

	const bundlerLabel = useEsbuild ? " (esbuild)" : "";
	const minifyLabel = minify ? " [minify]" : "";
	console.log(
		`%c[${timestamp()}]%c Building ${root}/${entry}${bundlerLabel}${minifyLabel}...`,
		"color: gray",
		"color: inherit"
	);

	try {
		let code: string;

		if (useEsbuild) {
			// Use esbuild bundler (supports npm: specifiers)
			if (!skipWrite) {
				await Deno.mkdir(outDirPath, { recursive: true });
			}
			const { buildWithEsbuild } = await import("./esbuild-bundler.ts");
			code = await buildWithEsbuild({
				entryPath,
				outPath,
				importMapPath,
				minify,
				skipWrite,
			});
		} else {
			// Use @deno/emit bundler (default)
			const entryPoint = new URL(`file://${entryPath}`);
			const bundleOptions: Parameters<typeof bundle>[1] = { type: "module" };

			if (importMapPath) {
				bundleOptions.importMap = new URL(`file://${importMapPath}`);
			}

			const result = await bundle(entryPoint, bundleOptions);

			code = result.code;
			if (minify) {
				const { minifyCode } = await import("./esbuild-bundler.ts");
				code = await minifyCode(code);
			}

			if (!skipWrite) {
				await Deno.mkdir(outDirPath, { recursive: true });
				await Deno.writeTextFile(outPath, code);
			}
		}

		if (!skipWrite) {
			console.log(
				`%c[${timestamp()}]%c  ✓ ${relative(Deno.cwd(), outPath)}`,
				"color: gray",
				"color: green"
			);
		}

		return code;
	} catch (error) {
		console.error(
			`%c[${timestamp()}] Build failed: ${
				error instanceof Error ? error.message : error
			}`,
			"color: red"
		);
		throw error;
	}
}

/**
 * Watches source directories for changes and triggers rebuilds automatically.
 *
 * Monitors the source root directory and any additional directories specified
 * in `watchDirs`. Rebuilds are debounced (100ms) to prevent excessive builds
 * during rapid file changes. Only `.ts`, `.tsx`, `.js`, and `.jsx` files
 * trigger rebuilds.
 *
 * @param options - Build configuration options (same as {@link build})
 * @example
 * ```ts
 * import { build, watchAndRebuild } from "jsr:@marianmeres/deno-build/lib";
 *
 * const options = {
 *   root: "src",
 *   entry: "mod.ts",
 *   outDir: "./dist",
 *   outFile: "bundle.js",
 *   watchDirs: ["../shared-lib"],
 *   strict: false,
 *   useEsbuild: false,
 *   minify: false,
 * };
 *
 * // Initial build
 * await build(options);
 *
 * // Start watching
 * await watchAndRebuild(options);
 * ```
 */
export async function watchAndRebuild(options: BuildOptions): Promise<never> {
	const watchPaths = [
		resolve(Deno.cwd(), options.root),
		...options.watchDirs.map((d) => resolve(Deno.cwd(), d)),
	];

	console.log(
		`\n%c[${timestamp()}]%c Watching for changes:\n${watchPaths
			.map((p) => `    ${p}`)
			.join("\n")}\n`,
		"color: gray",
		"color: cyan"
	);

	const watcher = Deno.watchFs(watchPaths);
	let debounceTimeout: number | undefined;

	for await (const event of watcher) {
		if (event.kind !== "modify" && event.kind !== "create") continue;

		// Skip non-ts files
		const hasRelevantFile = event.paths.some(
			(p) =>
				p.endsWith(".ts") ||
				p.endsWith(".tsx") ||
				p.endsWith(".js") ||
				p.endsWith(".jsx")
		);
		if (!hasRelevantFile) continue;

		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(async () => {
			try {
				await build(options);
			} catch {
				// Error already logged in build()
			}
			console.log(
				`\n%c[${timestamp()}]%c Watching for changes...\n`,
				"color: gray",
				"color: cyan"
			);
		}, 100);
	}

	// This line is technically unreachable since the watcher runs forever,
	// but TypeScript needs it for the Promise<never> return type
	throw new Error("Watcher unexpectedly terminated");
}
