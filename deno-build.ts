import { bundle } from "@deno/emit";
import { parseArgs } from "@std/cli/parse-args";
import { relative, resolve } from "@std/path";
import { exists } from "@std/fs";

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
  --help, -h             Show this help message

Examples:
  deno run -A jsr:@marianmeres/deno-build
  deno run -A jsr:@marianmeres/deno-build --root lib --entry index.ts --outfile app.js
  deno run -A jsr:@marianmeres/deno-build --outdir ./public/js --watch

Note: Automatically detects deno.json/deno.jsonc/import_map.json in cwd for import resolution.
`);
}

interface BuildOptions {
	root: string;
	entry: string;
	outDir: string;
	outFile: string;
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
	const { root, entry, outDir, outFile } = options;
	const entryPath = resolve(Deno.cwd(), root, entry);
	const outDirPath = resolve(Deno.cwd(), outDir);
	const outPath = resolve(outDirPath, outFile);

	// Check if entry point exists
	if (!(await exists(entryPath))) {
		console.error(`%c[${timestamp()}] Error: Entry point not found: ${entryPath}`, "color: red");
		Deno.exit(1);
	}

	// Auto-detect import map
	const importMapPath = await findImportMap();

	console.log(
		`%c[${timestamp()}]%c Building ${root}/${entry}...`,
		"color: gray",
		"color: inherit"
	);

	try {
		const entryPoint = new URL(`file://${entryPath}`);
		const bundleOptions: Parameters<typeof bundle>[1] = { type: "module" };

		if (importMapPath) {
			bundleOptions.importMap = new URL(`file://${importMapPath}`);
		}

		const result = await bundle(entryPoint, bundleOptions);

		await Deno.mkdir(outDirPath, { recursive: true });
		await Deno.writeTextFile(outPath, result.code);

		console.log(
			`%c[${timestamp()}]%c  ✓ Built to ${relative(Deno.cwd(), outPath)}`,
			"color: gray",
			"color: green"
		);
	} catch (error) {
		console.error(
			`%c[${timestamp()}] Build failed: ${error instanceof Error ? error.message : error}`,
			"color: red"
		);
		throw error;
	}
}

async function watchAndRebuild(options: BuildOptions) {
	const watchPath = resolve(Deno.cwd(), options.root);

	console.log(
		`\n%c[${timestamp()}]%c Watching ${watchPath} for changes...\n`,
		"color: gray",
		"color: cyan"
	);

	const watcher = Deno.watchFs(watchPath);
	let debounceTimeout: number | undefined;

	for await (const event of watcher) {
		if (event.kind !== "modify" && event.kind !== "create") continue;

		// Skip non-ts files
		const hasRelevantFile = event.paths.some(
			(p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx")
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
	const args = parseArgs(Deno.args, {
		string: ["root", "entry", "outfile", "outdir"],
		alias: {
			r: "root",
			e: "entry",
			f: "outfile",
			o: "outdir",
			h: "help",
			w: "watch",
		},
		boolean: ["help", "watch"],
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
	};

	await build(options);

	if (args.watch) {
		await watchAndRebuild(options);
	}
}

main();
