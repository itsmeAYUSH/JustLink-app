import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Target of the email confirmation link. Handles both link styles:
 *  - `?code=...`                 (default Supabase email template, PKCE)
 *  - `?token_hash=...&type=...`  (recommended template, works across browsers)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/";
  // Same-site paths only ("//host" and "/\host" would leave the site).
  const next = /^\/(?![/\\])/.test(nextParam) ? nextParam : "/";

  const supabase = await createClient();
  let errorMessage: string | null = "The confirmation link is invalid or has expired.";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    errorMessage = error?.message ?? null;
  }

  if (errorMessage) {
    const login = new URL("/login", origin);
    login.searchParams.set("error", errorMessage);
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL(next, origin));
}
