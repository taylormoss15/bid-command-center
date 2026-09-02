/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits .next/standalone with only the files the server actually needs, so
  // the container image stays small. Required by the Dockerfile.
  output: "standalone",
};

export default nextConfig;
