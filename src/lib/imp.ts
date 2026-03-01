import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ImpRoomSession = {
  nickname: string;
  playerId: string;
  playerSecret: string;
  roomCode: string;
};

export type ImpCategory = {
  id: string;
  label: string;
  words: string[];
};

export type ImpPlayer = {
  id: string;
  isEliminated: boolean;
  isHost: boolean;
  isInMatch: boolean;
  joinedAt: string;
  nickname: string;
};

export type ImpClue = {
  clueText: string;
  nickname: string;
  playerId: string;
  turnIndex: number;
};

export type ImpRevealedVote = {
  targetNickname: string;
  targetPlayerId: string;
  voterNickname: string;
  voterPlayerId: string;
};

export type ImpSnapshot = {
  createdAt: string;
  currentMatch: {
    activePlayerCount: number;
    categoryId: string;
    categoryLabel: string;
    clues: ImpClue[];
    currentTurnNickname: string | null;
    currentTurnPlayerId: string | null;
    eliminatedNickname: string | null;
    eliminatedPlayerId: string | null;
    id: string;
    impostorNickname: string | null;
    impostorPlayerId: string | null;
    matchNumber: number;
    participantPlayerIds: string[];
    phase: "clue" | "vote" | "revealed" | "finished";
    revealedVotes: ImpRevealedVote[];
    revealedWord: string | null;
    roundNumber: number;
    selfRole: "civilian" | "impostor" | null;
    selfVoteTargetPlayerId: string | null;
    selfWord: string | null;
    submittedCluePlayerIds: string[];
    submittedVotePlayerIds: string[];
    turnOrderPlayerIds: string[];
    voteTiedNicknames: string[];
    voteTiedPlayerIds: string[];
    winnerTeam: "crew" | "impostor" | null;
  } | null;
  gameSlug: "imp";
  playerCount: number;
  players: ImpPlayer[];
  roomCode: string;
  roomId: string;
  roomStatus: "waiting" | "playing" | "finished";
};

type ImpCategoriesFile = {
  categories: ImpCategory[];
  version: number;
};

type RpcResponse = Record<string, unknown> | null;

const ROOM_RPC = {
  advance: "advance_imp_round",
  clue: "submit_imp_clue",
  create: "create_imp_room",
  join: "join_imp_room",
  snapshot: "get_imp_room_snapshot",
  start: "start_imp_match",
  vote: "submit_imp_vote",
} as const;

const STORAGE_KEYS = {
  sessionPrefix: "sapogames:imp:session:",
} as const;

function requireClient() {
  const client = getSupabaseBrowserClient();

  if (!client) {
    throw new Error(
      "Falta configurar Supabase. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return client;
}

function sessionKey(roomCode: string) {
  return `${STORAGE_KEYS.sessionPrefix}${roomCode.toUpperCase()}`;
}

function parseRoomSession(data: RpcResponse) {
  if (!data) {
    throw new Error("Supabase devolvio una respuesta vacia.");
  }

  const roomCode = String(data.roomCode ?? "");
  const playerId = String(data.playerId ?? "");
  const playerSecret = String(data.playerSecret ?? "");
  const nickname = String(data.nickname ?? "");

  if (!roomCode || !playerId || !playerSecret || !nickname) {
    throw new Error("La respuesta del backend no trae la sesion esperada.");
  }

  return {
    nickname,
    playerId,
    playerSecret,
    roomCode,
  } satisfies ImpRoomSession;
}

function categoriesUrl() {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  return `${basePath}/game-content/impostor-categories.json`;
}

export function loadImpRoomSession(roomCode: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(sessionKey(roomCode));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ImpRoomSession;
  } catch {
    window.localStorage.removeItem(sessionKey(roomCode));
    return null;
  }
}

export function saveImpRoomSession(session: ImpRoomSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(sessionKey(session.roomCode), JSON.stringify(session));
}

export async function loadImpCategories() {
  const response = await fetch(categoriesUrl(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error("No se pudo cargar el archivo de categorias.");
  }

  const data = (await response.json()) as ImpCategoriesFile;

  if (!Array.isArray(data.categories)) {
    throw new Error("El archivo de categorias no tiene el formato esperado.");
  }

  const categories = data.categories.filter((category) => {
    return (
      typeof category?.id === "string" &&
      category.id.trim() !== "" &&
      typeof category?.label === "string" &&
      category.label.trim() !== "" &&
      Array.isArray(category?.words) &&
      category.words.some((word) => typeof word === "string" && word.trim() !== "")
    );
  });

  if (categories.length === 0) {
    throw new Error("El archivo de categorias no tiene entradas validas.");
  }

  return categories.map((category) => ({
    id: category.id.trim(),
    label: category.label.trim(),
    words: category.words
      .filter((word) => typeof word === "string" && word.trim() !== "")
      .map((word) => word.trim()),
  }));
}

export async function createImpRoom(nickname: string) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.create, {
    host_nickname: nickname.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRoomSession(data as RpcResponse);
}

export async function joinImpRoom(roomCode: string, nickname: string) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.join, {
    player_nickname: nickname.trim(),
    room_code_input: roomCode.trim().toUpperCase(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRoomSession(data as RpcResponse);
}

export async function startImpMatch(
  session: ImpRoomSession,
  category: ImpCategory,
) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.start, {
    category_id_input: category.id,
    category_label_input: category.label,
    category_words_input: category.words,
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function submitImpClue(
  session: ImpRoomSession,
  clueText: string,
) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.clue, {
    clue_text_input: clueText,
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function submitImpVote(
  session: ImpRoomSession,
  targetPlayerId: string,
) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.vote, {
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
    target_player_id_input: targetPlayerId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function advanceImpRound(session: ImpRoomSession) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.advance, {
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getImpRoomSnapshot(session: ImpRoomSession) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.snapshot, {
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode.trim().toUpperCase(),
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No se pudo cargar la sala.");
  }

  return data as ImpSnapshot;
}
