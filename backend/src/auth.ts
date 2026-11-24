import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { defaultAc, userAc } from "better-auth/plugins/admin/access";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import type { Db } from "mongodb";

export function createAuth(db: Db) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Configurá BETTER_AUTH_SECRET con al menos 32 caracteres en backend/.env.");
  }
  const roleManagement = process.env.ENABLE_ROLE_MANAGEMENT === undefined
    ? process.env.NODE_ENV !== "production"
    : process.env.ENABLE_ROLE_MANAGEMENT === "true";

  return betterAuth({
    database: mongodbAdapter(db, { transaction: false }),
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
    trustedOrigins: process.env.NODE_ENV === "production" ? [] : [
      process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    ],
    emailAndPassword: { enabled: true },
    socialProviders: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
    } : {},
    // Consultá el rol vigente en Mongo, también con una sesión ya abierta.
    session: { cookieCache: { enabled: false } },
    plugins: [admin({
      roles: {
        admin: defaultAc.newRole({ user: roleManagement ? ["list", "set-role"] : [] }),
        user: userAc,
      },
    })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!roleManagement || ctx.path !== "/admin/set-role") return;
        const session = await getAuthoritativeSessionFromCtx(ctx);
        if (!session || !("role" in session.user) || session.user.role !== "admin") return;

        if (ctx.body?.userId === session.user.id) {
          throw APIError.from("FORBIDDEN", {
            code: "SELF_ROLE_CHANGE",
            message: "No podés cambiar tu propio rol",
          });
        }
        if (ctx.body?.role !== "admin" && ctx.body?.role !== "user") {
          throw APIError.from("BAD_REQUEST", {
            code: "INVALID_ROLE",
            message: "El rol debe ser admin o user",
          });
        }
      }),
    },
  });
}
