import express from "express";
import { MongoClient } from "mongodb";
import { gamesRouter } from "./games.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const mongo = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/catalogo");
await mongo.connect();
app.use("/api/games", gamesRouter(mongo.db()));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Servidor en http://localhost:${port}`);
});
