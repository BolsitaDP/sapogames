import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type TttCellValue = "" | "X" | "O";

export type TttRoomSession = {
  nickname: string;
  playerId: string;
  playerSecret: string;
  roomCode: string;
};

export type TttPlayer = {
  id: string;
  isHost: boolean;
  joinedAt: string;
  nickname: string;
  score?: number;
};

export type TttSnapshot = {
  createdAt: string;
  currentRound: {
    board: TttCellValue[];
    id: string;
    moveCount: number;
    nextPlayerId: string | null;
    nextPlayerNickname: string | null;
    roundNumber: number;
    startingPlayerId: string;
    status: "pending" | "revealed";
    winnerNickname: string | null;
    winnerPlayerId: string | null;
  };
  gameSlug: "ttt";
  playerCount: number;
  players: TttPlayer[];
  roomCode: string;
  roomId: string;
  roomStatus: "waiting" | "playing" | "finished";
};

type RpcResponse = Record<string, unknown> | null;

const ROOM_RPC = {
  create: "create_ttt_room",
  join: "join_ttt_room",
  nextRound: "start_next_ttt_round",
  snapshot: "get_ttt_room_snapshot",
  submitMove: "submit_ttt_move",
} as const;

const STORAGE_KEYS = {
  sessionPrefix: "sapogames:ttt:session:",
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

export function loadTttRoomSession(roomCode: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(sessionKey(roomCode));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as TttRoomSession;
  } catch {
    window.localStorage.removeItem(sessionKey(roomCode));
    return null;
  }
}

export function saveTttRoomSession(session: TttRoomSession) {
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
  } satisfies TttRoomSession;
}

export async function createTttRoom(nickname: string) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.create, {
    host_nickname: nickname.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRoomSession(data as RpcResponse);
}

export async function joinTttRoom(roomCode: string, nickname: string) {
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

export async function getTttRoomSnapshot(roomCode: string) {
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

  return data as TttSnapshot;
}

export async function submitTttMove(session: TttRoomSession, cellIndex: number) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.submitMove, {
    cell_index_input: cellIndex,
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function startNextTttRound(session: TttRoomSession) {
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
