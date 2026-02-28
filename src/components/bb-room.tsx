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
  challengeBbPlay,
  createBbRoom,
  getBbRoomSnapshot,
  joinBbRoom,
  loadBbRoomSession,
  playBbCards,
  saveBbRoomSession,
  startBbRound,
  type BbRoomSession,
  type BbSnapshot,
  type BluffColor,
} from "@/lib/bb";
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

function colorToken(color: BluffColor) {
  switch (color) {
    case "red":
      return {
        bg: "bg-red-500/80",
        text: "text-red-200",
        borderColor: "rgba(248, 113, 113, 0.38)",
        selectedBorderColor: "rgba(248, 113, 113, 0.96)",
        backgroundColor: "rgba(239, 68, 68, 0.05)",
        selectedBackgroundColor: "rgba(239, 68, 68, 0.12)",
        shadowColor: "rgba(239, 68, 68, 0.34)",
      };
    case "blue":
      return {
        bg: "bg-sky-500/80",
        text: "text-sky-200",
        borderColor: "rgba(56, 189, 248, 0.38)",
        selectedBorderColor: "rgba(56, 189, 248, 0.96)",
        backgroundColor: "rgba(14, 165, 233, 0.05)",
        selectedBackgroundColor: "rgba(14, 165, 233, 0.12)",
        shadowColor: "rgba(14, 165, 233, 0.34)",
      };
    case "green":
      return {
        bg: "bg-emerald-500/80",
        text: "text-emerald-200",
        borderColor: "rgba(52, 211, 153, 0.38)",
        selectedBorderColor: "rgba(52, 211, 153, 0.96)",
        backgroundColor: "rgba(16, 185, 129, 0.05)",
        selectedBackgroundColor: "rgba(16, 185, 129, 0.12)",
        shadowColor: "rgba(16, 185, 129, 0.34)",
      };
    case "yellow":
      return {
        bg: "bg-amber-400/80",
        text: "text-amber-100",
        borderColor: "rgba(251, 191, 36, 0.38)",
        selectedBorderColor: "rgba(252, 211, 77, 0.96)",
        backgroundColor: "rgba(245, 158, 11, 0.05)",
        selectedBackgroundColor: "rgba(245, 158, 11, 0.12)",
        shadowColor: "rgba(245, 158, 11, 0.34)",
      };
  }
}

function ColorDot({
  color,
  size = "md",
}: {
  color: BluffColor;
  size?: "sm" | "md";
}) {
  const token = colorToken(color);
  const sizeClass = size === "sm" ? "size-3" : "size-4";

  return (
    <span
      className={`${sizeClass} rounded-full ${token.bg} shadow-[0_0_0_1px_rgba(255,255,255,0.06)]`}
    />
  );
}

function HiddenCard() {
  return (
    <div className="glass-tile flex h-10 w-10 items-center justify-center rounded-2xl border border-white/6 bg-[#0d0e11] text-lg text-stone-600">
      ...
    </div>
  );
}

