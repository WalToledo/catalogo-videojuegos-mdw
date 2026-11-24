# Catálogo de videojuegos

Trabajo práctico de Desarrollo Web 2. El objetivo es crear un catálogo público de videojuegos con una ficha por juego que muestre el título, la plataforma, la fecha de lanzamiento y la cantidad máxima de jugadores.

El catálogo se puede consultar sin cuenta. Quienes tienen rol `admin` también pueden agregar, editar y eliminar juegos. El frontend usa React y TypeScript; el backend, Express, MongoDB y Better Auth para el acceso con email o GitHub.

## Entrega y cuentas de prueba

- [Abrir el catálogo en Render](https://catalogo-mdw-web.onrender.com) · [Panel de administración](https://catalogo-mdw-web.onrender.com/admin)
- [Backend en Render](https://catalogo-mdw-api.onrender.com/api/health) · [Repositorio](https://github.com/WalToledo/catalogo-videojuegos-mdw)

En el catálogo, elegí **Iniciar sesión** e ingresá con email. Estas cuentas de demostración existen en producción, no en la base local:

| Perfil de prueba | Email | Contraseña |
|---|---|---|
| Usuario | `prueba.user@example.com` | `R4LmQk4BVg8PvTYzGQaG9Q` |
| Administrador | `prueba.admin@example.com` | `UQLFncyZJjTGS9-bcEYwVQ` |

**Recorrido de corrección:** abrí una ficha y recargá la página. Con el usuario común entrá a `/admin`: debe aparecer el mensaje de permisos. Cerrá sesión y repetí con el administrador: creá una ficha de prueba, cambiá solo su plataforma, recargá para comprobar el cambio y eliminá esa misma ficha.

### Rutas de la API

| Método | Ruta | Acceso | Resultado |
|---|---|---|---|
| GET | `/api/health` | Público | Estado del servicio |
| GET | `/api/games` | Público | Listado (`200`) |
| GET | `/api/games/:id` | Público | Ficha (`200`) |
| POST | `/api/games` | Admin | Alta (`201`) |
| PATCH | `/api/games/:id` | Admin | Edición parcial (`200`) |
| DELETE | `/api/games/:id` | Admin | Baja (`204`, sin cuerpo) |
| POST | `/api/auth/sign-up/email` | Público | Registro con rol `user` |
| POST | `/api/auth/sign-in/email` | Público | Inicio de sesión |
| POST | `/api/auth/sign-in/social` | Público | Inicio de OAuth con GitHub |
| GET | `/api/auth/callback/github` | Retorno de GitHub | Completa el ingreso |
| GET | `/api/auth/get-session` | Público | Sesión actual o `null` |
| POST | `/api/auth/sign-out` | Con sesión | Cierre de sesión |

## Probar el catálogo en local

Usá Node.js 24 y MongoDB en ejecución. Para empezar desde cero:

```bash
git clone https://github.com/WalToledo/catalogo-videojuegos-mdw.git
cd catalogo-videojuegos-mdw
```

Si usás Docker y todavía no tenés MongoDB local, ejecutá una vez `docker run -d --name catalogo-mongo -p 127.0.0.1:27017:27017 -v catalogo-mdw-data:/data/db mongo:8`. Si ya existe el contenedor, alcanza con `docker start catalogo-mongo`. Desde la raíz del repositorio:

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

`BETTER_AUTH_URL` es el origen público por el que se accede a Better Auth. En local usamos el backend; en Render usamos el dominio del frontend, que reenvía `/api/*` al backend.

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

### Administrar el catálogo

Con una sesión `admin`, elegí **Administrar catálogo** o abrí `http://localhost:5173/admin`. Desde ahí podés crear un juego, editar su ficha o eliminarlo. Las cuentas nuevas tienen rol `user`: pueden consultar el catálogo, pero no modificarlo.

Para probar con una cuenta administradora en tu base local, registrá una cuenta de prueba y ejecutá en `mongosh`, sobre la base del catálogo, reemplazando el email por el de esa cuenta:

```js
db.user.updateOne({ email: "prueba.admin@example.com" }, { $set: { role: "admin" } })
```

Verificá que `matchedCount` sea `1` y volvé a iniciar sesión con esa cuenta.

## Desplegar en Render (etapa 10)

El `render.yaml` de la raíz define dos servicios: `catalogo-mdw-api` (Express) y `catalogo-mdw-web` (sitio estático Vite). **Las URLs de abajo son ejemplos basados en esos nombres**. Usá los dominios asignados por Render, incluidos sus posibles sufijos.

1. **Prepará MongoDB.** En MongoDB Atlas, creá un cluster y un usuario de base con lectura/escritura en `catalogo`. Copiá la URI del driver incluyendo `/catalogo` antes del `?`. En *Network Access*, habilitá las IP de salida del Web Service, disponibles en Render → servicio → **Connect → Outbound**. El contenedor local no es accesible desde Render; sus juegos y cuentas no se copian.
2. **Publicá la rama con el Blueprint y el panel.** En Render, elegí **New → Blueprint**, conectá este repositorio y seleccioná la rama publicada que contiene `render.yaml` (normalmente `main` después del merge).
3. **Configurá las variables del backend.** `MONGODB_URI` es la URI de Atlas; `BETTER_AUTH_SECRET` lo genera Render. Poné en `BETTER_AUTH_URL` la URL HTTPS del **frontend**, sin `/api` (ejemplo: `https://catalogo-mdw-web.onrender.com`). Render asigna el puerto, no cargues el `.env` local. El cliente usa rutas relativas y no necesita secretos ni una variable para la URL de la API.
4. **Conectá GitHub OAuth.** Creá una OAuth App de producción para conservar la local. Usá la URL HTTPS del **frontend** como *Homepage URL* y esa misma URL más `/api/auth/callback/github` como *Redirect URI*. Cargá `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` en el **backend**, no en Vite. Si el dominio definitivo cambia, corregí GitHub y `BETTER_AUTH_URL` y volvé a desplegar.
5. **Verificá los dominios y los rewrites.** El primer rewrite del Static Site envía `/api/*` a `https://<backend-real>/api/*`; el segundo envía `/*` a `/index.html`. Si el dominio del backend no coincide con el de `render.yaml`, corregí `destination` con el dominio asignado, publicá el cambio y sincronizá el Blueprint. Un redirect no reemplaza el rewrite: el navegador debe seguir en el dominio del frontend.

### Prueba de aceptación en producción

- Abrí `/api/health` desde **ambos** dominios: deben devolver `{"status":"ok"}`. En el frontend, `/api/games` debe devolver JSON, no el HTML del catálogo.
- Si la base está vacía, registrá una cuenta en producción, asignale `admin` en la base de Atlas y volvé a ingresar. Creá una ficha desde `/admin`. Abrila desde el listado público y presioná **F5**: debe seguir mostrándose.
- Cerrá sesión e ingresá con **Continuar con GitHub** desde el frontend. Tras el callback, verificá que aparece tu email y que sigue visible al recargar. En **Red/Network** del navegador, las llamadas del catálogo y de sesión deben usar `/api/...` en el dominio del **frontend**.
- Si el backend no arranca, revisá los logs, el usuario de Atlas y los permisos de red. Si una ficha da 404 solo al recargar, revisá el rewrite a `/index.html`. Si GitHub rechaza el callback, compará su URI con `BETTER_AUTH_URL` + `/api/auth/callback/github`.
