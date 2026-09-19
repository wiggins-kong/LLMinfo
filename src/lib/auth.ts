import "server-only";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { hash, verify } from "@node-rs/argon2";
import { env } from "./env";
import { sqlite } from "@/db";
import { ARGON2_OPTIONS, MIN_PASSWORD_LENGTH } from "./user-admin";

export const auth = betterAuth({
  appName: "LLMinfo",
  secret: env.authSecret,
  baseURL: env.appUrl,
  trustedOrigins: [env.appUrl],

  database: sqlite,

  emailAndPassword: {
    enabled: true,
    // Registration is closed: the first account is seeded on boot and later
    // accounts are added with `npm run create-user` inside the container.
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: 128,
    autoSignIn: true,
    password: {
      // Must match the hashing used by the bootstrap path and the CLI, or
      // existing credentials become unverifiable.
      hash: (password: string) => hash(password, ARGON2_OPTIONS),
      verify: ({ hash: digest, password }: { hash: string; password: string }) =>
        verify(digest, password, ARGON2_OPTIONS),
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // rolling refresh once per day
    // The cookie cache is deliberately OFF.
    //
    // better-auth validates its cached payload with a Zod schema that requires
    // `createdAt`/`updatedAt` to be Date instances, but the Kysely SQLite
    // dialect returns the raw INTEGER columns. The cache therefore always
    // failed validation and fell back to a database read anyway, emitting a
    // warning on every request. Sessions here are validated against a local
    // SQLite file, so the read is cheap and the cache buys nothing.
    cookieCache: { enabled: false },
  },

  advanced: {
    useSecureCookies: env.isProd,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProd,
      path: "/",
    },
    // SakuraFrp terminates TLS at its edge, so the app sees plain HTTP and
    // must trust the forwarded proto/host headers to build correct cookies
    // and callback URLs.
    trustedProxyHeaders: true,
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    // Persisted so counters survive restarts and are shared by every process
    // that opens the same volume.
    storage: "database",
    modelName: "rateLimit",
    fields: { key: "key", count: "count", lastRequest: "lastRequest" },
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/two-factor/verify-totp": { window: 60, max: 8 },
      "/two-factor/verify-backup-code": { window: 60, max: 5 },
    },
  },

  plugins: [twoFactor({ issuer: "LLMinfo" })],
});

export type Auth = typeof auth;
