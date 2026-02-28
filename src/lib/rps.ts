import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type RpsChoice = "rock" | "paper" | "scissors";

export type RoomSession = {
  nickname: string;
  playerId: string;
  playerSecret: string;
  roomCode: string;
};

export type RpsPlayer = {
  id: string;
  isHost: boolean;
  joinedAt: string;
  nickname: string;
  score?: number;
};

export type RevealedMove = {
  choice: RpsChoice;
  nickname: string;
  playerId: string;
};

export type RpsSnapshot = {
  createdAt: string;
  currentRound: {
    id: string;
    revealedMoves: RevealedMove[];
    roundNumber: number;
    status: "pending" | "revealed";
    submittedCount: number;
    submittedPlayerIds: string[];
    winnerNickname: string | null;
    winnerPlayerId: string | null;
  };
  gameSlug: "rps";
  playerCount: number;
  players: RpsPlayer[];
  roomCode: string;
  roomId: string;
  roomStatus: "waiting" | "playing" | "finished";
};

type RpcResponse = Record<string, unknown> | null;

const ROOM_RPC = {
  create: "create_rps_room",
  join: "join_rps_room",
  nextRound: "start_next_rps_round",
  snapshot: "get_rps_room_snapshot",
  submitMove: "submit_rps_move",
} as const;

const STORAGE_KEYS = {
  nickname: "sapogames:nickname",
  sessionPrefix: "sapogames:rps:session:",
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

export function getSavedNickname() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(STORAGE_KEYS.nickname) ?? "";
}

export function saveNickname(nickname: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.nickname, nickname);
}

export function loadRoomSession(roomCode: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(sessionKey(roomCode));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RoomSession;
  } catch {
    window.localStorage.removeItem(sessionKey(roomCode));
    return null;
  }
}

export function saveRoomSession(session: RoomSession) {
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
  } satisfies RoomSession;
}

export async function createRoom(nickname: string) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.create, {
    host_nickname: nickname.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRoomSession(data as RpcResponse);
}

export async function joinRoom(roomCode: string, nickname: string) {
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

export async function getRoomSnapshot(roomCode: string) {
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

  return data as RpsSnapshot;
}

export async function submitMove(session: RoomSession, choice: RpsChoice) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.submitMove, {
    player_choice: choice,
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function startNextRound(session: RoomSession) {
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

export const rpsChoices: Array<{
  choice: RpsChoice;
}> = [
  { choice: "rock" },
  { choice: "paper" },
  { choice: "scissors" },
];
