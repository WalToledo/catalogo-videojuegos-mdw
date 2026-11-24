import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { after, before, test } from "node:test";
import { MongoClient } from "mongodb";
import { createAuth } from "../src/auth.js";

const api = "http://localhost:3000/api/auth";
const frontend = "http://localhost:5173";
const mongo = new MongoClient("mongodb://127.0.0.1:27017", { serverSelectionTimeoutMS: 3000 });
const db = mongo.db(`catalogo_oauth_test_${randomUUID()}`);

before(() => mongo.connect());
after(async () => {
  try {
    await db.dropDatabase();
  } finally {
    await mongo.close();
  }
});

const providers = {
  google: {
    authorization: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
  },
  github: {
    authorization: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
  },
} as const;
type Provider = keyof typeof providers;

function authWith(enabled: Provider[]) {
  process.env.NODE_ENV = "test";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.FRONTEND_ORIGIN = frontend;
  process.env.BETTER_AUTH_SECRET = randomUUID();
  for (const provider of Object.keys(providers) as Provider[]) {
    const key = provider.toUpperCase();
    process.env[`${key}_CLIENT_ID`] = `fake-${provider}-client-id`;
    if (enabled.includes(provider)) {
      process.env[`${key}_CLIENT_SECRET`] = `fake-${provider}-secret`;
    } else {
      delete process.env[`${key}_CLIENT_SECRET`];
    }
  }
  return createAuth(db);
}

function signIn(provider: Provider) {
  return new Request(`${api}/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: frontend },
    body: JSON.stringify({
      provider,
      callbackURL: frontend,
      errorCallbackURL: `${frontend}/?social-error=1`,
    }),
  });
}

function cookies(response: Response) {
  const headers = response.headers.getSetCookie();
  assert.ok(headers.length > 0);
  return headers.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

test("un proveedor con configuración incompleta no deshabilita al otro ni al registro por email", async () => {
  for (const provider of ["google", "github"] as const) {
    const auth = authWith([provider]);
    const otherProvider = provider === "google" ? "github" : "google";
    const unconfigured = await auth.handler(signIn(otherProvider));
    assert.equal(unconfigured.status, 404);
    const configured = await auth.handler(signIn(provider));
    assert.equal(configured.status, 200);
  }

  const auth = authWith([]);
  const response = await auth.handler(new Request(`${api}/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: frontend },
    body: JSON.stringify({ name: "Email Test", email: "local@example.test", password: "local-only-test" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.role, "user");
});

test("google: cancelar el consentimiento vuelve al catálogo sin crear sesión", async (t) => {
  const auth = authWith(["google"]);
  const signInResponse = await auth.handler(signIn("google"));
  assert.equal(signInResponse.status, 200);
  const { url } = await signInResponse.json();
  const state = new URL(url).searchParams.get("state");
  assert.ok(state);
  const providerFetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Cancelar el consentimiento no debería contactar a Google");
  });
  const params = new URLSearchParams({ state, error: "access_denied" });
  const callback = await auth.handler(new Request(`${api}/callback/google?${params}`, {
    headers: { cookie: cookies(signInResponse) },
  }));
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), `${frontend}/?social-error=1&error=access_denied`);
  assert.equal(providerFetch.mock.callCount(), 0);
  const session = await auth.handler(new Request(`${api}/get-session`, {
    headers: { cookie: cookies(callback) },
  }));
  assert.equal(await session.json(), null);
});

for (const provider of ["google", "github"] as const) {
  test(`${provider}: redirección OAuth, callback simulado y sesión persistida`, async (t) => {
    const auth = authWith(["google", "github"]);
    const email = `${provider}@example.test`;
    const redirectURI = `${api}/callback/${provider}`;
    const authResponse = await auth.handler(signIn(provider));
    assert.equal(authResponse.status, 200);
    const { url, redirect } = await authResponse.json();
    assert.equal(redirect, true);

    const authorization = new URL(url);
    const state = authorization.searchParams.get("state");
    assert.equal(authorization.origin + authorization.pathname, providers[provider].authorization);
    assert.equal(authorization.searchParams.get("client_id"), `fake-${provider}-client-id`);
    assert.equal(authorization.searchParams.get("redirect_uri"), redirectURI);
    assert.ok(state);
    if (provider === "google") {
      assert.match(authorization.searchParams.get("scope") ?? "", /\bopenid\b/);
      assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
    }

    // Solo se simula la red del proveedor: Better Auth y la base son reales.
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "oauth-test-key", alg: "RS256" };
    const exchange = t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url === providers[provider].token) {
        assert.equal(request.method, "POST");
        const body = new URLSearchParams(await request.text());
        assert.equal(body.get("code"), "simulated-code");
        assert.equal(body.get("redirect_uri"), redirectURI);
        if (provider === "github") return Response.json({ access_token: "fake-token", token_type: "bearer" });

        const verifier = body.get("code_verifier");
        assert.ok(verifier);
        assert.equal(
          createHash("sha256").update(verifier).digest("base64url"),
          authorization.searchParams.get("code_challenge"),
        );
        const now = Math.floor(Date.now() / 1000);
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
        const unsigned = `${encode({ alg: jwk.alg, kid: jwk.kid })}.${encode({
          sub: "fake-google-subject",
          iss: "https://accounts.google.com",
          aud: "fake-google-client-id",
          nonce: authorization.searchParams.get("nonce") ?? undefined,
          iat: now,
          exp: now + 300,
          email,
          email_verified: true,
          name: "Google Test",
        })}`;
        const idToken = `${unsigned}.${sign("sha256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
        return Response.json({ access_token: "fake-token", token_type: "Bearer", id_token: idToken });
      }
      if (provider === "google" && request.url === "https://www.googleapis.com/oauth2/v3/certs") {
        return Response.json({ keys: [jwk] });
      }
      if (provider === "github" && request.url === "https://api.github.com/user") {
        return Response.json({ id: 123, login: "github-test", email: null });
      }
      if (provider === "github" && request.url === "https://api.github.com/user/emails") {
        return Response.json([{ email, primary: true, verified: true }]);
      }
      throw new Error(`Solicitud no prevista: ${request.method} ${request.url}`);
    });

    const params = new URLSearchParams({ state, code: "simulated-code" });
    const callback = await auth.handler(new Request(`${redirectURI}?${params}`, {
      headers: { cookie: cookies(authResponse) },
    }));
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), frontend);
    assert.ok(exchange.mock.callCount() >= 1);
    const session = await auth.handler(new Request(`${api}/get-session`, {
      headers: { cookie: cookies(callback) },
    }));
    assert.equal(session.status, 200);
    const data = await session.json();
    assert.equal(data.user.email, email);
    assert.equal(data.user.role, "user");
    assert.equal(data.session.userId, data.user.id);
  });
}
