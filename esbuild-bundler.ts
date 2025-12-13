import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";

export interface EsbuildOptions {
	entryPath: string;
	outPath: string;
	importMapPath?: string;
	minify?: boolean;
}

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

// Helper for minifying code (used by @deno/emit path when --minify is set)
export async function minifyCode(code: string): Promise<string> {
	const result = await esbuild.transform(code, { minify: true });
	esbuild.stop();
	return result.code;
}
