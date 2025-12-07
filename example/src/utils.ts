/** Simple utility to generate a random ID */
export function randomId(prefix = "id"): string {
	return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Debounce a function */
export function debounce<T extends (...args: unknown[]) => void>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeout: number | undefined;
	return (...args: Parameters<T>) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), delay);
	};
}

/** Simple event emitter */
export class EventEmitter<T extends Record<string, unknown[]>> {
	private listeners = new Map<keyof T, Set<(...args: unknown[]) => void>>();

	on<K extends keyof T>(event: K, callback: (...args: T[K]) => void): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback as (...args: unknown[]) => void);
		return () => this.off(event, callback);
	}

	off<K extends keyof T>(event: K, callback: (...args: T[K]) => void): void {
		this.listeners.get(event)?.delete(callback as (...args: unknown[]) => void);
	}

	emit<K extends keyof T>(event: K, ...args: T[K]): void {
		this.listeners.get(event)?.forEach((cb) => cb(...args));
	}
}
