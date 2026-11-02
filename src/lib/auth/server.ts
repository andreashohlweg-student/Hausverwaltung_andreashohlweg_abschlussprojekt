import { createNeonAuth } from "@neon/auth/next/server";

let auth: ReturnType<typeof createNeonAuth> | undefined;

export function getAuth() {
  // Runtime configuration keeps credentials out of Docker image builds.
  return (auth ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: {
      secret: process.env.NEON_AUTH_COOKIE_SECRET!,
      sessionDataTtl: 60,
    },
  }));
}
