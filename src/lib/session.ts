import "server-only";
import { headers } from "next/headers";
import { auth } from "./auth";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  twoFactorEnabled: boolean;
}

/** Resolve the current session, or null when unauthenticated. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    const user = session.user as typeof session.user & { twoFactorEnabled?: boolean };
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
