import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";

const testEnvPath = path.resolve(__dirname, ".env.test.local");
if (fs.existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath, override: true });
}

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      ...(fs.existsSync(testEnvPath) ? dotenv.parse(fs.readFileSync(testEnvPath)) : {}),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
