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
const noteSchema = z.strictObject({ text: z.string().trim().min(1).max(2000) });

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
  const notes = db.collection<{ _id: string; text: string }>("gameNotes");
  const myNote = router.route("/:id/my-note");
  myNote.all(authMiddleware(auth), async (req, res, next) => {
    const id = req.params.id;
    if (!validId(id)) {
      res.status(400).json({ error: "ID de juego inválido" });
      return;
    }
    const gameId = new ObjectId(id);
    if (!await games.findOne({ _id: gameId }, { projection: { _id: 1 } })) {
      res.status(404).json({ error: "Juego no encontrado" });
      return;
    }
    res.locals.noteId = `${gameId.toHexString()}:${res.locals.user.id}`;
    next();
  });
  myNote.get(async (_req, res) => {
    const note = await notes.findOne({ _id: res.locals.noteId });
    res.json({ text: note?.text ?? "" });
  });
  myNote.put(json(), async (req, res) => {
    const note = noteSchema.safeParse(req.body);
    if (!note.success) {
      res.status(400).json({ error: "La nota debe contener entre 1 y 2000 caracteres" });
      return;
    }
    await notes.updateOne({ _id: res.locals.noteId }, { $set: note.data }, { upsert: true });
    res.json(note.data);
  });

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
