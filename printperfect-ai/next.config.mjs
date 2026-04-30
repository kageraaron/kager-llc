/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ONNX Runtime Web's WASM threaded backend needs cross-origin isolation
  // (SharedArrayBuffer). We use COEP `credentialless` so externally-hosted
  // images (e.g. Printify product previews) still load without CORP headers.
  async headers() {
    return [
      {
        source: '/editor/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Don't try to bundle onnxruntime-web's .wasm files
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    if (!isServer) {
      config.output.assetModuleFilename = 'static/chunks/[hash][ext][query]';
    }
    return config;
  },
};

export default nextConfig;
