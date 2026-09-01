import { defineConfig, mergeConfig } from 'vitest/config';
import { getConfig } from './vite.config.js';

// Integration tests talk to the local Synapse from test/synapse. They are kept out of the unit
// config so `pnpm test` stays offline and fast.
export default mergeConfig(getConfig(), defineConfig({
	test: {
		include: ['./test/integration/**/*.test.ts'],
		environment: 'happy-dom',
		setupFiles: ['./test/setup.unit.ts'],
		testTimeout: 60_000,
		hookTimeout: 60_000,
		// One homeserver, shared state: run the files in sequence.
		fileParallelism: false,
	},
}));
