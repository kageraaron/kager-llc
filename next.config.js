/** @type {import('next').NextConfig} */
const nextConfig = {
  // This option tells Next.js to transpile packages that use ESM modules
  // or might not be compatible out-of-the-box with the build process,
  // especially important for external libraries used in workers or complex setups.
  transpilePackages: ['@huggingface/transformers'],
};

module.exports = nextConfig;
