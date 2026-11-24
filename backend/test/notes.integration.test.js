import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";

test("notas privadas con MongoDB y sesiones reales", { timeout: 30_000 }, async (t) => {
  const port = Number(process.env.NOTES_TEST_PORT ?? 3317);
  assert(Number.isInteger(port) && port > 0 && port <= 65535, "NOTES_TEST_PORT inválido");
  const origin = `http://127.0.0.1:${port}`;
  const dbName = `catalogo_notes_test_${randomUUID()}`;
  // No toma MONGODB_URI ni lee .env: solo puede crear y borrar esta base local de prueba.
  const uri = `mongodb://127.0.0.1:27017/${dbName}`;
  const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  const db = mongo.db();
  let child;
  let closed;
  let seeded = false;
  t.after(async () => {
    try {
      if (child) {
        child.kill();
        await closed;
      }
      if (seeded) await db.dropDatabase();
    } finally {
      await mongo.close();
    }
  });

  const game = { title: "Juego de prueba", platform: "PC", releaseDate: new Date("2011-04-19"), maxPlayers: 2 };
  await mongo.connect();
  seeded = true;
  const { insertedId: gameId } = await db.collection("games").insertOne({ ...game });
  const { insertedId: otherGameId } = await db.collection("games").insertOne({ ...game });
  child = spawn(process.execPath, [fileURLToPath(new URL("../dist/server.js", import.meta.url))], {
    env: {
      NODE_ENV: "test",
      PORT: String(port),
      MONGODB_URI: uri,
      BETTER_AUTH_URL: origin,
      FRONTEND_ORIGIN: origin,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  closed = new Promise((resolve) => child.once("close", resolve));
  let logs = "";
  child.stderr.on("data", (chunk) => { logs += chunk; });
  await new Promise((resolve, reject) => {
    const ready = setTimeout(() => reject(new Error(`El backend no inició: ${logs}`)), 7000);
    child.once("error", (error) => { clearTimeout(ready); reject(error); });
    child.once("close", (code) => {
      clearTimeout(ready);
      reject(new Error(`El backend salió (${code}): ${logs.trim()}`));
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes(`Servidor en http://localhost:${port}`)) {
        clearTimeout(ready);
        resolve();
      }
    });
  });

  async function request(path, { status = 200, method = "GET", cookie, body } = {}) {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: {
        Origin: origin,
        ...(cookie && { Cookie: cookie }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== status) {
      assert.equal(response.status, status, `${method} ${path}: ${await response.text()}`);
    }
    return { response, data: await response.json() };
  }

  async function registerAndLogin(name) {
    const email = `${name}@example.test`;
    const password = randomBytes(16).toString("hex");
    await request("/auth/sign-up/email", { method: "POST", body: { name, email, password } });
    const { response } = await request("/auth/sign-in/email", { method: "POST", body: { email, password } });
    const cookie = response.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
    assert(cookie, `No se recibió cookie para ${name}`);
    const { data } = await request("/auth/get-session", { cookie });
    assert.equal(data.user.email, email);
    assert.equal(data.user.role, "user");
    return { cookie, id: data.user.id };
  }

  const notePath = `/games/${gameId}/my-note`;
  const get = async (cookie, path = notePath) => (await request(path, { cookie })).data;
  const put = (cookie, body, status = 200) => request(notePath, { cookie, method: "PUT", body, status });
  await t.test("requiere sesión para leer y guardar", async () => {
    await request(notePath, { status: 401 });
    await put(undefined, { text: "No guardar" }, 401);
  });

  const a = await registerAndLogin("ana");
  const b = await registerAndLogin("bruno");
  assert.notEqual(a.cookie, b.cookie);
  assert.notEqual(a.id, b.id);

  await t.test("crea y edita una nota por usuario y juego", async () => {
    assert.deepEqual(await get(a.cookie), { text: "" });
    assert.deepEqual((await put(a.cookie, { text: "  Nota de Ana  " })).data, { text: "Nota de Ana" });
    assert.deepEqual(await get(b.cookie), { text: "" });
    await put(b.cookie, { text: "Nota de Bruno" });
    await put(a.cookie, { text: "Nota editada por Ana" });
    assert.deepEqual(await get(a.cookie), { text: "Nota editada por Ana" });
    assert.deepEqual(await get(b.cookie), { text: "Nota de Bruno" });
    assert.deepEqual(await get(a.cookie, `/games/${otherGameId}/my-note`), { text: "" });
    assert.equal(await db.collection("gameNotes").countDocuments(), 2);
  });

  await t.test("valida el cuerpo y no acepta elegir la identidad", async () => {
    for (const body of [{}, { text: "" }, { text: "   " }, { text: 12 }, { text: "a".repeat(2001) },
      { text: "Cambio ajeno", userId: a.id }]) {
      await put(b.cookie, body, 400);
    }
    assert.deepEqual(await get(a.cookie), { text: "Nota editada por Ana" });
    assert.deepEqual(await get(b.cookie), { text: "Nota de Bruno" });
    const limit = "a".repeat(2000);
    assert.deepEqual((await put(b.cookie, { text: limit })).data, { text: limit });
    await request("/games/id-invalido/my-note", { cookie: a.cookie, status: 400 });
    await request(`/games/${new ObjectId()}/my-note`, { method: "PUT", cookie: a.cookie, status: 404, body: { text: "Nota" } });
    assert.equal(await db.collection("gameNotes").countDocuments(), 2);
  });

  await t.test("la ficha y el listado públicos no incluyen notas; salir invalida el acceso", async () => {
    const expected = { ...game, id: gameId.toString(), releaseDate: "2011-04-19" };
    assert.deepEqual((await request(`/games/${gameId}`)).data, expected);
    const { data } = await request("/games");
    assert.deepEqual(data.find(({ id }) => id === expected.id), expected);
    const { response } = await request(notePath, { cookie: a.cookie });
    assert.equal(response.headers.get("cache-control"), "no-store");
    await request("/auth/sign-out", { method: "POST", cookie: a.cookie, body: {} });
    await request(notePath, { cookie: a.cookie, status: 401 });
  });
});
