/**
 * Example module demonstrating Deno TS bundled for browser use.
 * @module
 */

export { randomId, debounce, EventEmitter } from "./utils.ts";

/** Library version */
export const VERSION = "1.0.0";

/** Greet function for demo purposes */
export function greet(name: string): string {
	return `Hello, ${name}!`;
}
