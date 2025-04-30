import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',
  images: {
    unoptimized: true,
  },
  // 确保能正确处理静态资源
  trailingSlash: true,
  // 禁用构建时的ESLint检查
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 禁用构建时的类型检查
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
