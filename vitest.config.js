import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        // Root tests/ covers the legacy js/ tree and asset integrity; workspace
        // packages keep their specs co-located so they travel with the package
        // into apps/web and apps/native.
        include: ['tests/**/*.test.js', 'packages/*/tests/**/*.test.js'],
    },
});
