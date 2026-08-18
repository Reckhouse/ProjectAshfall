import { getDb } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/http";
import {
  clearSessionCookie,
  readSessionTokenFromCookieHeader,
  revokeSessionByToken,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const token = readSessionTokenFromCookieHeader(request.headers.get("cookie"));
    await revokeSessionByToken(db, token);
    const response = jsonOk({ redirectTo: "/" });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return jsonError(error, { commandType: "auth.logout" });
  }
}
