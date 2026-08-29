import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /*
       * `server-only` throws on import outside a React Server Component, which
       * is exactly what it is for — it is the build-time guard that stops
       * `lib/crypto.ts` and `lib/supabase/admin.ts` being pulled into a client
       * bundle. Vitest is neither a client nor a server component, so it trips
       * the guard while importing modules that legitimately reach those files
       * (match.ts -> cache.ts -> admin.ts).
       *
       * Aliasing it to the package's own `empty.js` no-op is the intended
       * escape hatch. It weakens nothing: the real enforcement happens in
       * `next build`, which still fails if a client component imports either
       * module.
       */
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
});
