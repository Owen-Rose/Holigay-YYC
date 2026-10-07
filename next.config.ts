import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The public form accepts attachments up to 10 MB (MAX_FILE_SIZE); Next's
      // 1 MB default made every larger upload fail with 413 (BL-11 / 008 T005).
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
