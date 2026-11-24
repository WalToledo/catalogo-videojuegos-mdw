import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import type { Db } from "mongodb";

export function createAuth(db: Db) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Configurá BETTER_AUTH_SECRET con al menos 32 caracteres en backend/.env.");
  }

  return betterAuth({
    database: mongodbAdapter(db, { transaction: false }),
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
    trustedOrigins: process.env.NODE_ENV === "production" ? [] : [
      process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    ],
    emailAndPassword: { enabled: true },
    socialProviders: {
      github: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      } : undefined,
      google: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      } : undefined,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, defaultValue: "user", input: false },
      },
    },
  });
}
