import { cookies } from "next/headers";
import type { DamageLanguage } from "@/lib/damage";
export async function damageLanguage(): Promise<DamageLanguage> {
  return (await cookies()).get("hausportal-language")?.value === "en"
    ? "en"
    : "de";
}
