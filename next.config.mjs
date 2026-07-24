/** @type {import('next').NextConfig} */
const nextConfig = {
  // Photos are served straight from OxiBase storage.
  images: { remotePatterns: [{ protocol: "https", hostname: "oxibase.baltavista.com" }] },
};

export default nextConfig;
