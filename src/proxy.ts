import { getAuth } from "@/lib/auth/server";
import type { NextRequest } from "next/server";
export default function proxy(request: NextRequest) {
  return getAuth().middleware({
    loginUrl: "/anmelden",
    publicRoutes: [
      "/anmelden",
      "/einladung",
      "/passwort-vergessen",
      "/passwort-zuruecksetzen",
      "/api/data",
      "/api/damages",
      "/api/invitations",
      "/api/me",
      "/api/services",
      "/icon.svg",
    ],
  })(request);
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
