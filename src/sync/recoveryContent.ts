/** Deterministic 256-bit fingerprint over the exact UTF-8 bytes written by the plugin. */
export function hashRecoveryContent(content: string): string {
	const bytes = new TextEncoder().encode(content);
	const words = Array.from({ length: 8 }, (_, index) => (0x811c9dc5 ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
	for (const byte of bytes) {
		for (let index = 0; index < words.length; index++) {
			let value = words[index] ^ (byte + index * 17);
			value = Math.imul(value, 0x01000193 ^ (index * 2));
			value ^= value >>> 13;
			words[index] = value >>> 0;
		}
	}
	return words.map(value => value.toString(16).padStart(8, '0')).join('');
}
