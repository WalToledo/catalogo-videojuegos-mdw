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
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: { type: "string", required: true, defaultValue: "user", input: false },
      },
    },
  });
}
