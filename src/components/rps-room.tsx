"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
  type FormEvent,
} from "react";

import { gameCards } from "@/lib/games";
import {
  choiceLabel,
  createRoom,
  getRoomSnapshot,
  getSavedNickname,
  joinRoom,
  loadRoomSession,
  rpsChoices,
  saveNickname,
  saveRoomSession,
  startNextRound,
  submitMove,
  type RoomSession,
  type RpsChoice,
  type RpsSnapshot,
} from "@/lib/rps";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

const liveGame = gameCards.find((game) => game.slug === "rps");

function normalizeRoomCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
}

function buildShareUrl(roomCode: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  return url.toString();
}

function statusCopy(snapshot: RpsSnapshot | null, session: RoomSession | null) {
  if (!snapshot) {
    return "Prepara una sala para arrancar.";
  }

  if (snapshot.playerCount < 2) {
    return "Comparte el link. En cuanto entre tu amigo, la ronda queda lista.";
  }

  if (!session) {
    return "Entra a la sala con tu apodo para jugar.";
  }

  const round = snapshot.currentRound;
  const alreadyPlayed = round.submittedPlayerIds.includes(session.playerId);

  if (round.status === "pending" && !alreadyPlayed) {
    return "Elige rapido. La jugada se revela cuando ambos hayan enviado la suya.";
  }

  if (round.status === "pending" && alreadyPlayed) {
    return "Tu jugada ya esta enviada. Falta que responda el otro jugador.";
  }

  if (!round.winnerPlayerId) {
    return "Empate. Pueden abrir otra ronda cuando quieran.";
  }

  if (round.winnerPlayerId === session.playerId) {
    return "Ganaste la ronda.";
  }

  return `${round.winnerNickname ?? "Tu rival"} gano la ronda.`;
}

function RpsRoomContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room") ?? "");

  const [nickname, setNickname] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [session, setSession] = useState<RoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<RpsSnapshot | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">(
    "idle",
  );

  async function loadSnapshot(code: string) {
    try {
      const data = await getRoomSnapshot(code);
      setSnapshot(data);
      setError(null);
    } catch (snapshotError) {
      setSnapshot(null);
      setError(
        snapshotError instanceof Error
          ? snapshotError.message
          : "No se pudo cargar la sala.",
      );
    }
  }

  useEffect(() => {
    setNickname((current) => current || getSavedNickname());
  }, []);

  useEffect(() => {
    if (!roomCode) {
      setSession(null);
      setSnapshot(null);
      return;
    }

    setSession(loadRoomSession(roomCode));
  }, [roomCode]);

  const refreshSnapshot = useEffectEvent((code: string) => {
    void loadSnapshot(code);
  });

  useEffect(() => {
    if (!roomCode || !isSupabaseConfigured()) {
      return;
    }

    void refreshSnapshot(roomCode);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !isSupabaseConfigured()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadSnapshot(roomCode);
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [roomCode]);

  useEffect(() => {
    if (!snapshot?.roomId) {
      return;
    }

    const client = getSupabaseBrowserClient();

    if (!client) {
      return;
    }

    const syncRoom = () => {
      void refreshSnapshot(roomCode);
    };

    const channel = client
      .channel(`rps-room-${snapshot.roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `id=eq.${snapshot.roomId}`,
          schema: "public",
          table: "game_rooms",
        },
        syncRoom,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `room_id=eq.${snapshot.roomId}`,
          schema: "public",
          table: "room_players",
        },
        syncRoom,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `room_id=eq.${snapshot.roomId}`,
          schema: "public",
          table: "rps_rounds",
        },
        syncRoom,
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [roomCode, snapshot?.roomId]);

  async function handleCreateRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError("Pon tu apodo antes de crear la sala.");
      return;
    }

    setBusyAction("create");
    setError(null);
    setFeedback(null);

    try {
      const nextSession = await createRoom(trimmedName);
      saveNickname(trimmedName);
      saveRoomSession(nextSession);
      setSession(nextSession);
      setShareState("idle");
      setFeedback("Sala creada. Comparte el link y espera al segundo jugador.");

      startTransition(() => {
        router.replace(`${pathname}?room=${nextSession.roomCode}`);
      });

      await loadSnapshot(nextSession.roomCode);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No se pudo crear la sala.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleJoinRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError("Pon tu apodo para entrar.");
      return;
    }

    if (!roomCode) {
      setError("Falta el codigo de la sala.");
      return;
    }

    setBusyAction("join");
    setError(null);
    setFeedback(null);

    try {
      const nextSession = await joinRoom(roomCode, trimmedName);
      saveNickname(trimmedName);
      saveRoomSession(nextSession);
      setSession(nextSession);
      setFeedback("Entraste a la sala. Ya puedes jugar.");
      await loadSnapshot(nextSession.roomCode);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "No se pudo entrar a la sala.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitMove(choice: RpsChoice) {
    if (!session) {
      setError("Primero entra a la sala.");
      return;
    }

    setBusyAction(choice);
    setError(null);
    setFeedback(null);

    try {
      await submitMove(session, choice);
      setFeedback(`Tu jugada fue ${choiceLabel(choice)}.`);
      await loadSnapshot(session.roomCode);
    } catch (moveError) {
      setError(
        moveError instanceof Error
          ? moveError.message
          : "No se pudo enviar la jugada.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleNextRound() {
    if (!session) {
      setError("Primero entra a la sala.");
      return;
    }

    setBusyAction("next-round");
    setError(null);
    setFeedback(null);

    try {
      await startNextRound(session);
      setFeedback("Nueva ronda lista.");
      await loadSnapshot(session.roomCode);
    } catch (roundError) {
      setError(
        roundError instanceof Error
          ? roundError.message
          : "No se pudo abrir la siguiente ronda.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleShare() {
    if (!roomCode) {
      return;
    }

    const url = buildShareUrl(roomCode);

    if (navigator.share) {
      try {
        await navigator.share({
          text: "Entra a la sala y juguemos piedra, papel o tijera.",
          title: "Sapo Games",
          url,
        });
        setShareState("shared");
        return;
      } catch {
        setShareState("idle");
      }
    }

    await navigator.clipboard.writeText(url);
    setShareState("copied");
  }

  function handleManualJoinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeRoomCode(manualCode);

    if (!normalized) {
      setError("Escribe un codigo valido.");
      return;
    }

    startTransition(() => {
      router.push(`${pathname}?room=${normalized}`);
    });
  }

  const alreadyPlayed =
    !!session &&
    !!snapshot?.currentRound.submittedPlayerIds.includes(session.playerId);
  const liveStatus = statusCopy(snapshot, session);
  const canPlay =
    !!session &&
    !!snapshot &&
    snapshot.playerCount === 2 &&
    snapshot.currentRound.status === "pending";
  const canStartNewRound =
    !!session &&
    !!snapshot &&
    snapshot.playerCount === 2 &&
    snapshot.currentRound.status === "revealed";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(184,255,106,0.16),_transparent_35%),linear-gradient(180deg,_#04110d_0%,_#071d17_55%,_#03100c_100%)] px-4 py-6 text-stone-50 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[32px] border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <Link
                href="/"
                className="inline-flex rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.24em] text-lime-200/80 transition hover:border-lime-300 hover:text-lime-100"
              >
                Volver al menu
              </Link>
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-orange-200/80">
                  {liveGame?.eyebrow}
                </p>
                <h1 className="max-w-xl font-[family-name:var(--font-display)] text-4xl leading-none sm:text-5xl">
                  {liveGame?.title}
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  Crea una sala desde tu celular, comparte el link y jueguen sin
                  registro. La base ya queda preparada para sumar mas minijuegos
                  despues.
                </p>
              </div>
            </div>

            <div className="grid gap-3 rounded-[28px] border border-white/10 bg-black/20 p-4 text-sm text-stone-200 sm:grid-cols-3 sm:text-base">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-lime-200/70">
                  Flujo
                </p>
                <p className="mt-2">Crear, compartir, entrar y jugar.</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-lime-200/70">
                  Backend
                </p>
                <p className="mt-2">Supabase con realtime y RPC.</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-lime-200/70">
                  Deploy
                </p>
                <p className="mt-2">Export estatico para GitHub Pages.</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <section className="rounded-[32px] border border-white/10 bg-[#081812]/90 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.3)] sm:p-7">
            {!isSupabaseConfigured() ? (
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.3em] text-orange-200/80">
                  Configuracion pendiente
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-3xl">
                  Conecta Supabase para habilitar las salas.
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  Falta definir NEXT_PUBLIC_SUPABASE_URL y
                  NEXT_PUBLIC_SUPABASE_ANON_KEY. El proyecto ya incluye el SQL y
                  el workflow para Pages.
                </p>
                <div className="rounded-[28px] border border-white/10 bg-black/20 p-4 text-sm text-stone-300">
                  <p>1. Crea el proyecto en Supabase.</p>
                  <p>2. Ejecuta supabase/schema.sql.</p>
                  <p>3. Copia .env.example a .env.local y rellena las claves.</p>
                  <p>4. Lanza npm run dev.</p>
                </div>
              </div>
            ) : !roomCode ? (
              <div className="space-y-8">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-lime-200/80">
                    Crear una sala
                  </p>
                  <h2 className="font-[family-name:var(--font-display)] text-3xl">
                    Arranca una partida en menos de un minuto.
                  </h2>
                  <p className="max-w-xl text-sm leading-7 text-stone-300 sm:text-base">
                    Este enlace sera el punto de entrada para ti y tu amigo. La
                    idea es que desde el home puedas ir agregando mas juegos sin
                    cambiar el flujo de compartir sala.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.24em] text-stone-400">
                      Tu apodo
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base outline-none transition focus:border-lime-300"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder="Santi, Ana, Tavo..."
                      value={nickname}
                    />
                  </label>

                  <button
                    className="rounded-2xl bg-lime-300 px-6 py-3 font-semibold text-[#062417] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-lime-300/50"
                    disabled={busyAction === "create"}
                    onClick={handleCreateRoom}
                    type="button"
                  >
                    {busyAction === "create" ? "Creando..." : "Crear sala"}
                  </button>
                </div>

                <form
                  className="space-y-4 rounded-[28px] border border-white/10 bg-black/20 p-4"
                  onSubmit={handleManualJoinSubmit}
                >
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.24em] text-orange-200/70">
                      Entrar por codigo
                    </p>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base uppercase outline-none transition focus:border-orange-300"
                      maxLength={6}
                      onChange={(event) => setManualCode(event.target.value)}
                      placeholder="AB12CD"
                      value={manualCode}
                    />
                  </div>
                  <button
                    className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-orange-300 hover:text-orange-100"
                    type="submit"
                  >
                    Ir a la sala
                  </button>
                </form>
              </div>
            ) : !session ? (
              <div className="space-y-8">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-lime-200/80">
                    Sala {roomCode}
                  </p>
                  <h2 className="font-[family-name:var(--font-display)] text-3xl">
                    Entra directo y juega.
                  </h2>
                  <p className="max-w-xl text-sm leading-7 text-stone-300 sm:text-base">
                    El link ya apunta a la sala. Solo falta tu apodo para unir el
                    segundo jugador o reingresar desde este dispositivo.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.24em] text-stone-400">
                      Tu apodo
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base outline-none transition focus:border-lime-300"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder="Tu nombre para la partida"
                      value={nickname}
                    />
                  </label>

                  <button
                    className="rounded-2xl bg-lime-300 px-6 py-3 font-semibold text-[#062417] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-lime-300/50"
                    disabled={busyAction === "join"}
                    onClick={handleJoinRoom}
                    type="button"
                  >
                    {busyAction === "join" ? "Entrando..." : "Entrar a la sala"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-lime-200/80">
                      Sala {snapshot?.roomCode ?? roomCode}
                    </p>
                    <h2 className="font-[family-name:var(--font-display)] text-3xl">
                      Ronda {snapshot?.currentRound.roundNumber ?? 1}
                    </h2>
                    <p className="max-w-xl text-sm leading-7 text-stone-300 sm:text-base">
                      {liveStatus}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#072117] transition hover:bg-stone-200"
                      onClick={handleShare}
                      type="button"
                    >
                      {shareState === "shared"
                        ? "Compartido"
                        : shareState === "copied"
                          ? "Link copiado"
                          : "Compartir link"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.95fr,1.05fr]">
                  <div className="space-y-4 rounded-[28px] border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                        Jugadores
                      </p>
                      <p className="text-sm text-stone-300">
                        {snapshot?.playerCount ?? 0}/2
                      </p>
                    </div>

                    <div className="space-y-3">
                      {snapshot?.players.map((player) => {
                        const isYou = player.id === session.playerId;
                        return (
                          <div
                            key={player.id}
                            className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-stone-100">
                                  {player.nickname}
                                </p>
                                <p className="text-sm text-stone-400">
                                  {isYou ? "Tu dispositivo" : "Invitado"}
                                </p>
                              </div>
                              {player.isHost ? (
                                <span className="rounded-full border border-lime-200/20 bg-lime-300/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-lime-100">
                                  Host
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}

                      {snapshot && snapshot.playerCount < 2 ? (
                        <div className="rounded-2xl border border-dashed border-white/12 px-4 py-5 text-sm text-stone-400">
                          Esperando al segundo jugador.
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                        Tablero
                      </p>
                      <p className="text-sm text-stone-300">
                        {alreadyPlayed ? "Jugada enviada" : "Listo para elegir"}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      {rpsChoices.map((option) => {
                        const disabled =
                          !canPlay || alreadyPlayed || busyAction === option.choice;

                        return (
                          <button
                            key={option.choice}
                            className="rounded-[28px] border border-white/10 bg-black/20 p-4 text-left transition hover:border-lime-300/60 hover:bg-lime-300/10 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={disabled}
                            onClick={() => handleSubmitMove(option.choice)}
                            type="button"
                          >
                            <p className="text-lg font-semibold">{option.label}</p>
                            <p className="mt-1 text-sm text-stone-400">
                              {option.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    {snapshot?.currentRound.status === "revealed" ? (
                      <div className="space-y-3 rounded-[28px] border border-orange-200/15 bg-orange-300/10 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-orange-100/70">
                              Resultado
                            </p>
                            <p className="mt-2 text-lg font-semibold text-orange-50">
                              {snapshot.currentRound.winnerPlayerId
                                ? `${snapshot.currentRound.winnerNickname} gano la ronda`
                                : "Empate"}
                            </p>
                          </div>

                          {canStartNewRound ? (
                            <button
                              className="rounded-2xl border border-orange-200/25 bg-black/20 px-4 py-3 text-sm font-semibold text-orange-50 transition hover:border-orange-200/60"
                              disabled={busyAction === "next-round"}
                              onClick={handleNextRound}
                              type="button"
                            >
                              {busyAction === "next-round"
                                ? "Abriendo..."
                                : "Siguiente ronda"}
                            </button>
                          ) : null}
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          {snapshot.currentRound.revealedMoves.map((move) => (
                            <div
                              key={move.playerId}
                              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                            >
                              <p className="text-sm text-stone-400">
                                {move.nickname}
                              </p>
                              <p className="mt-1 text-lg font-semibold text-stone-50">
                                {choiceLabel(move.choice)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {snapshot?.currentRound.status === "pending" ? (
                      <div className="rounded-[28px] border border-white/10 bg-black/20 p-4 text-sm text-stone-300">
                        <p>
                          Jugadas enviadas: {snapshot.currentRound.submittedCount}/
                          {snapshot.playerCount}
                        </p>
                        <p className="mt-2 text-stone-400">
                          Las elecciones se mantienen ocultas hasta que ambos
                          envien la suya.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {feedback ? (
              <div className="mt-6 rounded-2xl border border-lime-200/15 bg-lime-300/10 px-4 py-3 text-sm text-lime-100">
                {feedback}
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}
          </section>

          <aside className="space-y-6">
            <section className="rounded-[32px] border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-lime-200/70">
                Como va a crecer
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl">
                Menu unico, backend compartido.
              </h2>
              <div className="mt-5 space-y-3 text-sm leading-7 text-stone-300">
                <p>Las salas son genericas y guardan el slug del juego.</p>
                <p>El realtime ya esta preparado para que luego metas otros modos.</p>
                <p>El link compartido sigue el mismo patron para futuros juegos.</p>
              </div>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-[#0b1d16] p-5 sm:p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-orange-200/70">
                Siguientes juegos
              </p>
              <div className="mt-4 space-y-3">
                {gameCards
                  .filter((game) => game.slug !== "rps")
                  .map((game) => (
                    <div
                      key={game.slug}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                    >
                      <p className="text-sm uppercase tracking-[0.2em] text-stone-400">
                        {game.eyebrow}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-50">
                        {game.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-300">
                        {game.description}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function RpsRoomFallback() {
  return (
    <main className="min-h-screen bg-[#06130f] px-4 py-8 text-stone-50">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-stone-300">Cargando sala...</p>
      </div>
    </main>
  );
}

export function RpsRoom() {
  return (
    <Suspense fallback={<RpsRoomFallback />}>
      <RpsRoomContent />
    </Suspense>
  );
}
