"use client";

import Link from "next/link";
import { Check, Share2, Trophy, X } from "lucide-react";
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
import { getSavedNickname, saveNickname } from "@/lib/rps";
import {
  createSpotRoom,
  getSpotRoomSnapshot,
  joinSpotRoom,
  loadSpotPrompts,
  loadSpotRoomSession,
  saveSpotRoomSession,
  startSpotRound,
  submitSpotVote,
  type SpotPlayer,
  type SpotPrompt,
  type SpotRoomSession,
  type SpotSnapshot,
} from "@/lib/spot";
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

function pickNextPrompt(prompts: SpotPrompt[], usedPromptIds: string[]) {
  if (prompts.length === 0) {
    return null;
  }

  const usedIds = new Set(usedPromptIds);
  const freshPrompts = prompts.filter((prompt) => !usedIds.has(prompt.id));
  const pool = freshPrompts.length > 0 ? freshPrompts : prompts;
  const nextIndex = Math.floor(Math.random() * pool.length);

  return pool[nextIndex] ?? null;
}

function SpotlightButton({
  disabled,
  label,
  onClick,
  selected,
  subtitle,
}: {
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  selected?: boolean;
  subtitle?: string;
}) {
  const stateClass = selected
    ? "border-emerald-300/80 bg-emerald-300/14 text-stone-50 shadow-[0_0_0_1px_rgba(110,231,183,0.3),0_18px_40px_rgba(16,185,129,0.12)]"
    : "border-white/10 bg-white/[0.04] text-stone-100 hover:border-white/24 hover:bg-white/[0.08]";

  return (
    <button
      className={`glass-tile rounded-[24px] border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${stateClass}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-inherit">{label}</p>
          {subtitle ? (
            <p className={`mt-1 text-sm ${selected ? "text-emerald-100" : "text-stone-400"}`}>
              {subtitle}
            </p>
          ) : null}
        </div>

        <span
          className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${
            selected
              ? "border-emerald-200/70 bg-emerald-200/20 text-emerald-100"
              : "border-white/12 bg-black/20 text-stone-500"
          }`}
        >
          <Check className="size-4" />
        </span>
      </div>
    </button>
  );
}

function SpotRoomContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room") ?? "");

  const [nickname, setNickname] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [session, setSession] = useState<SpotRoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<SpotSnapshot | null>(null);
  const [prompts, setPrompts] = useState<SpotPrompt[]>([]);
  const [promptLoadError, setPromptLoadError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">(
    "idle",
  );
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [seenRevealedRoundId, setSeenRevealedRoundId] = useState<string | null>(
    null,
  );
  const [cardsDialogPlayerId, setCardsDialogPlayerId] = useState<string | null>(
    null,
  );

  async function loadSnapshot(activeSession: SpotRoomSession) {
    try {
      const data = await getSpotRoomSnapshot(activeSession);
      setSnapshot(data);
      setError(null);
    } catch (snapshotError) {
      setSnapshot(null);
      setError(
        snapshotError instanceof Error
          ? snapshotError.message
          : t("spot.loadRoomError"),
      );
    }
  }

  useEffect(() => {
    setNickname((current) => current || getSavedNickname());
  }, []);

  useEffect(() => {
    let ignore = false;

    void loadSpotPrompts()
      .then((data) => {
        if (ignore) {
          return;
        }

        setPrompts(data);
        setPromptLoadError(null);
      })
      .catch((loadError) => {
        if (ignore) {
          return;
        }

        setPromptLoadError(
          loadError instanceof Error
            ? loadError.message
            : t("spot.promptsLoadError"),
        );
      });

    return () => {
      ignore = true;
    };
  }, [t]);

  useEffect(() => {
    if (!roomCode) {
      setSession(null);
      setSnapshot(null);
      return;
    }

    setSession(loadSpotRoomSession(roomCode));
  }, [roomCode]);

  const refreshSnapshot = useEffectEvent((activeSession: SpotRoomSession) => {
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
      .channel(`spot-room-${snapshot.roomId}`)
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
          table: "spot_rounds",
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
      setError(t("spot.nicknameBeforeCreate"));
      return;
    }

    setBusyAction("create");
    setError(null);

    try {
      const nextSession = await createSpotRoom(trimmedName);
      saveNickname(trimmedName);
      saveSpotRoomSession(nextSession);
      setSession(nextSession);
      setShareState("idle");

      startTransition(() => {
        router.replace(`${pathname}?room=${nextSession.roomCode}`);
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("spot.createRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleJoinRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("spot.nicknameBeforeJoin"));
      return;
    }

    if (!roomCode) {
      setError(t("spot.roomCodeMissing"));
      return;
    }

    setBusyAction("join");
    setError(null);

    try {
      const nextSession = await joinSpotRoom(roomCode, trimmedName);
      saveNickname(trimmedName);
      saveSpotRoomSession(nextSession);
      setSession(nextSession);
      await loadSnapshot(nextSession);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : t("spot.joinRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartRound() {
    if (!session) {
      setError(t("spot.firstEnterRoom"));
      return;
    }

    const nextPrompt = pickNextPrompt(prompts, snapshot?.usedPromptIds ?? []);

    if (!nextPrompt) {
      setError(promptLoadError ?? t("spot.noPromptsAvailable"));
      return;
    }

    setBusyAction("start");
    setError(null);

    try {
      await startSpotRound(session, nextPrompt);
      await loadSnapshot(session);
    } catch (roundError) {
      setError(
        roundError instanceof Error
          ? roundError.message
          : t("spot.startRoundError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVote(targetPlayerId: string) {
    if (!session) {
      setError(t("spot.firstEnterRoom"));
      return;
    }

    setBusyAction(targetPlayerId);
    setError(null);

    try {
      await submitSpotVote(session, targetPlayerId);
      await loadSnapshot(session);
    } catch (voteError) {
      setError(
        voteError instanceof Error ? voteError.message : t("spot.voteError"),
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
          text: t("spot.shareText"),
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
      setError(t("spot.invalidRoomCode"));
      return;
    }

    startTransition(() => {
      router.push(`${pathname}?room=${normalized}`);
    });
  }

  const currentRound = snapshot?.currentRound ?? null;
  const participantPlayerIds = currentRound?.participantPlayerIds ?? [];
  const participantPlayers = snapshot?.players.filter((player) =>
    participantPlayerIds.includes(player.id),
  ) ?? [];
  const isParticipant =
    !!session && participantPlayerIds.includes(session.playerId);
  const currentVoteTargetId = currentRound?.selfVoteTargetPlayerId ?? null;
  const canStartRound =
    !!session &&
    prompts.length > 0 &&
    !promptLoadError &&
    (snapshot?.playerCount ?? 0) >= 3 &&
    (!currentRound || currentRound.status === "revealed");
  const canVote =
    !!session &&
    !!currentRound &&
    currentRound.status === "pending" &&
    isParticipant;
  const highScore = Math.max(
    0,
    ...(snapshot?.players.map((player) => player.score) ?? [0]),
  );
  const cardsDialogPlayer =
    snapshot?.players.find((player) => player.id === cardsDialogPlayerId) ?? null;

  function resultTitle() {
    if (!currentRound) {
      return "";
    }

    if (currentRound.winnerNickname) {
      return t("spot.resultWinner", {
        count: currentRound.winningVoteCount,
        name: currentRound.winnerNickname,
      });
    }

    if (currentRound.tiedNicknames.length > 0) {
      return t("spot.resultTie", {
        count: currentRound.winningVoteCount,
        names: currentRound.tiedNicknames.join(", "),
      });
    }

    return t("spot.noWinner");
  }

  function playerStatus(player: SpotPlayer) {
    if (currentVoteTargetId === player.id && currentRound?.status === "pending") {
      return t("spot.yourVote");
    }

    if (player.score > 0 && player.score === highScore) {
      return t("spot.leading");
    }

    return t("spot.scoreValue", { count: player.score });
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
              {t("games.spot.title")}
            </h1>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="glass-panel rounded-[28px] p-5 sm:p-6">
            {!isSupabaseConfigured() ? (
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
                  {t("spot.pendingConfig")}
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-3xl">
                  {t("spot.connectSupabase")}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  {t("spot.missingSupabase")}
                </p>
                <div className="glass-tile rounded-[28px] p-4 text-sm text-stone-300">
                  <p>{t("spot.setupStep1")}</p>
                  <p>{t("spot.setupStep2")}</p>
                  <p>{t("spot.setupStep3")}</p>
                  <p>{t("spot.setupStep4")}</p>
                </div>
              </div>
            ) : !roomCode ? (
              <div className="space-y-8">
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  {t("spot.createRoom")}
                </h2>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("spot.yourNickname")}
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
                      ? t("spot.creating")
                      : t("spot.createRoom")}
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
                    placeholder={t("spot.roomCodePlaceholder")}
                    value={manualCode}
                  />
                  <button
                    className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                    type="submit"
                  >
                    {t("spot.join")}
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
                    {t("spot.join")}
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("spot.yourNickname")}
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
                      ? t("spot.entering")
                      : t("spot.enterRoom")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="font-[family-name:var(--font-display)] text-2xl">
                      {currentRound
                        ? t("spot.round", { round: currentRound.roundNumber })
                        : t("games.spot.title")}
                    </h2>
                    <p className="text-sm text-stone-400">
                      {currentRound?.status === "pending"
                        ? t("spot.submittedVotes", {
                            count: currentRound.submittedCount,
                            total: currentRound.participantCount,
                          })
                        : t("spot.waitingToStart")}
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
                  <div className="space-y-4">
                    <div className="glass-tile rounded-[24px] p-5">
                      <h3 className="mt-3 text-2xl font-semibold text-stone-100">
                        {t("spot.waitingToStart")}
                      </h3>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300">
                        {t("spot.startRoundHelp")}
                      </p>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                          disabled={!canStartRound || busyAction === "start"}
                          onClick={handleStartRound}
                          type="button"
                        >
                          {busyAction === "start"
                            ? t("spot.starting")
                            : t("spot.startRound")}
                        </button>
                        {!canStartRound ? (
                          <p className="self-center text-sm text-stone-500">
                            {t("spot.waitingPlayers")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : currentRound.status === "pending" ? (
                  <div className="space-y-4">
                    <div className="glass-tile rounded-[28px] p-5 sm:p-6">
                      <h3 className="mt-4 max-w-3xl text-3xl leading-tight text-stone-100">
                        {currentRound.promptText}
                      </h3>
                    </div>

                    {!isParticipant ? (
                      <div className="rounded-2xl border border-amber-200/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                        {t("spot.joinedMidRound")}
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {participantPlayers.map((player) => {
                        const selected = currentVoteTargetId === player.id;

                        return (
                          <SpotlightButton
                            disabled={!canVote || busyAction === player.id}
                            key={player.id}
                            label={player.nickname}
                            onClick={() => handleVote(player.id)}
                            selected={selected}
                            subtitle={
                              selected
                                ? t("spot.yourVote")
                                : t("spot.tapToVote")
                            }
                          />
                        );
                      })}
                    </div>

                    <div className="glass-tile rounded-[24px] p-4 text-sm text-stone-300">
                      {t("spot.submittedVotes", {
                        count: currentRound.submittedCount,
                        total: currentRound.participantCount,
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="glass-tile rounded-[28px] p-5 sm:p-6">
                      <h3 className="mt-4 text-2xl font-semibold text-stone-100">
                        {resultTitle()}
                      </h3>
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-300">
                        {currentRound.promptText}
                      </p>
                    </div>

                    <div className="glass-tile rounded-[24px] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("spot.revealedVotes")}
                        </p>
                        <p className="text-sm text-stone-400">
                          {currentRound.revealedVotes.length}
                        </p>
                      </div>

                      <div className="mt-4 space-y-3">
                        {currentRound.revealedVotes.map((vote) => (
                          <div
                            className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3 text-sm text-stone-300"
                            key={vote.voterPlayerId}
                          >
                            <span className="font-medium text-stone-100">
                              {vote.voterNickname}
                            </span>{" "}
                            {t("spot.votedFor")}{" "}
                            <span className="font-medium text-stone-100">
                              {vote.targetNickname}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                        disabled={!canStartRound || busyAction === "start"}
                        onClick={handleStartRound}
                        type="button"
                      >
                        {busyAction === "start"
                          ? t("spot.opening")
                          : t("spot.nextRound")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {promptLoadError ? (
              <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {promptLoadError}
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
                  {t("spot.players")}
                </p>
                <p className="text-sm text-stone-400">
                  {snapshot?.playerCount ?? 0}/8
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {snapshot?.players.map((player) => (
                  <div
                    className={`glass-tile rounded-2xl border px-4 py-3 ${
                      currentVoteTargetId === player.id
                        ? "border-emerald-300/45 bg-emerald-300/10"
                        : "border-white/8"
                    }`}
                    key={player.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            className="truncate text-left font-medium text-stone-100 transition hover:text-white"
                            onClick={() => setCardsDialogPlayerId(player.id)}
                            type="button"
                          >
                            {player.nickname}
                          </button>
                          {player.isHost ? (
                            <span className="text-xs font-medium uppercase tracking-[0.24em] text-stone-500">
                              H
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-stone-500">
                          {playerStatus(player)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-semibold leading-none text-stone-100">
                          {player.score}
                        </p>
                        <button
                          className="mt-1 text-[11px] uppercase tracking-[0.22em] text-stone-500 transition hover:text-stone-300"
                          onClick={() => setCardsDialogPlayerId(player.id)}
                          type="button"
                        >
                          {t("spot.viewWonCards")}
                        </button>
                      </div>
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
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{resultTitle()}</DialogTitle>
                <DialogDescription>
                  {currentRound?.promptText ?? ""}
                </DialogDescription>
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
            <div className="mt-5 space-y-3">
              {currentRound.revealedVotes.map((vote) => (
                <div
                  className="glass-tile rounded-2xl px-4 py-3 text-sm text-stone-300"
                  key={vote.voterPlayerId}
                >
                  <span className="font-medium text-stone-100">
                    {vote.voterNickname}
                  </span>{" "}
                  {t("spot.votedFor")}{" "}
                  <span className="font-medium text-stone-100">
                    {vote.targetNickname}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <DialogFooter>
            {canStartRound ? (
              <button
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                disabled={busyAction === "start"}
                onClick={handleStartRound}
                type="button"
              >
                {busyAction === "start"
                  ? t("spot.opening")
                  : t("spot.nextRound")}
              </button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setCardsDialogPlayerId(null);
          }
        }}
        open={!!cardsDialogPlayer}
      >
        <DialogContent>
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>
                  {t("spot.wonCardsTitle", {
                    name: cardsDialogPlayer?.nickname ?? "",
                  })}
                </DialogTitle>
                <DialogDescription>
                  {t("spot.wonCardsSubtitle", {
                    count: cardsDialogPlayer?.wonPrompts.length ?? 0,
                  })}
                </DialogDescription>
              </div>

              <button
                aria-label={t("common.close")}
                className="rounded-full border border-white/10 p-2 text-stone-300 transition hover:border-white/20 hover:text-stone-100"
                onClick={() => setCardsDialogPlayerId(null)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
          </DialogHeader>

          {cardsDialogPlayer?.wonPrompts.length ? (
            <div className="mt-5 space-y-3">
              {cardsDialogPlayer.wonPrompts.map((prompt, index) => (
                <div
                  className="glass-tile rounded-2xl border border-white/8 px-4 py-4"
                  key={`${prompt.promptId ?? "custom"}-${prompt.roundNumber}-${index}`}
                >
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-stone-500">
                    <Trophy className="size-3.5" />
                    <span>{t("spot.cardFromRound", { round: prompt.roundNumber })}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-stone-100">
                    {prompt.promptText}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-stone-300">
              {t("spot.noWonCards")}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function SpotRoomFallback() {
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

export function SpotRoom() {
  return (
    <Suspense fallback={<SpotRoomFallback />}>
      <SpotRoomContent />
    </Suspense>
  );
}
