import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/game/domain/errors";
import { logEvent } from "@/lib/logging";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function jsonError(error: unknown, extras?: { actionId?: string; commandType?: string }): NextResponse {
  const mapped = publicErrorMessage(error);
  logEvent({
    event: "game.command.rejected",
    actionId: extras?.actionId,
    commandType: extras?.commandType,
    code: mapped.code,
  });
  return NextResponse.json(
    {
      ok: false,
      code: mapped.code,
      message: mapped.message,
    },
    { status: mapped.status },
  );
}
