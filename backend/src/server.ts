import express from "express";
import { toNodeHandler } from "better-auth/node";
import { createAuth } from "./auth.js";
import { MongoClient } from "mongodb";
import { gamesRouter } from "./games.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV === "production" && (!process.env.MONGODB_URI || !process.env.BETTER_AUTH_URL)) {
  throw new Error("En producción configurá MONGODB_URI y BETTER_AUTH_URL.");
}
const mongo = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/catalogo");
const auth = createAuth(mongo.db());
await mongo.connect();
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.all("/api/auth/{*path}", toNodeHandler(auth));
app.use("/api/games", gamesRouter(mongo.db(), auth));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Servidor en http://localhost:${port}`);
});
