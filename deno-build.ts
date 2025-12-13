import { bundle } from "@deno/emit";
import { parseArgs } from "@std/cli/parse-args";
import { fromFileUrl, relative, resolve } from "@std/path";
import { exists } from "@std/fs";

interface PackageInfo {
	name: string;
	version: string;
}

async function getPackageInfo(): Promise<PackageInfo | null> {
	try {
		const baseUrl = import.meta.url;

		// JSR URL format: https://jsr.io/@scope/name/version/file.ts
		const jsrMatch = baseUrl.match(
			/^https:\/\/jsr\.io\/(@[^/]+\/[^/]+)\/([^/]+)\//
		);
		if (jsrMatch) {
			return { name: jsrMatch[1], version: jsrMatch[2] };
		}

		// Local: read from deno.json
		if (baseUrl.startsWith("file://")) {
			const denoJsonUrl = new URL("deno.json", baseUrl).href;
			const content = await Deno.readTextFile(fromFileUrl(denoJsonUrl));
			const json = JSON.parse(content);
			return { name: json.name, version: json.version };
		}

		return null;
	} catch {
		return null;
	}
}

const DEFAULT_ROOT = "src";
const DEFAULT_ENTRY_POINT = "mod.ts";
const DEFAULT_OUT_FILENAME = "bundle.js";

const timestamp = () =>
	new Date().toLocaleTimeString("en-GB", { hour12: false });

function printUsage() {
	console.log(`
deno-build: Bundle Deno TypeScript sources into vanilla JS for browser use.

Usage: deno run -A jsr:@marianmeres/deno-build [options]

Options:
  --root, -r <path>      Source root directory (default: "${DEFAULT_ROOT}")
  --entry, -e <file>     Entry point file name (default: "${DEFAULT_ENTRY_POINT}")
  --outfile, -f <file>   Output file name (default: "${DEFAULT_OUT_FILENAME}")
  --outdir, -o <path>    Output directory (default: "./dist")
  --watch, -w            Watch for changes and rebuild automatically
  --watch-dir, -d <path> Additional directory to watch (can be repeated)
  --strict, -s           Run type checking before bundling (fail on type errors)
  --esbuild, -b          Use esbuild bundler (enables npm: specifier support)
  --minify, -m           Minify the output bundle
  --help, -h             Show this help message

Examples:
  deno run -A jsr:@marianmeres/deno-build
  deno run -A jsr:@marianmeres/deno-build --root lib --entry index.ts --outfile app.js
  deno run -A jsr:@marianmeres/deno-build --outdir ./public/js --watch
  deno run -A jsr:@marianmeres/deno-build --watch --watch-dir ../shared-lib -d ../utils

Note: Automatically detects deno.json/deno.jsonc/import_map.json in cwd for import resolution.
`);
}

interface BuildOptions {
	root: string;
	entry: string;
	outDir: string;
	outFile: string;
	watchDirs: string[];
	strict: boolean;
	useEsbuild: boolean;
	minify: boolean;
}

async function typeCheck(entryPath: string): Promise<boolean> {
	const command = new Deno.Command("deno", {
		args: ["check", entryPath],
		stdout: "inherit",
		stderr: "inherit",
	});
	const { success } = await command.output();
	return success;
}

async function findImportMap(): Promise<string | undefined> {
	const candidates = ["deno.json", "deno.jsonc", "import_map.json"];
	for (const candidate of candidates) {
		const path = resolve(Deno.cwd(), candidate);
		if (await exists(path)) {
			return path;
		}
	}
	return undefined;
}

async function build(options: BuildOptions) {
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

async function watchAndRebuild(options: BuildOptions) {
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

async function main() {
	const pkg = await getPackageInfo();
	if (pkg) {
		console.log(`%c${pkg.name} v${pkg.version}`, "color: cyan");
	}

	const args = parseArgs(Deno.args, {
		string: ["root", "entry", "outfile", "outdir"],
		alias: {
			r: "root",
			e: "entry",
			f: "outfile",
			o: "outdir",
			h: "help",
			w: "watch",
			d: "watch-dir",
			s: "strict",
			b: "esbuild",
			m: "minify",
		},
		boolean: ["help", "watch", "strict", "esbuild", "minify"],
		collect: ["watch-dir"],
		default: {
			root: DEFAULT_ROOT,
			entry: DEFAULT_ENTRY_POINT,
			outfile: DEFAULT_OUT_FILENAME,
			outdir: "./dist",
		},
	});

	if (args.help) {
		printUsage();
		Deno.exit(0);
	}

	const options: BuildOptions = {
		root: args.root,
		entry: args.entry,
		outDir: args.outdir,
		outFile: args.outfile,
		watchDirs: (args["watch-dir"] as string[]) || [],
		strict: args.strict,
		useEsbuild: args.esbuild,
		minify: args.minify,
	};

	await build(options);

	if (args.watch) {
		await watchAndRebuild(options);
	}
}

main();