function SelectableColorCard({
  color,
  label,
  onClick,
  selected,
}: {
  color: BluffColor;
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  const token = colorToken(color);

  return (
    <button
      className="glass-tile flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition"
      onClick={onClick}
      style={{
        backgroundColor: selected
          ? token.selectedBackgroundColor
          : token.backgroundColor,
        borderColor: selected
          ? token.selectedBorderColor
          : token.borderColor,
        boxShadow: selected
          ? `inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 0 2px ${token.shadowColor}, 0 14px 32px rgba(0, 0, 0, 0.22)`
          : `inset 0 0 0 1px rgba(255,255,255,0.04), 0 14px 32px rgba(0, 0, 0, 0.22)`,
      }}
      type="button"
    >
      <ColorDot color={color} />
      <span className={`text-sm font-medium ${selected ? token.text : "text-stone-200"}`}>
        {label}
      </span>
    </button>
  );
}

function BbRoomContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room") ?? "");

  const [nickname, setNickname] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [session, setSession] = useState<BbRoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<BbSnapshot | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">(
    "idle",
  );
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [seenRevealedRoundId, setSeenRevealedRoundId] = useState<string | null>(
    null,
  );
  const [selectedCardIndexes, setSelectedCardIndexes] = useState<number[]>([]);

  async function loadSnapshot(activeSession: BbRoomSession) {
    try {
      const data = await getBbRoomSnapshot(activeSession);
      setSnapshot(data);
      setError(null);
    } catch (snapshotError) {
      setSnapshot(null);
      setError(
        snapshotError instanceof Error
          ? snapshotError.message
          : t("bb.loadRoomError"),
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

    setSession(loadBbRoomSession(roomCode));
  }, [roomCode]);

  const refreshSnapshot = useEffectEvent((activeSession: BbRoomSession) => {
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
      .channel(`bb-room-${snapshot.roomId}`)
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

  useEffect(() => {
    setSelectedCardIndexes([]);
  }, [snapshot?.currentRound?.id, snapshot?.currentRound?.status]);

  async function handleCreateRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("bb.nicknameBeforeCreate"));
      return;
    }

    setBusyAction("create");
    setError(null);

    try {
      const nextSession = await createBbRoom(trimmedName);
      saveNickname(trimmedName);
      saveBbRoomSession(nextSession);
      setSession(nextSession);
      setShareState("idle");

      startTransition(() => {
        router.replace(`${pathname}?room=${nextSession.roomCode}`);
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("bb.createRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleJoinRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("bb.nicknameBeforeJoin"));
      return;
    }

    if (!roomCode) {
      setError(t("bb.roomCodeMissing"));
      return;
    }

    setBusyAction("join");
    setError(null);

    try {
      const nextSession = await joinBbRoom(roomCode, trimmedName);
      saveNickname(trimmedName);
      saveBbRoomSession(nextSession);
      setSession(nextSession);
      await loadSnapshot(nextSession);
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : t("bb.joinRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartRound() {
    if (!session) {
      setError(t("bb.firstEnterRoom"));
      return;
    }

    setBusyAction("start");
    setError(null);

    try {
      await startBbRound(session);
      await loadSnapshot(session);
    } catch (roundError) {
      setError(
        roundError instanceof Error
          ? roundError.message
          : t("bb.startGameError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePlayCards() {
    if (!session) {
      setError(t("bb.firstEnterRoom"));
      return;
    }

    if (selectedCardIndexes.length === 0) {
      setError(t("bb.selectCards"));
      return;
    }

    setBusyAction("play");
    setError(null);

    try {
      await playBbCards(session, selectedCardIndexes);
      setSelectedCardIndexes([]);
      await loadSnapshot(session);
    } catch (playError) {
      setError(
        playError instanceof Error ? playError.message : t("bb.playError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleChallenge() {
    if (!session) {
      setError(t("bb.firstEnterRoom"));
      return;
    }

    setBusyAction("challenge");
    setError(null);

    try {
      await challengeBbPlay(session);
      await loadSnapshot(session);
    } catch (challengeError) {
      setError(
        challengeError instanceof Error
          ? challengeError.message
          : t("bb.challengeError"),
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
          text: t("bb.shareText"),
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
      setError(t("bb.invalidRoomCode"));
      return;
    }

    startTransition(() => {
      router.push(`${pathname}?room=${normalized}`);
    });
  }

  function toggleCard(index: number) {
    setSelectedCardIndexes((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index].sort((a, b) => a - b),
    );
  }

  const currentRound = snapshot?.currentRound ?? null;
  const ownCards = currentRound?.handCards ?? [];
  const isCurrentPlayer =
    !!session && currentRound?.currentPlayerId === session.playerId;
  const canChallenge =
    !!session &&
    !!currentRound &&
    currentRound.status === "pending" &&
    isCurrentPlayer &&
    !!currentRound.lastPlayPlayerId &&
    currentRound.lastPlayPlayerId !== session.playerId;
  const canPlay =
    !!session &&
    !!currentRound &&
    currentRound.status === "pending" &&
    isCurrentPlayer &&
    ownCards.length > 0;
  const canStartFirstRound =
    !!session &&
    !currentRound &&
    (snapshot?.playerCount ?? 0) >= 2 &&
    snapshot?.roomStatus === "waiting";
  const canStartNextRound =
    !!session &&
    !!currentRound &&
    currentRound.status === "revealed" &&
    snapshot?.roomStatus !== "finished";
  const alivePlayers =
    snapshot?.players.filter((player) => !player.isEliminated) ?? [];

  function colorLabel(color: BluffColor) {
    return t(`bb.colors.${color}`);
  }

  function roundStatusText() {
    if (!snapshot) {
      return t("bb.waitingPlayers");
    }

    if (!currentRound) {
      return t("bb.readyPlayers", { count: snapshot.playerCount });
    }

    if (currentRound.status === "revealed") {
      return t("bb.result");
    }

    return t("bb.currentTurn", {
      name: currentRound.currentPlayerNickname,
    });
  }

  function resultTitle() {
    if (!currentRound) {
      return "";
    }

    if (currentRound.challengeResult === "escaped") {
      return t("bb.escapedRound", {
        name: currentRound.winnerNickname ?? "",
      });
    }

    return currentRound.challengeResult === "caught"
      ? t("bb.challengeCaught")
      : t("bb.challengeMissed");
  }

  function resultDescription() {
    if (!currentRound) {
      return "";
    }

    if (currentRound.challengeResult === "escaped") {
      return snapshot?.roomStatus === "finished"
        ? t("bb.winner", { name: currentRound.winnerNickname ?? "" })
        : t("bb.othersLoseLife");
    }

    if (snapshot?.roomStatus === "finished" && currentRound.winnerNickname) {
      return t("bb.winner", { name: currentRound.winnerNickname });
    }

    if (!currentRound.loserNickname) {
      return "";
    }

    return t("bb.loserLosesLife", { name: currentRound.loserNickname });
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
              {t("games.bb.title")}
            </h1>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="glass-panel rounded-[28px] p-5 sm:p-6">
            {!isSupabaseConfigured() ? (
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
                  {t("bb.pendingConfig")}
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-3xl">
                  {t("bb.connectSupabase")}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  {t("bb.missingSupabase")}
                </p>
                <div className="glass-tile rounded-[28px] p-4 text-sm text-stone-300">
                  <p>{t("bb.setupStep1")}</p>
                  <p>{t("bb.setupStep2")}</p>
                  <p>{t("bb.setupStep3")}</p>
                  <p>{t("bb.setupStep4")}</p>
                </div>
              </div>
            ) : !roomCode ? (
              <div className="space-y-8">
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  {t("bb.createRoom")}
                </h2>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("bb.yourNickname")}
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
                      ? t("bb.creating")
                      : t("bb.createRoom")}
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
                    placeholder={t("bb.roomCodePlaceholder")}
                    value={manualCode}
                  />
                  <button
                    className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                    type="submit"
                  >
                    {t("bb.join")}
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
                    {t("bb.join")}
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("bb.yourNickname")}
                      value={nickname}
                    />
                  </label>

                  <button
                    className="rounded-2xl bg-white px-6 py-3 font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                    disabled={busyAction === "join"}
                    onClick={handleJoinRoom}
                    type="button"
                  >
                    {busyAction === "join" ? t("bb.entering") : t("bb.enterRoom")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="font-[family-name:var(--font-display)] text-2xl">
                      {currentRound
                        ? t("bb.round", { round: currentRound.roundNumber })
                        : t("games.bb.title")}
                    </h2>
                    <p className="text-sm text-stone-400">{roundStatusText()}</p>
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
                  <div className="space-y-4">
                    <div className="glass-tile rounded-[24px] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                            {t("bb.players")}
                          </p>
                          <p className="mt-2 text-sm text-stone-300">
                            {t("bb.readyPlayers", {
                              count: snapshot?.playerCount ?? 0,
                            })}
                          </p>
                        </div>

                        {canStartFirstRound ? (
                          <button
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                            disabled={busyAction === "start"}
                            onClick={handleStartRound}
                            type="button"
                          >
                            {busyAction === "start"
                              ? t("bb.starting")
                              : t("bb.startGame")}
                          </button>
                        ) : null}
                      </div>

                      {!canStartFirstRound ? (
                        <p className="mt-4 text-sm text-stone-500">
                          {t("bb.waitingPlayers")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="glass-tile rounded-[24px] p-5">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                              {t("bb.targetColor")}
                            </p>
                            <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-white/8 px-4 py-2">
                              <ColorDot color={currentRound.targetColor} />
                              <span className="text-sm font-medium text-stone-100">
                                {colorLabel(currentRound.targetColor)}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                              {t("bb.pile")}
                            </p>
                            <p className="mt-3 text-3xl font-semibold leading-none text-stone-100">
                              {currentRound.pileCount}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                              {currentRound.lastPlayPlayerNickname
                                ? t("bb.lastPlay", {
                                    count: currentRound.lastPlayCount,
                                    name: currentRound.lastPlayPlayerNickname,
                                  })
                                : t("bb.waitingChallenge")}
                            </p>
                          </div>

                          <div className="rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                              {t("bb.currentTurn", {
                                name: currentRound.currentPlayerNickname,
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                              {t("bb.yourHand")}
                            </p>
                            <p className="text-sm text-stone-400">
                              {ownCards.length} {t("bb.cards").toLowerCase()}
                            </p>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {ownCards.map((card, index) => (
                              <SelectableColorCard
                                color={card}
                                key={`${card}-${index}`}
                                label={colorLabel(card)}
                                onClick={() => toggleCard(index)}
                                selected={selectedCardIndexes.includes(index)}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3">
                          <button
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                            disabled={!canPlay || busyAction === "play"}
                            onClick={handlePlayCards}
                            type="button"
                          >
                            {busyAction === "play"
                              ? t("bb.opening")
                              : t("bb.playCards")}
                          </button>

                          <button
                            className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!canChallenge || busyAction === "challenge"}
                            onClick={handleChallenge}
                            type="button"
                          >
                            {busyAction === "challenge"
                              ? t("bb.opening")
                              : t("bb.challenge")}
                          </button>
                        </div>
                      </div>

                      <div className="glass-tile rounded-[24px] p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("bb.cards")}
                        </p>
                        <div className="mt-4 space-y-4">
                          {currentRound.hands.map((hand) => (
                            <div key={hand.playerId} className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-stone-300">
                                  {hand.nickname}
                                </p>
                                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                                  {hand.cardCount}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {hand.isSelf
                                  ? hand.cards.map((card, index) => (
                                      <div
                                        className="glass-tile flex h-10 min-w-10 items-center justify-center rounded-2xl border border-white/6 px-3"
                                        key={`${card}-${index}`}
                                      >
                                        <ColorDot color={card as BluffColor} size="sm" />
                                      </div>
                                    ))
                                  : hand.cards.map((_, index) => (
                                      <HiddenCard key={`${hand.playerId}-${index}`} />
                                    ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {canStartNextRound ? (
                      <div className="flex justify-end">
                        <button
                          className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={busyAction === "start"}
                          onClick={handleStartRound}
                          type="button"
                        >
                          {busyAction === "start"
                            ? t("bb.opening")
                            : t("bb.nextRound")}
                        </button>
                      </div>
                    ) : null}
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
                  {t("bb.players")}
                </p>
                <p className="text-sm text-stone-400">
                  {snapshot?.playerCount ?? 0}/4
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {snapshot?.players.map((player) => (
                  <div
                    className={`glass-tile rounded-2xl px-4 py-3 ${
                      player.isEliminated ? "opacity-45" : ""
                    }`}
                    key={player.id}
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
                        {player.livesRemaining}
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
              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-stone-500">
                {alivePlayers.length}/{snapshot?.playerCount ?? 0}
              </p>
            </section>
          </aside>
        </div>
      </div>

      <Dialog onOpenChange={setResultDialogOpen} open={resultDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{resultTitle()}</DialogTitle>
                <DialogDescription>{resultDescription()}</DialogDescription>
              </div>

              <button
                aria-label={t("common.close")}
                className="rounded-full border border-white/10 p-2 text-stone-300 transition hover:border-white/20 hover:text-stone-100"
                onClick={() => setResultDialogOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
          </DialogHeader>

          {currentRound ? (
            <div className="mt-5 space-y-4">
              <div className="glass-tile rounded-[24px] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                  {t("bb.lastPlay", {
                    count: currentRound.lastPlayCount,
                    name: currentRound.lastPlayPlayerNickname ?? "",
                  })}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {currentRound.revealedCards.map((card, index) => (
                    <div
                      className="glass-tile flex min-w-24 items-center gap-3 rounded-2xl border border-white/6 px-4 py-3"
                      key={`${card}-${index}`}
                    >
                      <ColorDot color={card} />
                      <span className="text-sm text-stone-100">
                        {colorLabel(card)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {currentRound.winnerNickname ? (
                <div className="glass-tile rounded-[24px] p-4 text-sm text-stone-300">
                  {snapshot?.roomStatus === "finished"
                    ? t("bb.winner", { name: currentRound.winnerNickname })
                    : t("bb.othersLoseLife")}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            {canStartNextRound ? (
              <button
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                disabled={busyAction === "start"}
                onClick={handleStartRound}
                type="button"
              >
                {busyAction === "start" ? t("bb.opening") : t("bb.nextRound")}
              </button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function BbRoomFallback() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-[#020202] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center">
        <div className="glass-panel rounded-[28px] px-6 py-5 text-sm text-stone-300">
          {t("common.loadingRoom")}
        </div>
      </div>
    </main>
  );
}

export function BbRoom() {
  return (
    <Suspense fallback={<BbRoomFallback />}>
      <BbRoomContent />
    </Suspense>
  );
}
