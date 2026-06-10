import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

// Manual env loader to resolve monorepo root .env file
const envPath = path.resolve(process.cwd(), "../../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
  },
});
