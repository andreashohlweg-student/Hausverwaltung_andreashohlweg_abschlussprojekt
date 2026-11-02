import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  auth: true,
  functions: {
    hello: {
      name: "Hausportal-Einladungen",
      source: "./hello.ts",
      env: {
        FUNCTION_ORIGIN_SECRET: process.env.FUNCTION_ORIGIN_SECRET!,
        APP_URL: process.env.APP_URL!,
        SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
        SMTP_PORT: process.env.SMTP_PORT || "465",
        ...(process.env.SMTP_USER ? { SMTP_USER: process.env.SMTP_USER } : {}),
        ...(process.env.SMTP_PASS ? { SMTP_PASS: process.env.SMTP_PASS } : {}),
      },
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
