import { json, Router } from "express";
import { ObjectId, type Db, type WithId } from "mongodb";
import { z } from "zod";
import type { createAuth } from "./auth.js";
import { authMiddleware, requireRole } from "./permissions.js";

const gameSchema = z.strictObject({
  title: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  releaseDate: z.iso.date().transform((date) => new Date(date)),
  maxPlayers: z.number().int().min(1),
});
type Game = z.output<typeof gameSchema>;
const gameChanges = gameSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "Enviá al menos un campo para editar",
});

function gameResponse(game: WithId<Game>) {
  return {
    id: game._id.toHexString(),
    title: game.title,
    platform: game.platform,
    releaseDate: game.releaseDate.toISOString().slice(0, 10),
    maxPlayers: game.maxPlayers,
  };
}

function validId(id: unknown): id is string {
  return typeof id === "string" && ObjectId.isValid(id);
}

export function gamesRouter(db: Db, auth: ReturnType<typeof createAuth>) {
  const router = Router();
  const games = db.collection<Game>("games");

  const adminOnly = [authMiddleware(auth), requireRole("admin")] as const;
  router.post("/", ...adminOnly, json(), async (req, res) => {
    const result = gameSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ errors: z.flattenError(result.error) });
      return;
    }
    const { insertedId } = await games.insertOne(result.data);
    res.status(201).json(gameResponse({ ...result.data, _id: insertedId }));
  });

  router.get("/", async (_req, res) => {
    res.json(await games.find().map(gameResponse).toArray());
  });

  router.patch("/:id", ...adminOnly, json(), async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ error: "ID de juego inválido" });
      return;
    }
    const changes = gameChanges.safeParse(req.body);
    if (!changes.success) {
      res.status(400).json({ errors: z.flattenError(changes.error) });
      return;
    }
    const game = await games.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: changes.data },
      { returnDocument: "after" },
    );
    if (!game) {
      res.status(404).json({ error: "Juego no encontrado" });
      return;
    }
    res.json(gameResponse(game));
  });

  router.delete("/:id", ...adminOnly, async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ error: "ID de juego inválido" });
      return;
    }
    const result = await games.deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) {
      res.status(404).json({ error: "Juego no encontrado" });
      return;
    }
    res.status(204).end();
  });

  router.get("/:id", async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ error: "ID de juego inválido" });
      return;
    }
    const game = await games.findOne({ _id: new ObjectId(req.params.id) });
    if (!game) {
      res.status(404).json({ error: "Juego no encontrado" });
      return;
    }
    res.json(gameResponse(game));
  });

  return router;
}
