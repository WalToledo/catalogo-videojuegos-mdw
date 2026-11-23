import { Router } from "express";
import { ObjectId, type Db, type WithId } from "mongodb";

interface Game {
  title: string;
  platform: string;
  releaseDate: Date;
  maxPlayers: number;
}

function gameResponse(game: WithId<Game>) {
  return {
    id: game._id.toHexString(),
    title: game.title,
    platform: game.platform,
    releaseDate: game.releaseDate.toISOString().slice(0, 10),
    maxPlayers: game.maxPlayers,
  };
}

export function gamesRouter(db: Db) {
  const router = Router();
  const games = db.collection<Game>("games");

  router.get("/", async (_req, res) => {
    res.json(await games.find().map(gameResponse).toArray());
  });

  router.get("/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
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
