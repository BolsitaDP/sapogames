import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type BjRoomSession = {
  nickname: string;
  playerId: string;
  playerSecret: string;
  roomCode: string;
};

export type BjPlayer = {
  id: string;
  isHost: boolean;
  joinedAt: string;
  nickname: string;
  score?: number;
};

export type BjHand = {
  cards: string[];
  nickname: string;
  outcome: "win" | "lose" | "push" | null;
  playerId: string;
  total: number;
  turnStatus: "active" | "stood" | "bust" | "blackjack";
};

export type BjCurrentRound = {
  activePlayerCount: number;
  dealerCards: string[];
  dealerTotal: number | null;
  id: string;
  playerHands: BjHand[];
  roundNumber: number;
  status: "player_turn" | "dealer_turn" | "revealed";
};

export type BjSnapshot = {
  createdAt: string;
  currentRound: BjCurrentRound | null;
  gameSlug: "bj";
  playerCount: number;
  players: BjPlayer[];
  roomCode: string;
  roomId: string;
  roomStatus: "waiting" | "playing" | "finished";
};

type RpcResponse = Record<string, unknown> | null;

const ROOM_RPC = {
  create: "create_bj_room",
  join: "join_bj_room",
  nextRound: "start_next_bj_round",
  snapshot: "get_bj_room_snapshot",
  submitAction: "submit_bj_action",
} as const;

const STORAGE_KEYS = {
  sessionPrefix: "sapogames:bj:session:",
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

export function loadBjRoomSession(roomCode: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(sessionKey(roomCode));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as BjRoomSession;
  } catch {
    window.localStorage.removeItem(sessionKey(roomCode));
    return null;
  }
}

export function saveBjRoomSession(session: BjRoomSession) {
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
  } satisfies BjRoomSession;
}

export async function createBjRoom(nickname: string) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.create, {
    host_nickname: nickname.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRoomSession(data as RpcResponse);
}

export async function joinBjRoom(roomCode: string, nickname: string) {
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

export async function getBjRoomSnapshot(roomCode: string) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.snapshot, {
    room_code_input: roomCode.trim().toUpperCase(),
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No se pudo cargar la sala.");
  }

  return data as BjSnapshot;
}

export async function submitBjAction(
  session: BjRoomSession,
  action: "hit" | "stand",
) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.submitAction, {
    action_input: action,
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function startNextBjRound(session: BjRoomSession) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.nextRound, {
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}
