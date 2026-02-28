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
  createBjdRoom,
  getBjdRoomSnapshot,
  joinBjdRoom,
  loadBjdRoomSession,
  saveBjdRoomSession,
  startNextBjdRound,
  submitBjdAction,
  type BjdHand,
  type BjdRoomSession,
  type BjdSnapshot,
} from "@/lib/bjd";
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

function parseCard(card: string) {
  if (card === "??") {
    return {
      isHidden: true,
      rank: "?",
      suitKey: "?",
      suitLabel: "?",
    } as const;
  }

  const rank = card.slice(0, -1);
  const suitKey = card.slice(-1);

  const suitLabel =
    suitKey === "H"
      ? "\u2665"
      : suitKey === "D"
        ? "\u2666"
        : suitKey === "C"
          ? "\u2663"
          : "\u2660";

  return {
    isHidden: false,
    rank,
    suitKey,
    suitLabel,
  } as const;
}

function PlayingCard({ card }: { card: string }) {
  const parsed = parseCard(card);
  const isRed = parsed.suitKey === "H" || parsed.suitKey === "D";

  if (parsed.isHidden) {
    return (
      <div className="relative flex h-24 w-16 items-center justify-center overflow-hidden rounded-[22px] border border-white/8 bg-[#0b0c0f] shadow-[0_12px_24px_rgba(0,0,0,0.24)] sm:h-28 sm:w-[4.5rem]">
        <div className="absolute inset-[1px] rounded-[21px] border border-white/5" />
        <div className="text-lg font-semibold tracking-[0.18em] text-stone-600 sm:text-xl">
          ??
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-24 w-16 flex-col justify-between rounded-[22px] border border-white/8 bg-[#111215] p-3 text-stone-100 shadow-[0_12px_24px_rgba(0,0,0,0.24)] sm:h-28 sm:w-[4.5rem]">
      <div className="absolute inset-[1px] rounded-[21px] border border-white/5" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-lg font-semibold leading-none text-stone-100 sm:text-xl">
          {parsed.rank}
        </p>
        <span
          className={`text-base leading-none sm:text-lg ${
            isRed ? "text-red-500/80" : "text-stone-400"
          }`}
        >
          {parsed.suitLabel}
        </span>
      </div>

      <div className="relative flex items-end justify-end">
        <span
          className={`text-2xl leading-none sm:text-[2rem] ${
            isRed ? "text-red-500/80" : "text-stone-400"
          }`}
        >
          {parsed.suitLabel}
        </span>
      </div>
    </div>
  );
}

function HandCards({ cards }: { cards: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {cards.map((card, index) => (
        <PlayingCard card={card} key={`${card}-${index}`} />
      ))}
    </div>
  );
}

function BjdRoomContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room") ?? "");

  const [nickname, setNickname] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [session, setSession] = useState<BjdRoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<BjdSnapshot | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">(
    "idle",
  );
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [seenRevealedRoundId, setSeenRevealedRoundId] = useState<string | null>(
    null,
  );

  async function loadSnapshot(activeSession: BjdRoomSession) {
    try {
      const data = await getBjdRoomSnapshot(activeSession);
      setSnapshot(data);
      setError(null);
    } catch (snapshotError) {
      setSnapshot(null);
      setError(
        snapshotError instanceof Error
          ? snapshotError.message
          : t("bjd.loadRoomError"),
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

    setSession(loadBjdRoomSession(roomCode));
  }, [roomCode]);

  const refreshSnapshot = useEffectEvent((activeSession: BjdRoomSession) => {
    void loadSnapshot(activeSession);
  });

  useEffect(() => {
    if (!session || !isSupabaseConfigured()) {
      return;
    }

    void refreshSnapshot(session);
  }, [session]);

  useEffect(() => {
    if (!session || !isSupabaseConfigured()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshSnapshot(session);
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session]);

  useEffect(() => {
    if (!snapshot?.roomId || !session) {
      return;
    }

    const client = getSupabaseBrowserClient();

    if (!client) {
      return;
    }

    const syncRoom = () => {
      void refreshSnapshot(session);
    };

    const channel = client
      .channel(`bjd-room-${snapshot.roomId}`)
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
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [session, snapshot?.roomId]);

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
      setError(t("bjd.nicknameBeforeCreate"));
      return;
    }

    setBusyAction("create");
    setError(null);

    try {
      const nextSession = await createBjdRoom(trimmedName);
      saveNickname(trimmedName);
      saveBjdRoomSession(nextSession);
      setSession(nextSession);
      setShareState("idle");

      startTransition(() => {
        router.replace(`${pathname}?room=${nextSession.roomCode}`);
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("bjd.createRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleJoinRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("bjd.nicknameBeforeJoin"));
      return;
    }

    if (!roomCode) {
      setError(t("bjd.roomCodeMissing"));
      return;
    }

    setBusyAction("join");
    setError(null);

    try {
      const nextSession = await joinBjdRoom(roomCode, trimmedName);
      saveNickname(trimmedName);
      saveBjdRoomSession(nextSession);
      setSession(nextSession);
      await loadSnapshot(nextSession);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : t("bjd.joinRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAction(action: "hit" | "stand") {
    if (!session) {
      setError(t("bjd.firstEnterRoom"));
      return;
    }

    setBusyAction(action);
    setError(null);

    try {
      await submitBjdAction(session, action);
      await loadSnapshot(session);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("bjd.actionError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleNextRound() {
    if (!session) {
      setError(t("bjd.firstEnterRoom"));
      return;
    }

    setBusyAction("next-round");
    setError(null);

    try {
      await startNextBjdRound(session);
      await loadSnapshot(session);
    } catch (roundError) {
      setError(
        roundError instanceof Error
          ? roundError.message
          : t("bjd.nextRoundError"),
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
          text: t("bjd.shareText"),
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
      setError(t("bjd.invalidRoomCode"));
      return;
    }

    startTransition(() => {
      router.push(`${pathname}?room=${normalized}`);
    });
  }

  const currentRound = snapshot?.currentRound ?? null;
  const selfHand =
    currentRound?.playerHands.find((hand) => hand.isSelf) ?? null;
  const opponentHand =
    currentRound?.playerHands.find((hand) => !hand.isSelf) ?? null;
  const canPlay =
    !!session &&
    !!currentRound &&
    currentRound.status === "pending" &&
    selfHand?.turnStatus === "active";
  const canStartNextRound =
    !!session &&
    !!currentRound &&
    currentRound.status === "revealed" &&
    snapshot?.playerCount === 2;

  function renderHandStatus(hand: BjdHand) {
    return t(`bjd.handStatus.${hand.turnStatus}`);
  }

  function renderOutcome(hand: BjdHand) {
    if (!hand.outcome) {
      return renderHandStatus(hand);
    }

    return t(`bjd.outcomes.${hand.outcome}`);
  }

  function resultDescription() {
    if (!selfHand) {
      return "";
    }

    return renderOutcome(selfHand);
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
              {t("games.bjd.title")}
            </h1>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="glass-panel rounded-[28px] p-5 sm:p-6">
            {!isSupabaseConfigured() ? (
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
                  {t("bjd.pendingConfig")}
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-3xl">
                  {t("bjd.connectSupabase")}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  {t("bjd.missingSupabase")}
                </p>
                <div className="glass-tile rounded-[28px] p-4 text-sm text-stone-300">
                  <p>{t("bjd.setupStep1")}</p>
                  <p>{t("bjd.setupStep2")}</p>
                  <p>{t("bjd.setupStep3")}</p>
                  <p>{t("bjd.setupStep4")}</p>
                </div>
              </div>
            ) : !roomCode ? (
              <div className="space-y-8">
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  {t("bjd.createRoom")}
                </h2>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("bjd.yourNickname")}
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
                      ? t("bjd.creating")
                      : t("bjd.createRoom")}
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
                    placeholder={t("bjd.roomCodePlaceholder")}
                    value={manualCode}
                  />
                  <button
                    className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                    type="submit"
                  >
                    {t("bjd.join")}
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
                    {t("bjd.join")}
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("bjd.yourNickname")}
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
                      ? t("bjd.entering")
                      : t("bjd.enterRoom")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="font-[family-name:var(--font-display)] text-2xl">
                      {currentRound
                        ? t("bjd.round", {
                            round: currentRound.roundNumber,
                          })
                        : t("bjd.duel")}
                    </h2>
                    <p className="text-sm text-stone-400">
                      {currentRound
                        ? t("bjd.readyPlayers", {
                            count: 2 - currentRound.activePlayerCount,
                          })
                        : t("bjd.waitingOpponent")}
                    </p>
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
                  <div className="glass-tile rounded-[24px] p-5 text-sm text-stone-400">
                    {t("bjd.waitingSecondPlayer")}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="glass-tile rounded-[24px] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("bjd.yourHand")}
                        </p>
                        <p className="text-sm text-stone-400">
                          {selfHand?.total ?? "--"}
                        </p>
                      </div>

                      <p className="mt-3 text-sm text-stone-400">
                        {selfHand ? renderOutcome(selfHand) : ""}
                      </p>

                      <HandCards cards={selfHand?.cards ?? []} />

                      <div className="mt-4 flex gap-3">
                        <button
                          className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                          disabled={!canPlay || busyAction === "hit"}
                          onClick={() => handleAction("hit")}
                          type="button"
                        >
                          {t("bjd.hit")}
                        </button>
                        <button
                          className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!canPlay || busyAction === "stand"}
                          onClick={() => handleAction("stand")}
                          type="button"
                        >
                          {t("bjd.stand")}
                        </button>
                      </div>
                    </div>

                    <div className="glass-tile rounded-[24px] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("bjd.opponentHand")}
                        </p>
                        <p className="text-sm text-stone-400">
                          {opponentHand?.revealed
                            ? (opponentHand.total ?? "--")
                            : `${opponentHand?.cardCount ?? 0} ${t("bjd.hidden")}`}
                        </p>
                      </div>

                      <p className="mt-3 text-sm text-stone-400">
                        {opponentHand
                          ? currentRound.status === "revealed"
                            ? renderOutcome(opponentHand)
                            : renderHandStatus(opponentHand)
                          : t("bjd.waitingOpponent")}
                      </p>

                      <HandCards cards={opponentHand?.cards ?? []} />
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
                  {t("bjd.players")}
                </p>
                <p className="text-sm text-stone-400">
                  {snapshot?.playerCount ?? 0}/2
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
              <DialogTitle>{t("bjd.result")}</DialogTitle>
              <DialogDescription>{resultDescription()}</DialogDescription>
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
          ) : null}

          <DialogFooter>
            {canStartNextRound ? (
              <button
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                disabled={busyAction === "next-round"}
                onClick={handleNextRound}
                type="button"
              >
                {busyAction === "next-round"
                  ? t("bjd.opening")
                  : t("bjd.nextRound")}
              </button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function BjdRoomFallback() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-[#020202] px-4 py-8 text-stone-100">
      <div className="glass-panel mx-auto max-w-4xl rounded-[28px] p-6">
        <p className="text-sm text-stone-300">{t("common.loadingRoom")}</p>
      </div>
    </main>
  );
}

export function BjdRoom() {
  return (
    <Suspense fallback={<BjdRoomFallback />}>
      <BjdRoomContent />
    </Suspense>
  );
}
