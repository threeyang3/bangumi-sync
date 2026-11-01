import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		extensions: ['.ts', '.mts', '.js', '.mjs', '.json'],
		alias: {
			obsidian: resolve(import.meta.dirname, 'tests/mocks/obsidian.ts'),
		},
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
	},
});
