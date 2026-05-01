/** @type {import('next').NextConfig} */
const nextConfig = {
  // This option tells Next.js to transpile packages that use ESM modules
  // or might not be compatible out-of-the-box with the build process,
  // especially important for external libraries used in workers or complex setups.
  transpilePackages: ['@huggingface/transformers'],

  // Experimental Turbopack configurations to help with worker and ESM module handling
  experimental: {
    turbo: {
      // You can add Turbopack specific options here if necessary.
      // For now, we'll keep it minimal, but this block is where such
      // configurations would go.
    },
    // This option might help with module resolution in workers if other methods fail
    // though it's generally less common to need it if transpilePackages is set.
    // serverComponentsExternal: ['@huggingface/transformers'],
  },
};

module.exports = nextConfig;
