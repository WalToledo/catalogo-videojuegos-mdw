# Catálogo de videojuegos

Trabajo práctico de Desarrollo Web 2. El objetivo es crear un catálogo público de videojuegos con una ficha por juego que muestre el título, la plataforma, la fecha de lanzamiento y la cantidad máxima de jugadores.

Las personas con rol de administrador podrán agregar, editar y eliminar juegos. El proyecto usará React y TypeScript para el frontend, Express y MongoDB para la API y Better Auth para el acceso con email o GitHub.

## Probar el catálogo en local

Con Node.js 22.9 o posterior y MongoDB en ejecución:

```bash
cd backend
npm ci
cp -n .env.example .env
```

La primera vez, generá un secreto con `openssl rand -hex 32` y copiá el resultado a `BETTER_AUTH_SECRET` en `backend/.env`. Conservá ese valor entre reinicios. Desde `backend/`, iniciá el servidor:

```bash
npm run dev
```

`MONGODB_URI` incluye el nombre de la base. Por defecto se usa `catalogo` en `127.0.0.1:27017`. Con la colección vacía, `GET http://localhost:3000/api/games` devuelve `[]`.

Para cargar una ficha de ejemplo, abrí `mongosh mongodb://127.0.0.1:27017/catalogo` y ejecutá:

```js
db.games.insertOne({
  title: "Portal 2",
  platform: "PC",
  releaseDate: ISODate("2011-04-19"),
  maxPlayers: 2
})
```

Consultá `GET /api/games/:id` con el `insertedId` devuelto por MongoDB. La ficha muestra la fecha sin hora. Un ID válido que no existe devuelve `404`; uno mal formado devuelve `400`.

## Cuentas y sesiones

Better Auth guarda las cuentas y sesiones en la misma base MongoDB. Usá estas rutas desde `http://localhost:3000`; para las peticiones POST, enviá JSON con `Content-Type: application/json`.

| Método | Ruta | Datos |
|---|---|---|
| POST | `/api/auth/sign-up/email` | `name`, `email`, `password` (mínimo 8 caracteres). El servidor asigna el rol `user`. |
| POST | `/api/auth/sign-in/email` | `email`, `password`. Conservá la cookie de la respuesta. |
| GET | `/api/auth/get-session` | Enviá la cookie para consultar la sesión. Sin sesión devuelve `null`. |
| POST | `/api/auth/sign-out` | Enviá la cookie y un cuerpo `{}` para cerrar la sesión. |

Si cambiás el puerto o dominio, actualizá `BETTER_AUTH_URL` con la URL pública del backend.

## Alta de juegos

`POST /api/games` requiere la cookie de una sesión con rol `admin`. Enviá los cuatro campos como JSON:

```json
{"title":"Portal 2","platform":"PC","releaseDate":"2011-04-19","maxPlayers":2}
```

El alta devuelve `201` con la ficha y su `id`. Sin sesión devuelve `401`; con rol `user`, `403`. Si la ficha es inválida, devuelve `400`: por ejemplo, con `maxPlayers: 0` el detalle está en `errors.fieldErrors.maxPlayers`.

## Editar y eliminar juegos

Con la misma cookie de administrador, usá el `id` que devolvió el alta:

- `PATCH /api/games/:id`: enviá JSON con los campos a cambiar, por ejemplo `{"platform":"Switch"}`. Devuelve `200` con la ficha completa y conserva los demás campos. Un cuerpo vacío, un campo desconocido o un valor inválido devuelve `400`.
- `DELETE /api/games/:id`: devuelve `204` sin cuerpo. Si volvés a consultar ese juego, devuelve `404`.

Ambas rutas devuelven `401` sin sesión, `403` con rol `user`, `400` si el ID está mal formado y `404` si el juego no existe.

## Abrir el catálogo web

Con el backend en el puerto 3000, abrí otra terminal desde la raíz:

```bash
cd frontend
npm ci
npm run dev
```

Abrí la URL que indica Vite (normalmente `http://localhost:5173`). Seleccioná el título de un juego para abrir su ficha en `/juegos/:id`. El servidor de desarrollo reenvía las consultas `/api` al backend.

Desde **Crear cuenta** podés registrarte con nombre, email y contraseña. Si ya tenés cuenta, usá **Iniciar sesión**. Con la sesión activa se muestra tu email, incluso después de recargar; **Cerrar sesión** te devuelve al catálogo público. En desarrollo, si abrís Vite en otro origen, configurá `FRONTEND_ORIGIN` en `backend/.env` con esa URL exacta y reiniciá el backend.

### Iniciar sesión con GitHub en local

1. En [GitHub → Developer settings → OAuth Apps](https://github.com/settings/developers), elegí **New OAuth App**. Usá `http://localhost:5173` como **Homepage URL** y `http://localhost:3000/api/auth/callback/github` como **Authorization callback URL**.
2. En `backend/.env`, completá `GITHUB_CLIENT_ID` con el **Client ID** y `GITHUB_CLIENT_SECRET` con el secreto que generes. Reiniciá el backend. Sin esas variables el acceso por email sigue funcionando.
3. Abrí `http://localhost:5173`, elegí **Continuar con GitHub** y autorizá la app. Al volver al catálogo debería aparecer tu email y seguir visible al recargar.

Si usás otros puertos, ajustá también `FRONTEND_ORIGIN`, `BETTER_AUTH_URL` y las URLs registradas en GitHub. Usá `localhost` tanto para el frontend como para el callback para compartir la cookie de sesión.
