"use client";

import Link from "next/link";
import { Share2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
  type FormEvent,
} from "react";

import { useLanguage } from "@/components/language-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
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

function normalizeRoomCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
}

function buildShareUrl(roomCode: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  return url.toString();
}

function RpsRoomContent() {
  const { t } = useLanguage();
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
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [seenRevealedRoundId, setSeenRevealedRoundId] = useState<string | null>(
    null,
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
          : t("rps.loadRoomError"),
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
      void refreshSnapshot(roomCode);
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

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (
      snapshot.currentRound.status === "revealed" &&
      snapshot.currentRound.id !== seenRevealedRoundId
    ) {
      setResultDialogOpen(true);
      setSeenRevealedRoundId(snapshot.currentRound.id);
    }

    if (snapshot.currentRound.status === "pending") {
      setResultDialogOpen(false);
    }
  }, [seenRevealedRoundId, snapshot]);

  async function handleCreateRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("rps.nicknameBeforeCreate"));
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
      setFeedback(null);

      startTransition(() => {
        router.replace(`${pathname}?room=${nextSession.roomCode}`);
      });

      await loadSnapshot(nextSession.roomCode);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("rps.createRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleJoinRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("rps.nicknameBeforeJoin"));
      return;
    }

    if (!roomCode) {
      setError(t("rps.roomCodeMissing"));
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
      setFeedback(null);
      await loadSnapshot(nextSession.roomCode);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : t("rps.joinRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitMove(choice: RpsChoice) {
    if (!session) {
      setError(t("rps.firstEnterRoom"));
      return;
    }

    setBusyAction(choice);
    setError(null);
    setFeedback(null);

    try {
      await submitMove(session, choice);
      setFeedback(null);
      await loadSnapshot(session.roomCode);
    } catch (moveError) {
      setError(
        moveError instanceof Error
          ? moveError.message
          : t("rps.sendMoveError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleNextRound() {
    if (!session) {
      setError(t("rps.firstEnterRoom"));
      return;
    }

    setBusyAction("next-round");
    setError(null);
    setFeedback(null);

    try {
      await startNextRound(session);
      setFeedback(null);
      await loadSnapshot(session.roomCode);
    } catch (roundError) {
      setError(
        roundError instanceof Error
          ? roundError.message
          : t("rps.nextRoundError"),
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
          text: t("rps.shareText"),
          title: t("common.appName"),
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
      setError(t("rps.invalidRoomCode"));
      return;
    }

    startTransition(() => {
      router.push(`${pathname}?room=${normalized}`);
    });
  }

  const alreadyPlayed =
    !!session &&
    !!snapshot?.currentRound.submittedPlayerIds.includes(session.playerId);
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
  const gameTitle = t("games.rps.title");

  function choiceLabel(choice: RpsChoice) {
    return t(`rps.choices.${choice}.label`);
  }

  return (
    <main className="min-h-screen bg-[#020202] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="glass-panel rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex rounded-full border border-white/10 px-4 py-2 text-sm text-stone-300 transition hover:border-white/20 hover:text-stone-100"
            >
              {t("common.back")}
            </Link>

            <h1 className="text-right font-[family-name:var(--font-display)] text-2xl leading-none text-stone-100 sm:text-3xl">
              {gameTitle}
            </h1>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="glass-panel rounded-[28px] p-5 sm:p-6">
            {!isSupabaseConfigured() ? (
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
                  {t("rps.pendingConfig")}
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-3xl">
                  {t("rps.connectSupabase")}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  {t("rps.missingSupabase")}
                </p>
                <div className="glass-tile rounded-[28px] p-4 text-sm text-stone-300">
                  <p>{t("rps.setupStep1")}</p>
                  <p>{t("rps.setupStep2")}</p>
                  <p>{t("rps.setupStep3")}</p>
                  <p>{t("rps.setupStep4")}</p>
                </div>
              </div>
            ) : !roomCode ? (
              <div className="space-y-8">
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  {t("rps.createRoom")}
                </h2>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("rps.yourNickname")}
                      value={nickname}
                    />
                  </label>

                  <button
                    className="rounded-2xl bg-white px-6 py-3 font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                    disabled={busyAction === "create"}
                    onClick={handleCreateRoom}
                    type="button"
                  >
                    {busyAction === "create"
                      ? t("rps.creating")
                      : t("rps.createRoom")}
                  </button>
                </div>

                <form
                  className="glass-tile space-y-4 rounded-[24px] p-4"
                  onSubmit={handleManualJoinSubmit}
                >
                  <input
                    className="glass-tile w-full rounded-2xl px-4 py-3 text-base uppercase outline-none transition focus:border-white/20"
                    maxLength={6}
                    onChange={(event) => setManualCode(event.target.value)}
                    placeholder={t("rps.roomCodePlaceholder")}
                    value={manualCode}
                  />
                  <button
                    className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                    type="submit"
                  >
                    {t("rps.join")}
                  </button>
                </form>
              </div>
            ) : !session ? (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
                    {t("common.room")} {roomCode}
                  </p>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl">
                    {t("rps.join")}
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("rps.yourNickname")}
                      value={nickname}
                    />
                  </label>

                  <button
                    className="rounded-2xl bg-white px-6 py-3 font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                    disabled={busyAction === "join"}
                    onClick={handleJoinRoom}
                    type="button"
                  >
                    {busyAction === "join"
                      ? t("rps.entering")
                      : t("rps.enterRoom")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="font-[family-name:var(--font-display)] text-2xl">
                      Ronda {snapshot?.currentRound.roundNumber ?? 1}
                    </h2>
                  </div>

                  <button
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                    onClick={handleShare}
                    type="button"
                  >
                    <Share2 className="size-4" />
                    {shareState === "shared"
                      ? t("common.shared")
                      : shareState === "copied"
                        ? t("common.copied")
                        : t("common.share")}
                  </button>
                </div>

                <div className="glass-tile space-y-4 rounded-[24px] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                      {t("rps.choose")}
                    </p>
                    <p className="text-sm text-stone-400">
                      {snapshot?.currentRound.submittedCount ?? 0}/{snapshot?.playerCount ?? 0}
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {rpsChoices.map((option) => {
                      const disabled =
                        !canPlay || alreadyPlayed || busyAction === option.choice;

                      return (
                        <button
                          key={option.choice}
                          className="glass-tile rounded-[24px] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={disabled}
                          onClick={() => handleSubmitMove(option.choice)}
                          type="button"
                        >
                          <p className="text-lg font-semibold">
                            {choiceLabel(option.choice)}
                          </p>
                          <p className="mt-1 text-sm text-stone-400">
                            {t(`rps.choices.${option.choice}.description`)}
                          </p>
                        </button>
                      );
                    })}
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

          <aside className="space-y-5">
            <section className="glass-panel rounded-[28px] p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">
                  {t("rps.players")}
                </p>
                <p className="text-sm text-stone-400">
                  {snapshot?.playerCount ?? 0}/2
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {snapshot?.players.map((player) => {
                  const isYou = player.id === session?.playerId;

                  return (
                    <div
                      key={player.id}
                      className="glass-tile rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-stone-100">
                            {player.nickname}
                          </p>
                          <p className="text-sm text-stone-400">
                            {isYou ? t("rps.yourDevice") : t("rps.guest")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-stone-300">
                            {t("rps.score")} {(player.score ?? 0).toString()}
                          </span>
                          {player.isHost ? (
                            <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-stone-300">
                              {t("common.host")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {snapshot && snapshot.playerCount < 2 ? (
                  <div className="rounded-2xl border border-dashed border-white/12 px-4 py-5 text-sm text-stone-400">
                    {t("rps.waitingSecondPlayer")}
                  </div>
                ) : null}
              </div>
            </section>
            <section className="glass-panel rounded-[28px] p-5">
              <p className="text-sm text-stone-400">
                {t("common.room")}:{" "}
                <span className="font-semibold text-stone-100">
                  {(snapshot?.roomCode ?? roomCode) || "----"}
                </span>
              </p>
            </section>
          </aside>
        </div>
      </div>

      <Dialog onOpenChange={setResultDialogOpen} open={resultDialogOpen}>
        <DialogContent>
          <div className="flex items-start justify-between gap-4">
            <DialogHeader>
              <DialogTitle>{t("rps.result")}</DialogTitle>
              <DialogDescription>
                {snapshot?.currentRound.winnerPlayerId
                  ? t("rps.resultWinner", {
                      name: snapshot.currentRound.winnerNickname ?? "",
                    })
                  : t("rps.tie")}
              </DialogDescription>
            </DialogHeader>

            <button
              aria-label={t("common.close")}
              className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 text-stone-300 transition hover:border-white/20 hover:text-stone-100"
              onClick={() => setResultDialogOpen(false)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {snapshot?.currentRound.revealedMoves.map((move) => (
              <div
                key={move.playerId}
                className="glass-tile rounded-2xl px-4 py-3"
              >
                <p className="text-sm text-stone-400">{move.nickname}</p>
                <p className="mt-1 text-lg font-semibold text-stone-50">
                  {choiceLabel(move.choice)}
                </p>
              </div>
            ))}
          </div>

          <DialogFooter>
            {canStartNewRound ? (
              <button
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                disabled={busyAction === "next-round"}
                onClick={handleNextRound}
                type="button"
              >
                {busyAction === "next-round"
                  ? t("rps.opening")
                  : t("rps.nextRound")}
              </button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function RpsRoomFallback() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-[#020202] px-4 py-8 text-stone-100">
      <div className="glass-panel mx-auto max-w-4xl rounded-[28px] p-6">
        <p className="text-sm text-stone-300">{t("common.loadingRoom")}</p>
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
