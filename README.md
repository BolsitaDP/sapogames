# Sapo Games

Mini arcade hecho con Next.js para publicar en GitHub Pages y usar Supabase
como backend. La primera version incluye:

- Menu inicial de juegos.
- Piedra, papel o tijera con salas por link.
- Flujo pensado para celular: crear, compartir y jugar.
- Base preparada para agregar mas minijuegos.

## Stack

- Frontend: Next.js App Router con `output: "export"`.
- Backend: Supabase con RPC SQL y Realtime.
- Deploy: GitHub Pages por GitHub Actions.

## Desarrollo local

1. Instala dependencias:

```bash
npm install
```

2. Copia variables de entorno:

```bash
copy .env.example .env.local
```

3. Rellena:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_BASE_PATH=
```

4. Ejecuta la app:

```bash
npm run dev
```

## Backend en Supabase

1. Crea un proyecto en Supabase.
2. Abre el SQL Editor.
3. Ejecuta el archivo `supabase/schema.sql`.
4. Comprueba que Realtime quede activo para:
   - `game_rooms`
   - `room_players`
   - `rps_rounds`
   - `rps_moves`

### Que hace el backend

- `create_rps_room(host_nickname)`: crea sala, host y primera ronda.
- `join_rps_room(room_code_input, player_nickname)`: mete al segundo jugador.
- `submit_rps_move(...)`: guarda la jugada y resuelve el ganador en SQL.
- `start_next_rps_round(...)`: abre una nueva ronda cuando termina la actual.
- `get_rps_room_snapshot(room_code_input)`: devuelve el estado completo de la sala.

La logica de quien gana no vive en el frontend. Se calcula en la base de datos
para que el cliente no pueda decidir el resultado.

## Deploy en GitHub Pages

El repo incluye `.github/workflows/deploy.yml`.

Antes de hacer push:

1. Sube el proyecto a GitHub.
2. En `Settings > Pages`, selecciona `GitHub Actions`.
3. En `Settings > Secrets and variables > Actions`, crea:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

El workflow calcula `NEXT_PUBLIC_BASE_PATH` usando el nombre del repositorio,
para que los assets funcionen dentro de GitHub Pages.

## Estructura

- `src/app/page.tsx`: home con menu de juegos.
- `src/app/games/rps/page.tsx`: entrada al juego.
- `src/components/rps-room.tsx`: flujo de sala y partida.
- `src/lib/rps.ts`: cliente para RPC y tipos del juego.
- `supabase/schema.sql`: esquema inicial del backend.
