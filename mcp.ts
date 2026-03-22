import { z } from "npm:zod";
import type { McpToolDefinition } from "jsr:@marianmeres/mcp-server/types";
import { minifyCode } from "./src/esbuild-bundler.ts";

export const tools: McpToolDefinition[] = [
	{
		name: "minify-javascript",
		description:
			"Minify JavaScript code using esbuild. Takes JS source code as a string and returns the minified version.",
		params: {
			code: z.string().describe("JavaScript source code to minify"),
		},
		handler: async ({ code }) => {
			return await minifyCode(code as string);
		},
	},
];
