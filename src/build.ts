import { bundle } from "@deno/emit";
import { relative, resolve } from "@std/path";
import { exists } from "@std/fs";
import { BuildOptions, findImportMap, timestamp, typeCheck } from "./utils.ts";

export async function build(options: BuildOptions) {
	const { root, entry, outDir, outFile, strict, useEsbuild, minify } = options;
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
		await Deno.mkdir(outDirPath, { recursive: true });

		if (useEsbuild) {
			// Use esbuild bundler (supports npm: specifiers)
			const { buildWithEsbuild } = await import("./esbuild-bundler.ts");
			await buildWithEsbuild({
				entryPath,
				outPath,
				importMapPath,
				minify,
			});
		} else {
			// Use @deno/emit bundler (default)
			const entryPoint = new URL(`file://${entryPath}`);
			const bundleOptions: Parameters<typeof bundle>[1] = { type: "module" };

			if (importMapPath) {
				bundleOptions.importMap = new URL(`file://${importMapPath}`);
			}

			const result = await bundle(entryPoint, bundleOptions);

			let code = result.code;
			if (minify) {
				const { minifyCode } = await import("./esbuild-bundler.ts");
				code = await minifyCode(code);
			}

			await Deno.writeTextFile(outPath, code);
		}

		console.log(
			`%c[${timestamp()}]%c  ✓ ${relative(Deno.cwd(), outPath)}`,
			"color: gray",
			"color: green"
		);
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

export async function watchAndRebuild(options: BuildOptions) {
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
}
