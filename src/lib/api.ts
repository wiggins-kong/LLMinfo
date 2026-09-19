import { NextResponse } from "next/server";
import { UnauthorizedError } from "./session";

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function unauthorized() {
  return jsonError("需要登录", 401);
}

export function handleRouteError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return unauthorized();
  }
  const message = error instanceof Error ? error.message : String(error);
  return jsonError(message, 500);
}
