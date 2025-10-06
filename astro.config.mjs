// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import fs from 'fs';
import path from 'path';

// https://astro.build/config
export default defineConfig({
	integrations: [react()],
	adapter: vercel({ mode: 'server' }),
	vite: {
		// no custom plugins (diagnostic plugins removed)
		plugins: []
		,
		build: {
			minify: false,
			// target ES2017 so esbuild does not emit optional-catch-binding (catch { })
			target: 'es2017'
		}
	}
});
