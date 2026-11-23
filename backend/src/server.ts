import express from "express";
import { toNodeHandler } from "better-auth/node";
import { createAuth } from "./auth.js";
import { MongoClient } from "mongodb";
import { gamesRouter } from "./games.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const mongo = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/catalogo");
const auth = createAuth(mongo.db());
await mongo.connect();
app.all("/api/auth/{*path}", toNodeHandler(auth));
app.use("/api/games", gamesRouter(mongo.db()));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Servidor en http://localhost:${port}`);
});
