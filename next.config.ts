import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home folder otherwise confuses root detection.
  turbopack: { root: __dirname },
  // Dev logs every server action's arguments by default, which would print passwords (changePassword, signIn).
  logging: { serverFunctions: false },
};

export default nextConfig;
