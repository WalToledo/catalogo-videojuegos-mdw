import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler } from "express";
import type { createAuth } from "./auth.js";

export function authMiddleware(auth: ReturnType<typeof createAuth>): RequestHandler {
  return async (req, res, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      res.status(401).json({ error: "Iniciá sesión para continuar" });
      return;
    }
    res.locals.user = session.user;
    next();
  };
}

export function requireRole(role: "admin"): RequestHandler {
  return (_req, res, next) => {
    if (res.locals.user?.role !== role) {
      res.status(403).json({ error: "No tenés permiso para realizar esta acción" });
      return;
    }
    next();
  };
}
