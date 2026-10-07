import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // The Docker image (Dockerfile) sets NEXT_OUTPUT=standalone to get a small self-contained server; Vercel and `next dev` are unaffected.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
