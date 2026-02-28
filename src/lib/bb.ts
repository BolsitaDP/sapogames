import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type BluffColor = "red" | "blue" | "green" | "yellow";

export type BbRoomSession = {
  nickname: string;
  playerId: string;
  playerSecret: string;
  roomCode: string;
};

export type BbPlayer = {
  id: string;
  isEliminated: boolean;
  isHost: boolean;
  joinedAt: string;
  livesRemaining: number;
  nickname: string;
};

export type BbHandView = {
  cardCount: number;
  cards: string[];
  isSelf: boolean;
  nickname: string;
  playerId: string;
};

export type BbSnapshot = {
  createdAt: string;
  currentRound: {
    challengeResult: "caught" | "failed" | "escaped" | null;
    challengerNickname: string | null;
    currentPlayerId: string;
    currentPlayerNickname: string;
    handCards: BluffColor[];
    hands: BbHandView[];
    id: string;
    lastPlayCount: number;
    lastPlayPlayerId: string | null;
    lastPlayPlayerNickname: string | null;
    loserNickname: string | null;
    loserPlayerId: string | null;
    pileCount: number;
    revealedCards: BluffColor[];
    roundNumber: number;
    status: "pending" | "revealed";
    targetColor: BluffColor;
    winnerNickname: string | null;
  } | null;
  gameSlug: "bb";
  playerCount: number;
  players: BbPlayer[];
  roomCode: string;
  roomId: string;
  roomStatus: "waiting" | "playing" | "finished";
};

type RpcResponse = Record<string, unknown> | null;

const ROOM_RPC = {
  challenge: "challenge_bb_play",
  create: "create_bb_room",
  join: "join_bb_room",
  play: "play_bb_cards",
  snapshot: "get_bb_room_snapshot",
  start: "start_next_bb_round",
} as const;

const STORAGE_KEYS = {
  sessionPrefix: "sapogames:bb:session:",
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

export function loadBbRoomSession(roomCode: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(sessionKey(roomCode));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as BbRoomSession;
  } catch {
    window.localStorage.removeItem(sessionKey(roomCode));
    return null;
  }
}

export function saveBbRoomSession(session: BbRoomSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(sessionKey(session.roomCode), JSON.stringify(session));
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
  } satisfies BbRoomSession;
}

export async function createBbRoom(nickname: string) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.create, {
    host_nickname: nickname.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRoomSession(data as RpcResponse);
}

export async function joinBbRoom(roomCode: string, nickname: string) {
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

export async function startBbRound(session: BbRoomSession) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.start, {
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function playBbCards(
  session: BbRoomSession,
  cardIndexes: number[],
) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.play, {
    card_indexes_input: cardIndexes,
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function challengeBbPlay(session: BbRoomSession) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.challenge, {
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getBbRoomSnapshot(session: BbRoomSession) {
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

  return data as BbSnapshot;
}
