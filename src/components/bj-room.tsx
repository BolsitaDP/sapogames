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
  createBjRoom,
  getBjRoomSnapshot,
  joinBjRoom,
  loadBjRoomSession,
  saveBjRoomSession,
  startNextBjRound,
  submitBjAction,
  type BjCurrentRound,
  type BjHand,
  type BjRoomSession,
  type BjSnapshot,
} from "@/lib/bj";
import { getSavedNickname, saveNickname } from "@/lib/rps";
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

function cardLabel(card: string) {
  if (card === "??") {
    return "??";
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);

  return `${rank}${suit}`;
}

function resultSummary(round: BjCurrentRound | null) {
  if (!round) {
    return "";
  }

  const totalPlayers = round.playerHands.length;
  const wins = round.playerHands.filter((hand) => hand.outcome === "win").length;

  return `${wins}/${totalPlayers}`;
}

function HandCards({ cards }: { cards: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {cards.map((card, index) => (
        <div
          key={`${card}-${index}`}
          className="glass-tile flex h-14 min-w-12 items-center justify-center rounded-2xl px-3 text-sm font-semibold text-stone-100"
        >
          {cardLabel(card)}
        </div>
      ))}
    </div>
  );
}

function BjRoomContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room") ?? "");

  const [nickname, setNickname] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [session, setSession] = useState<BjRoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<BjSnapshot | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
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
      const data = await getBjRoomSnapshot(code);
      setSnapshot(data);
      setError(null);
    } catch (snapshotError) {
      setSnapshot(null);
      setError(
        snapshotError instanceof Error
          ? snapshotError.message
          : t("bj.loadRoomError"),
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

    setSession(loadBjRoomSession(roomCode));
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
      .channel(`bj-room-${snapshot.roomId}`)
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
          table: "bj_rounds",
        },
        syncRoom,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `room_id=eq.${snapshot.roomId}`,
          schema: "public",
          table: "bj_player_hands",
        },
        syncRoom,
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [roomCode, snapshot?.roomId]);

  useEffect(() => {
    const currentRound = snapshot?.currentRound;

    if (!currentRound) {
      return;
    }

    if (
      currentRound.status === "revealed" &&
      currentRound.id !== seenRevealedRoundId
    ) {
      setResultDialogOpen(true);
      setSeenRevealedRoundId(currentRound.id);
    }

    if (currentRound.status !== "revealed") {
      setResultDialogOpen(false);
    }
  }, [seenRevealedRoundId, snapshot]);

  async function handleCreateRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("bj.nicknameBeforeCreate"));
      return;
    }

    setBusyAction("create");
    setError(null);

    try {
      const nextSession = await createBjRoom(trimmedName);
      saveNickname(trimmedName);
      saveBjRoomSession(nextSession);
      setSession(nextSession);
      setShareState("idle");

      startTransition(() => {
        router.replace(`${pathname}?room=${nextSession.roomCode}`);
      });

      await loadSnapshot(nextSession.roomCode);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("bj.createRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleJoinRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("bj.nicknameBeforeJoin"));
      return;
    }

    if (!roomCode) {
      setError(t("bj.roomCodeMissing"));
      return;
    }

    setBusyAction("join");
    setError(null);

    try {
      const nextSession = await joinBjRoom(roomCode, trimmedName);
      saveNickname(trimmedName);
      saveBjRoomSession(nextSession);
      setSession(nextSession);
      await loadSnapshot(nextSession.roomCode);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : t("bj.joinRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAction(action: "hit" | "stand") {
    if (!session) {
      setError(t("bj.firstEnterRoom"));
      return;
    }

    setBusyAction(action);
    setError(null);

    try {
      await submitBjAction(session, action);
      await loadSnapshot(session.roomCode);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("bj.actionError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartRound() {
    if (!session) {
      setError(t("bj.firstEnterRoom"));
      return;
    }

    setBusyAction("next-round");
    setError(null);

    try {
      await startNextBjRound(session);
      await loadSnapshot(session.roomCode);
    } catch (roundError) {
      setError(
        roundError instanceof Error
          ? roundError.message
          : t("bj.nextRoundError"),
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
          text: t("bj.shareText"),
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
      setError(t("bj.invalidRoomCode"));
      return;
    }

    startTransition(() => {
      router.push(`${pathname}?room=${normalized}`);
    });
  }

  const currentRound = snapshot?.currentRound ?? null;
  const ownHand =
    currentRound?.playerHands.find((hand) => hand.playerId === session?.playerId) ??
    null;
  const canPlay =
    !!session &&
    !!currentRound &&
    currentRound.status === "player_turn" &&
    ownHand?.turnStatus === "active";
  const canStartRound =
    !!session &&
    !currentRound &&
    (snapshot?.playerCount ?? 0) >= 2;
  const canStartNextRound =
    !!session &&
    !!currentRound &&
    currentRound.status === "revealed" &&
    (snapshot?.playerCount ?? 0) >= 2;

  function renderHandStatus(hand: BjHand) {
    return t(`bj.handStatus.${hand.turnStatus}`);
  }

  function renderOutcome(hand: BjHand) {
    if (!hand.outcome) {
      return renderHandStatus(hand);
    }

    return t(`bj.outcomes.${hand.outcome}`);
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
              {t("games.bj.title")}
            </h1>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="glass-panel rounded-[28px] p-5 sm:p-6">
            {!isSupabaseConfigured() ? (
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
                  {t("bj.pendingConfig")}
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-3xl">
                  {t("bj.connectSupabase")}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  {t("bj.missingSupabase")}
                </p>
                <div className="glass-tile rounded-[28px] p-4 text-sm text-stone-300">
                  <p>{t("bj.setupStep1")}</p>
                  <p>{t("bj.setupStep2")}</p>
                  <p>{t("bj.setupStep3")}</p>
                  <p>{t("bj.setupStep4")}</p>
                </div>
              </div>
            ) : !roomCode ? (
              <div className="space-y-8">
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  {t("bj.createRoom")}
                </h2>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("bj.yourNickname")}
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
                      ? t("bj.creating")
                      : t("bj.createRoom")}
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
                    placeholder={t("bj.roomCodePlaceholder")}
                    value={manualCode}
                  />
                  <button
                    className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                    type="submit"
                  >
                    {t("bj.join")}
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
                    {t("bj.join")}
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("bj.yourNickname")}
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
                      ? t("bj.entering")
                      : t("bj.enterRoom")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="font-[family-name:var(--font-display)] text-2xl">
                      {currentRound
                        ? t("bj.round", {
                            round: currentRound.roundNumber,
                          })
                        : t("bj.table")}
                    </h2>
                    {currentRound ? (
                      <p className="text-sm text-stone-400">
                        {t("bj.activePlayers", {
                          count: currentRound.activePlayerCount,
                        })}
                      </p>
                    ) : null}
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

                {!currentRound ? (
                  <div className="glass-tile space-y-4 rounded-[24px] p-5">
                    <p className="text-sm text-stone-400">
                      {snapshot && snapshot.playerCount < 2
                        ? t("bj.waitingSecondPlayer")
                        : `${snapshot?.playerCount ?? 0}/4`}
                    </p>

                    {canStartRound ? (
                      <button
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                        disabled={busyAction === "next-round"}
                        onClick={handleStartRound}
                        type="button"
                      >
                        {busyAction === "next-round"
                          ? t("bj.opening")
                          : t("bj.deal")}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="glass-tile rounded-[24px] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("bj.dealer")}
                        </p>
                        <p className="text-sm text-stone-400">
                          {currentRound.dealerTotal ?? "--"}
                        </p>
                      </div>

                      <HandCards cards={currentRound.dealerCards} />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {currentRound.playerHands.map((hand) => {
                        const isYou = hand.playerId === session.playerId;

                        return (
                          <div
                            key={hand.playerId}
                            className={`glass-tile rounded-[24px] p-5 ${
                              isYou ? "border-white/20" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-stone-100">
                                  {hand.nickname}
                                </p>
                                <p className="mt-1 text-sm text-stone-400">
                                  {renderOutcome(hand)}
                                </p>
                              </div>
                              <p className="text-2xl font-semibold leading-none text-stone-100">
                                {hand.total}
                              </p>
                            </div>

                            <HandCards cards={hand.cards} />

                            {isYou ? (
                              <div className="mt-4 flex gap-3">
                                <button
                                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                                  disabled={!canPlay || busyAction === "hit"}
                                  onClick={() => handleAction("hit")}
                                  type="button"
                                >
                                  {t("bj.hit")}
                                </button>
                                <button
                                  className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={!canPlay || busyAction === "stand"}
                                  onClick={() => handleAction("stand")}
                                  type="button"
                                >
                                  {t("bj.stand")}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

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
                  {t("bj.players")}
                </p>
                <p className="text-sm text-stone-400">
                  {snapshot?.playerCount ?? 0}/4
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {snapshot?.players.map((player) => (
                  <div
                    key={player.id}
                    className="glass-tile rounded-2xl px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-stone-100">
                          {player.nickname}
                        </p>
                        {player.isHost ? (
                          <span className="text-xs font-medium uppercase tracking-[0.24em] text-stone-500">
                            H
                          </span>
                        ) : null}
                      </div>
                      <p className="text-2xl font-semibold leading-none text-stone-100">
                        {(player.score ?? 0).toString()}
                      </p>
                    </div>
                  </div>
                ))}
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
              <DialogTitle>{t("bj.result")}</DialogTitle>
              <DialogDescription>{resultSummary(currentRound)}</DialogDescription>
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

          {currentRound ? (
            <div className="space-y-4">
              <div className="glass-tile rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-stone-400">{t("bj.dealer")}</p>
                  <p className="text-lg font-semibold text-stone-50">
                    {currentRound.dealerTotal ?? "--"}
                  </p>
                </div>
                <HandCards cards={currentRound.dealerCards} />
              </div>

              <div className="space-y-3">
                {currentRound.playerHands.map((hand) => (
                  <div
                    key={hand.playerId}
                    className="glass-tile rounded-2xl p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-stone-400">{hand.nickname}</p>
                      <p className="text-lg font-semibold text-stone-50">
                        {renderOutcome(hand)}
                      </p>
                    </div>
                    <HandCards cards={hand.cards} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            {canStartNextRound ? (
              <button
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                disabled={busyAction === "next-round"}
                onClick={handleStartRound}
                type="button"
              >
                {busyAction === "next-round"
                  ? t("bj.opening")
                  : t("bj.nextRound")}
              </button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function BjRoomFallback() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-[#020202] px-4 py-8 text-stone-100">
      <div className="glass-panel mx-auto max-w-4xl rounded-[28px] p-6">
        <p className="text-sm text-stone-300">{t("common.loadingRoom")}</p>
      </div>
    </main>
  );
}

export function BjRoom() {
  return (
    <Suspense fallback={<BjRoomFallback />}>
      <BjRoomContent />
    </Suspense>
  );
}
