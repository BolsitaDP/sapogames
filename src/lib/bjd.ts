import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type BjdRoomSession = {
  nickname: string;
  playerId: string;
  playerSecret: string;
  roomCode: string;
};

export type BjdPlayer = {
  id: string;
  isHost: boolean;
  joinedAt: string;
  nickname: string;
  score?: number;
};

export type BjdHand = {
  cardCount: number;
  cards: string[];
  isSelf: boolean;
  nickname: string;
  outcome: "win" | "lose" | "push" | null;
  playerId: string;
  revealed: boolean;
  total: number | null;
  turnStatus: "active" | "stood" | "bust" | "blackjack";
};

export type BjdSnapshot = {
  createdAt: string;
  currentRound: {
    activePlayerCount: number;
    id: string;
    playerHands: BjdHand[];
    roundNumber: number;
    status: "pending" | "revealed";
  } | null;
  gameSlug: "bjd";
  playerCount: number;
  players: BjdPlayer[];
  roomCode: string;
  roomId: string;
  roomStatus: "waiting" | "playing" | "finished";
};

type RpcResponse = Record<string, unknown> | null;

const ROOM_RPC = {
  create: "create_bjd_room",
  join: "join_bjd_room",
  nextRound: "start_next_bjd_round",
  snapshot: "get_bjd_room_snapshot",
  submitAction: "submit_bjd_action",
} as const;

const STORAGE_KEYS = {
  sessionPrefix: "sapogames:bjd:session:",
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

export function loadBjdRoomSession(roomCode: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(sessionKey(roomCode));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as BjdRoomSession;
  } catch {
    window.localStorage.removeItem(sessionKey(roomCode));
    return null;
  }
}

export function saveBjdRoomSession(session: BjdRoomSession) {
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
  } satisfies BjdRoomSession;
}

export async function createBjdRoom(nickname: string) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.create, {
    host_nickname: nickname.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRoomSession(data as RpcResponse);
}

export async function joinBjdRoom(roomCode: string, nickname: string) {
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

export async function getBjdRoomSnapshot(session: BjdRoomSession) {
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

  return data as BjdSnapshot;
}

export async function submitBjdAction(
  session: BjdRoomSession,
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

export async function startNextBjdRound(session: BjdRoomSession) {
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
