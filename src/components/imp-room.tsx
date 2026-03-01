"use client";

import Link from "next/link";
import { Check, Crown, Share2 } from "lucide-react";
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
import { getSavedNickname, saveNickname } from "@/lib/rps";
import {
  advanceImpRound,
  createImpRoom,
  getImpRoomSnapshot,
  joinImpRoom,
  loadImpCategories,
  loadImpRoomSession,
  saveImpRoomSession,
  startImpMatch,
  submitImpClue,
  submitImpVote,
  type ImpCategory,
  type ImpPlayer,
  type ImpRoomSession,
  type ImpSnapshot,
} from "@/lib/imp";
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

function PlayerPickCard({
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
  return (
    <button
      className={`glass-tile rounded-[24px] border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "border-amber-300/80 bg-amber-300/14 text-stone-50 shadow-[0_0_0_1px_rgba(252,211,77,0.28),0_18px_40px_rgba(245,158,11,0.14)]"
          : "border-white/10 bg-white/[0.04] text-stone-100 hover:border-white/24 hover:bg-white/[0.08]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-inherit">{label}</p>
          {subtitle ? (
            <p className={`mt-1 text-sm ${selected ? "text-amber-100" : "text-stone-400"}`}>
              {subtitle}
            </p>
          ) : null}
        </div>

        <span
          className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${
            selected
              ? "border-amber-200/70 bg-amber-200/20 text-amber-100"
              : "border-white/12 bg-black/20 text-stone-500"
          }`}
        >
          <Check className="size-4" />
        </span>
      </div>
    </button>
  );
}

function ImpRoomContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room") ?? "");

  const [nickname, setNickname] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [session, setSession] = useState<ImpRoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<ImpSnapshot | null>(null);
  const [categories, setCategories] = useState<ImpCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [clueDraft, setClueDraft] = useState("");
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">(
    "idle",
  );

  async function loadSnapshot(activeSession: ImpRoomSession) {
    try {
      const data = await getImpRoomSnapshot(activeSession);
      setSnapshot(data);
      setError(null);
    } catch (snapshotError) {
      setSnapshot(null);
      setError(
        snapshotError instanceof Error
          ? snapshotError.message
          : t("imp.loadRoomError"),
      );
    }
  }

  useEffect(() => {
    setNickname((current) => current || getSavedNickname());
  }, []);

  useEffect(() => {
    let ignore = false;

    void loadImpCategories()
      .then((data) => {
        if (ignore) {
          return;
        }

        setCategories(data);
        setSelectedCategoryId((current) => current || data[0]?.id || "");
        setCategoriesError(null);
      })
      .catch((loadError) => {
        if (ignore) {
          return;
        }

        setCategoriesError(
          loadError instanceof Error
            ? loadError.message
            : t("imp.categoriesLoadError"),
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

    setSession(loadImpRoomSession(roomCode));
  }, [roomCode]);

  const refreshSnapshot = useEffectEvent((activeSession: ImpRoomSession) => {
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
      .channel(`imp-room-${snapshot.roomId}`)
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
          table: "imp_matches",
        },
        syncRoom,
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [session, snapshot?.roomId]);

  async function handleCreateRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("imp.nicknameBeforeCreate"));
      return;
    }

    setBusyAction("create");
    setError(null);

    try {
      const nextSession = await createImpRoom(trimmedName);
      saveNickname(trimmedName);
      saveImpRoomSession(nextSession);
      setSession(nextSession);
      setShareState("idle");

      startTransition(() => {
        router.replace(`${pathname}?room=${nextSession.roomCode}`);
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("imp.createRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleJoinRoom() {
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setError(t("imp.nicknameBeforeJoin"));
      return;
    }

    if (!roomCode) {
      setError(t("imp.roomCodeMissing"));
      return;
    }

    setBusyAction("join");
    setError(null);

    try {
      const nextSession = await joinImpRoom(roomCode, trimmedName);
      saveNickname(trimmedName);
      saveImpRoomSession(nextSession);
      setSession(nextSession);
      await loadSnapshot(nextSession);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : t("imp.joinRoomError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartMatch() {
    if (!session) {
      setError(t("imp.firstEnterRoom"));
      return;
    }

    const selectedCategory =
      categories.find((category) => category.id === selectedCategoryId) ?? null;

    if (!selectedCategory) {
      setError(categoriesError ?? t("imp.categoryMissing"));
      return;
    }

    setBusyAction("start");
    setError(null);

    try {
      await startImpMatch(session, selectedCategory);
      setClueDraft("");
      await loadSnapshot(session);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : t("imp.startMatchError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitClue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      setError(t("imp.firstEnterRoom"));
      return;
    }

    const trimmedClue = clueDraft.trim();

    if (!trimmedClue) {
      setError(t("imp.clueMissing"));
      return;
    }

    setBusyAction("clue");
    setError(null);

    try {
      await submitImpClue(session, trimmedClue);
      setClueDraft("");
      await loadSnapshot(session);
    } catch (clueError) {
      setError(
        clueError instanceof Error ? clueError.message : t("imp.clueError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVote(targetPlayerId: string) {
    if (!session) {
      setError(t("imp.firstEnterRoom"));
      return;
    }

    setBusyAction(targetPlayerId);
    setError(null);

    try {
      await submitImpVote(session, targetPlayerId);
      await loadSnapshot(session);
    } catch (voteError) {
      setError(
        voteError instanceof Error ? voteError.message : t("imp.voteError"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAdvanceRound() {
    if (!session) {
      setError(t("imp.firstEnterRoom"));
      return;
    }

    setBusyAction("advance");
    setError(null);

    try {
      await advanceImpRound(session);
      setClueDraft("");
      await loadSnapshot(session);
    } catch (advanceError) {
      setError(
        advanceError instanceof Error
          ? advanceError.message
          : t("imp.advanceRoundError"),
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
          text: t("imp.shareText"),
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
      setError(t("imp.invalidRoomCode"));
      return;
    }

    startTransition(() => {
      router.push(`${pathname}?room=${normalized}`);
    });
  }

  const currentMatch = snapshot?.currentMatch ?? null;
  const selfPlayer =
    snapshot?.players.find((player) => player.id === session?.playerId) ?? null;
  const isHost = !!selfPlayer?.isHost;
  const participantPlayers =
    snapshot?.players.filter((player) => player.isInMatch) ?? [];
  const activePlayers = participantPlayers.filter((player) => !player.isEliminated);
  const orderedTurnPlayers =
    currentMatch?.turnOrderPlayerIds
      .map((playerId) =>
        participantPlayers.find((player) => player.id === playerId) ?? null,
      )
      .filter((player): player is ImpPlayer => player !== null) ?? [];
  const isInMatch = !!selfPlayer?.isInMatch;
  const isEliminated = !!selfPlayer?.isEliminated;
  const isSpectator = !!currentMatch && !isInMatch;
  const selectedVoteTargetId = currentMatch?.selfVoteTargetPlayerId ?? null;
  const canStartMatch =
    !!session &&
    isHost &&
    categories.length > 0 &&
    !categoriesError &&
    (snapshot?.playerCount ?? 0) >= 3 &&
    (!currentMatch || currentMatch.phase === "finished");
  const canSubmitClue =
    !!session &&
    !!currentMatch &&
    currentMatch.phase === "clue" &&
    currentMatch.currentTurnPlayerId === session.playerId &&
    isInMatch &&
    !isEliminated;
  const canVote =
    !!session &&
    !!currentMatch &&
    currentMatch.phase === "vote" &&
    isInMatch &&
    !isEliminated;
  const canAdvanceRound =
    !!session && isHost && !!currentMatch && currentMatch.phase === "revealed";
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? null;

  function roleCardTitle() {
    if (!currentMatch || !isInMatch) {
      return t("imp.waitingMatch");
    }

    return currentMatch.selfRole === "impostor"
      ? t("imp.roleImpostor")
      : t("imp.roleCivilian");
  }

  function roleCardValue() {
    if (!currentMatch || !isInMatch) {
      return t("imp.spectating");
    }

    return currentMatch.selfWord ?? t("imp.spectating");
  }

  function resultSummary() {
    if (!currentMatch) {
      return "";
    }

    if (currentMatch.phase === "finished") {
      return currentMatch.winnerTeam === "crew"
        ? t("imp.crewWin")
        : t("imp.impostorWin");
    }

    if (currentMatch.eliminatedNickname) {
      return t("imp.eliminatedPlayer", {
        name: currentMatch.eliminatedNickname,
      });
    }

    if (currentMatch.voteTiedNicknames.length > 0) {
      return t("imp.tieResult", {
        names: currentMatch.voteTiedNicknames.join(", "),
      });
    }

    return "";
  }

  function playerTag(player: ImpPlayer) {
    if (!player.isInMatch) {
      return t("imp.playerWaiting");
    }

    if (player.isEliminated) {
      return t("imp.playerEliminated");
    }

    return t("imp.playerActive");
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
              {t("games.imp.title")}
            </h1>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="glass-panel rounded-[28px] p-5 sm:p-6">
            {!isSupabaseConfigured() ? (
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
                  {t("imp.pendingConfig")}
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-3xl">
                  {t("imp.connectSupabase")}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  {t("imp.missingSupabase")}
                </p>
                <div className="glass-tile rounded-[28px] p-4 text-sm text-stone-300">
                  <p>{t("imp.setupStep1")}</p>
                  <p>{t("imp.setupStep2")}</p>
                  <p>{t("imp.setupStep3")}</p>
                  <p>{t("imp.setupStep4")}</p>
                </div>
              </div>
            ) : !roomCode ? (
              <div className="space-y-8">
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  {t("imp.createRoom")}
                </h2>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("imp.yourNickname")}
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
                      ? t("imp.creating")
                      : t("imp.createRoom")}
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
                    placeholder={t("imp.roomCodePlaceholder")}
                    value={manualCode}
                  />
                  <button
                    className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-white/20"
                    type="submit"
                  >
                    {t("imp.join")}
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
                    {t("imp.join")}
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                  <label className="space-y-2">
                    <input
                      className="glass-tile w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={t("imp.yourNickname")}
                      value={nickname}
                    />
                  </label>

                  <button
                    className="rounded-2xl bg-white px-6 py-3 font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                    disabled={busyAction === "join"}
                    onClick={handleJoinRoom}
                    type="button"
                  >
                    {busyAction === "join" ? t("imp.entering") : t("imp.enterRoom")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-[family-name:var(--font-display)] text-2xl">
                      {currentMatch
                        ? t("imp.round", { round: currentMatch.roundNumber })
                        : t("games.imp.title")}
                    </h2>
                    <p className="mt-2 text-sm text-stone-400">
                      {currentMatch
                        ? t(`imp.phases.${currentMatch.phase}`)
                        : t("imp.waitingMatch")}
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

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="glass-tile rounded-[24px] p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                      {roleCardTitle()}
                    </p>
                    <h3 className="mt-4 text-3xl leading-tight text-stone-100">
                      {roleCardValue()}
                    </h3>
                    {currentMatch ? (
                      <p className="mt-4 text-sm text-stone-400">
                        {currentMatch.categoryLabel}
                      </p>
                    ) : null}
                  </div>

                  <div className="glass-tile rounded-[24px] p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                      {t("imp.turnOrder")}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {orderedTurnPlayers.map((player, index) => (
                        <span
                          className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.18em] ${
                            currentMatch?.currentTurnPlayerId === player.id
                              ? "border-amber-300/60 bg-amber-300/14 text-amber-100"
                              : player.isEliminated
                                ? "border-white/6 bg-black/20 text-stone-600"
                                : "border-white/10 bg-white/[0.04] text-stone-300"
                          }`}
                          key={player.id}
                        >
                          {String(index + 1).padStart(2, "0")} {player.nickname}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {!currentMatch || currentMatch.phase === "finished" ? (
                  <div className="space-y-4">
                    {currentMatch?.phase === "finished" ? (
                      <div className="glass-tile rounded-[24px] p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("imp.result")}
                        </p>
                        <h3 className="mt-4 text-2xl font-semibold text-stone-100">
                          {resultSummary()}
                        </h3>
                        <p className="mt-3 text-sm text-stone-300">
                          {t("imp.finalReveal", {
                            impostor: currentMatch.impostorNickname ?? "",
                            word: currentMatch.revealedWord ?? "",
                          })}
                        </p>
                      </div>
                    ) : null}

                    {isHost ? (
                      <div className="glass-tile rounded-[24px] p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("imp.chooseCategory")}
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {categories.map((category) => (
                            <button
                              className={`rounded-[22px] border px-4 py-4 text-left transition ${
                                category.id === selectedCategoryId
                                  ? "border-sky-300/65 bg-sky-300/14 text-sky-100"
                                  : "border-white/10 bg-white/[0.03] text-stone-100 hover:border-white/20"
                              }`}
                              key={category.id}
                              onClick={() => setSelectedCategoryId(category.id)}
                              type="button"
                            >
                              <p className="font-medium">{category.label}</p>
                              <p className="mt-1 text-sm text-stone-400">
                                {t("imp.wordsCount", {
                                  count: category.words.length,
                                })}
                              </p>
                            </button>
                          ))}
                        </div>

                        <div className="mt-6 flex flex-wrap items-center gap-3">
                          <button
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                            disabled={!canStartMatch || busyAction === "start"}
                            onClick={handleStartMatch}
                            type="button"
                          >
                            {busyAction === "start"
                              ? t("imp.starting")
                              : currentMatch
                                ? t("imp.newMatch")
                                : t("imp.startMatch")}
                          </button>

                          {selectedCategory ? (
                            <p className="text-sm text-stone-400">
                              {selectedCategory.label}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="glass-tile rounded-[24px] p-5 text-sm text-stone-300">
                        {t("imp.waitingHost")}
                      </div>
                    )}
                  </div>
                ) : currentMatch.phase === "clue" ? (
                  <div className="space-y-4">
                    <div className="glass-tile rounded-[24px] p-5">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                        {t("imp.currentTurn")}
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold text-stone-100">
                        {currentMatch.currentTurnNickname ?? t("imp.waitingTurn")}
                      </h3>
                      <p className="mt-3 text-sm text-stone-400">
                        {t("imp.activePlayers", {
                          count: currentMatch.activePlayerCount,
                        })}
                      </p>
                    </div>

                    <div className="glass-tile rounded-[24px] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("imp.clues")}
                        </p>
                        <p className="text-sm text-stone-400">
                          {currentMatch.clues.length}/{currentMatch.activePlayerCount}
                        </p>
                      </div>

                      <div className="mt-4 space-y-3">
                        {currentMatch.clues.map((clue) => (
                          <div
                            className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3"
                            key={`${clue.playerId}-${clue.turnIndex}`}
                          >
                            <p className="text-sm text-stone-400">{clue.nickname}</p>
                            <p className="mt-1 text-base text-stone-100">
                              {clue.clueText}
                            </p>
                          </div>
                        ))}

                        {currentMatch.clues.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/12 px-4 py-5 text-sm text-stone-400">
                            {t("imp.noCluesYet")}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {canSubmitClue ? (
                      <form
                        className="glass-tile rounded-[24px] p-5"
                        onSubmit={handleSubmitClue}
                      >
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("imp.yourClue")}
                        </p>
                        <textarea
                          className="glass-tile mt-4 min-h-28 w-full rounded-2xl px-4 py-3 text-base outline-none transition focus:border-white/20"
                          maxLength={80}
                          onChange={(event) => setClueDraft(event.target.value)}
                          placeholder={t("imp.cluePlaceholder")}
                          value={clueDraft}
                        />
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <p className="text-sm text-stone-400">
                            {clueDraft.trim().length}/80
                          </p>
                          <button
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                            disabled={busyAction === "clue"}
                            type="submit"
                          >
                            {busyAction === "clue"
                              ? t("imp.sendingClue")
                              : t("imp.sendClue")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="glass-tile rounded-[24px] p-5 text-sm text-stone-300">
                        {isSpectator
                          ? t("imp.spectatorCurrentMatch")
                          : isEliminated
                            ? t("imp.eliminatedWaiting")
                            : t("imp.waitingTurn")}
                      </div>
                    )}
                  </div>
                ) : currentMatch.phase === "vote" ? (
                  <div className="space-y-4">
                    <div className="glass-tile rounded-[24px] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {t("imp.clues")}
                        </p>
                        <p className="text-sm text-stone-400">
                          {currentMatch.submittedVotePlayerIds.length}/{currentMatch.activePlayerCount}
                        </p>
                      </div>

                      <div className="mt-4 space-y-3">
                        {currentMatch.clues.map((clue) => (
                          <div
                            className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3"
                            key={`${clue.playerId}-${clue.turnIndex}`}
                          >
                            <p className="text-sm text-stone-400">{clue.nickname}</p>
                            <p className="mt-1 text-base text-stone-100">
                              {clue.clueText}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {activePlayers.map((player) => (
                        <PlayerPickCard
                          disabled={!canVote || busyAction === player.id}
                          key={player.id}
                          label={player.nickname}
                          onClick={() => handleVote(player.id)}
                          selected={selectedVoteTargetId === player.id}
                          subtitle={
                            selectedVoteTargetId === player.id
                              ? t("imp.yourVote")
                              : t("imp.tapToVote")
                          }
                        />
                      ))}
                    </div>

                    {!canVote ? (
                      <div className="glass-tile rounded-[24px] p-5 text-sm text-stone-300">
                        {isSpectator
                          ? t("imp.spectatorCurrentMatch")
                          : isEliminated
                            ? t("imp.eliminatedWaiting")
                            : t("imp.voteLocked")}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="glass-tile rounded-[24px] p-5">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                        {t("imp.result")}
                      </p>
                      <h3 className="mt-4 text-2xl font-semibold text-stone-100">
                        {resultSummary()}
                      </h3>
                      {currentMatch.phase === "finished" ? (
                        <p className="mt-3 text-sm text-stone-300">
                          {t("imp.finalReveal", {
                            impostor: currentMatch.impostorNickname ?? "",
                            word: currentMatch.revealedWord ?? "",
                          })}
                        </p>
                      ) : null}
                    </div>

                    <div className="glass-tile rounded-[24px] p-5">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                        {t("imp.revealedVotes")}
                      </p>
                      <div className="mt-4 space-y-3">
                        {currentMatch.revealedVotes.map((vote) => (
                          <div
                            className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3 text-sm text-stone-300"
                            key={vote.voterPlayerId}
                          >
                            <span className="font-medium text-stone-100">
                              {vote.voterNickname}
                            </span>{" "}
                            {t("imp.votedFor")}{" "}
                            <span className="font-medium text-stone-100">
                              {vote.targetNickname}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {currentMatch.phase === "revealed" ? (
                      <div className="flex justify-end">
                        {canAdvanceRound ? (
                          <button
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-white/40"
                            disabled={busyAction === "advance"}
                            onClick={handleAdvanceRound}
                            type="button"
                          >
                            {busyAction === "advance"
                              ? t("imp.opening")
                              : t("imp.nextRound")}
                          </button>
                        ) : (
                          <div className="glass-tile rounded-2xl px-4 py-3 text-sm text-stone-300">
                            {t("imp.waitingHostAdvance")}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {categoriesError ? (
              <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {categoriesError}
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
                  {t("imp.players")}
                </p>
                <p className="text-sm text-stone-400">
                  {snapshot?.playerCount ?? 0}/8
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {snapshot?.players.map((player) => (
                  <div
                    className={`glass-tile rounded-2xl border px-4 py-3 ${
                      currentMatch?.currentTurnPlayerId === player.id
                        ? "border-amber-300/45 bg-amber-300/10"
                        : player.isEliminated
                          ? "border-white/6 opacity-55"
                          : "border-white/8"
                    }`}
                    key={player.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-stone-100">
                            {player.nickname}
                          </p>
                          {player.isHost ? (
                            <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.22em] text-stone-500">
                              <Crown className="size-3" />
                              H
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-stone-500">
                          {playerTag(player)}
                        </p>
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
              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-stone-500">
                {t("imp.minimumPlayers")}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ImpRoomFallback() {
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

export function ImpRoom() {
  return (
    <Suspense fallback={<ImpRoomFallback />}>
      <ImpRoomContent />
    </Suspense>
  );
}
