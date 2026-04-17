import { bundle } from "@deno/emit";
import { relative, resolve } from "@std/path";
import { exists } from "@std/fs";
import {
	BuildOptions,
	EntryNotFoundError,
	findImportMap,
	logStyled,
	resolveBuildOptions,
	timestamp,
	typeCheck,
} from "./utils.ts";

/**
 * Bundles TypeScript source files into a single JavaScript ES module.
 *
 * Uses @deno/emit by default, or esbuild when `useEsbuild` option is enabled.
 * Automatically detects import maps from deno.json, deno.jsonc, or import_map.json
 * by walking up from the current working directory.
 *
 * @param options - Build configuration options (all fields optional)
 * @returns The bundled code as a string
 * @throws {EntryNotFoundError} if the entry point file does not exist
 * @throws Error if type checking fails (when strict mode is enabled)
 * @throws Error if bundling fails
 * @example
 * ```ts
 * import { build } from "jsr:@marianmeres/deno-build/lib";
 *
 * // Defaults: src/mod.ts -> ./dist/bundle.js
 * const code = await build();
 *
 * // With options
 * const code2 = await build({
 *   root: "src",
 *   entry: "mod.ts",
 *   outDir: "./dist",
 *   outFile: "bundle.js",
 *   minify: true,
 * });
 *
 * // Get code only without writing to file
 * const codeOnly = await build({ skipWrite: true });
 * ```
 */
export async function build(options: BuildOptions = {}): Promise<string> {
	const opts = resolveBuildOptions(options);
	const {
		root,
		entry,
		outDir,
		outFile,
		strict,
		useEsbuild,
		minify,
		skipWrite,
		keepEsbuildAlive,
	} = opts;

	const entryPath = resolve(Deno.cwd(), root, entry);
	const outDirPath = resolve(Deno.cwd(), outDir);
	const outPath = resolve(outDirPath, outFile);

	if (!(await exists(entryPath))) {
		throw new EntryNotFoundError(entryPath);
	}

	if (strict) {
		logStyled(
			"err",
			`%c[${timestamp()}]%c Type checking ${root}/${entry}...`,
			"color: gray",
			"color: inherit"
		);
		if (!(await typeCheck(entryPath))) {
			throw new Error("Type checking failed");
		}
	}

	const importMapPath = await findImportMap();

	const bundlerLabel = useEsbuild ? " (esbuild)" : "";
	const minifyLabel = minify ? " [minify]" : "";
	logStyled(
		"err",
		`%c[${timestamp()}]%c Building ${root}/${entry}${bundlerLabel}${minifyLabel}...`,
		"color: gray",
		"color: inherit"
	);

	try {
		let code: string;

		if (useEsbuild) {
			const { buildWithEsbuild } = await import("./esbuild-bundler.ts");
			code = await buildWithEsbuild({
				entryPath,
				outPath,
				importMapPath,
				minify,
				skipWrite,
				keepAlive: keepEsbuildAlive,
			});
		} else {
			const entryPoint = new URL(`file://${entryPath}`);
			const bundleOptions: Parameters<typeof bundle>[1] = { type: "module" };
			if (importMapPath) {
				bundleOptions.importMap = new URL(`file://${importMapPath}`);
			}
			const result = await bundle(entryPoint, bundleOptions);
			code = result.code;

			if (minify) {
				const { minifyCode } = await import("./esbuild-bundler.ts");
				code = await minifyCode(code, keepEsbuildAlive);
			}

			if (!skipWrite) {
				await Deno.mkdir(outDirPath, { recursive: true });
				await Deno.writeTextFile(outPath, code);
			}
		}

		if (!skipWrite) {
			logStyled(
				"err",
				`%c[${timestamp()}]%c  ✓ ${relative(Deno.cwd(), outPath)}`,
				"color: gray",
				"color: green"
			);
		}

		return code;
	} catch (error) {
		logStyled(
			"err",
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
 * during rapid file changes, and serialized so a rebuild cannot start while a
 * previous one is still running. Only `.ts`, `.tsx`, `.js`, and `.jsx` files
 * trigger rebuilds, and writes to the output bundle are ignored to avoid
 * feedback loops. In esbuild mode the esbuild service is kept warm across
 * rebuilds.
 *
 * This function never returns normally — call `Deno.exit()` or `Deno.kill()`
 * to stop watching. It throws if the watcher itself terminates unexpectedly.
 *
 * @param options - Build configuration options (same as {@link build})
 * @throws Error if any watched directory does not exist
 */
export async function watchAndRebuild(options: BuildOptions = {}): Promise<never> {
	const opts = resolveBuildOptions(options);
	const rootPath = resolve(Deno.cwd(), opts.root);
	const extraPaths = opts.watchDirs.map((d) => resolve(Deno.cwd(), d));
	const watchPaths = [rootPath, ...extraPaths];

	for (const p of watchPaths) {
		if (!(await exists(p))) {
			throw new Error(`Watch directory does not exist: ${p}`);
		}
	}

	const outPath = resolve(Deno.cwd(), opts.outDir, opts.outFile);

	logStyled(
		"err",
		`\n%c[${timestamp()}]%c Watching for changes:\n${watchPaths
			.map((p) => `    ${p}`)
			.join("\n")}\n`,
		"color: gray",
		"color: cyan"
	);

	// In watch mode, reuse the build options but mark esbuild as keep-alive so
	// each rebuild doesn't pay the esbuild startup cost.
	const rebuildOptions: BuildOptions = { ...options, keepEsbuildAlive: true };

	const watcher = Deno.watchFs(watchPaths);
	let debounceTimeout: number | undefined;
	let inFlight: Promise<void> | undefined;
	let pending = false;

	const triggerRebuild = () => {
		if (inFlight) {
			pending = true;
			return;
		}
		inFlight = (async () => {
			try {
				await build(rebuildOptions);
			} catch {
				// already logged by build()
			}
			logStyled(
				"out",
				`\n%c[${timestamp()}]%c Watching for changes...\n`,
				"color: gray",
				"color: cyan"
			);
		})().finally(() => {
			inFlight = undefined;
			if (pending) {
				pending = false;
				triggerRebuild();
			}
		});
	};

	try {
		for await (const event of watcher) {
			if (event.kind !== "modify" && event.kind !== "create") continue;

			const hasRelevantFile = event.paths.some(
				(p) =>
					p !== outPath &&
					(p.endsWith(".ts") ||
						p.endsWith(".tsx") ||
						p.endsWith(".js") ||
						p.endsWith(".jsx"))
			);
			if (!hasRelevantFile) continue;

			clearTimeout(debounceTimeout);
			debounceTimeout = setTimeout(triggerRebuild, 100);
		}
	} finally {
		// Best-effort: if we ever leave the loop, shut esbuild down so the
		// process can exit.
		try {
			const { stopEsbuild } = await import("./esbuild-bundler.ts");
			stopEsbuild();
		} catch {
			// ignore
		}
	}

	throw new Error("Watcher unexpectedly terminated");
}
