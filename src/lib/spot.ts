import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SpotRoomSession = {
  nickname: string;
  playerId: string;
  playerSecret: string;
  roomCode: string;
};

export type SpotWonPrompt = {
  promptId: string | null;
  promptText: string;
  roundNumber: number;
};

export type SpotPlayer = {
  id: string;
  isHost: boolean;
  joinedAt: string;
  nickname: string;
  score: number;
  wonPrompts: SpotWonPrompt[];
};

export type SpotRevealedVote = {
  targetNickname: string;
  targetPlayerId: string;
  voterNickname: string;
  voterPlayerId: string;
};

export type SpotSnapshot = {
  createdAt: string;
  currentRound: {
    id: string;
    participantCount: number;
    participantPlayerIds: string[];
    promptId: string | null;
    promptText: string;
    revealedVotes: SpotRevealedVote[];
    roundNumber: number;
    selfVoteTargetPlayerId: string | null;
    status: "pending" | "revealed";
    submittedCount: number;
    submittedPlayerIds: string[];
    tiedNicknames: string[];
    tiedPlayerIds: string[];
    winnerNickname: string | null;
    winnerPlayerId: string | null;
    winningVoteCount: number;
  } | null;
  gameSlug: "spot";
  playerCount: number;
  players: SpotPlayer[];
  roomCode: string;
  roomId: string;
  roomStatus: "waiting" | "playing" | "finished";
  usedPromptIds: string[];
};

export type SpotPrompt = {
  category?: string;
  id: string;
  text: string;
};

type SpotPromptsFile = {
  prompts: SpotPrompt[];
  version: number;
};

type RpcResponse = Record<string, unknown> | null;

const ROOM_RPC = {
  create: "create_spot_room",
  join: "join_spot_room",
  snapshot: "get_spot_room_snapshot",
  start: "start_next_spot_round",
  vote: "submit_spot_vote",
} as const;

const STORAGE_KEYS = {
  sessionPrefix: "sapogames:spot:session:",
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
  } satisfies SpotRoomSession;
}

function promptsUrl() {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  return `${basePath}/game-content/spot-prompts.json`;
}

export function loadSpotRoomSession(roomCode: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(sessionKey(roomCode));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SpotRoomSession;
  } catch {
    window.localStorage.removeItem(sessionKey(roomCode));
    return null;
  }
}

export function saveSpotRoomSession(session: SpotRoomSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(sessionKey(session.roomCode), JSON.stringify(session));
}

export async function loadSpotPrompts() {
  const response = await fetch(promptsUrl(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error("No se pudo cargar el archivo de prompts.");
  }

  const data = (await response.json()) as SpotPromptsFile;

  if (!Array.isArray(data.prompts)) {
    throw new Error("El archivo de prompts no tiene el formato esperado.");
  }

  const prompts = data.prompts.filter((prompt) => {
    return (
      typeof prompt?.id === "string" &&
      prompt.id.trim() !== "" &&
      typeof prompt?.text === "string" &&
      prompt.text.trim() !== ""
    );
  });

  if (prompts.length === 0) {
    throw new Error("El archivo de prompts no tiene cartas validas.");
  }

  return prompts.map((prompt) => ({
    category: prompt.category,
    id: prompt.id.trim(),
    text: prompt.text.trim(),
  }));
}

export async function createSpotRoom(nickname: string) {
  const client = requireClient();
  const { data, error } = await client.rpc(ROOM_RPC.create, {
    host_nickname: nickname.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRoomSession(data as RpcResponse);
}

export async function joinSpotRoom(roomCode: string, nickname: string) {
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

export async function startSpotRound(
  session: SpotRoomSession,
  prompt: SpotPrompt,
) {
  const client = requireClient();
  const { error } = await client.rpc(ROOM_RPC.start, {
    player_id_input: session.playerId,
    player_secret_input: session.playerSecret,
    prompt_id_input: prompt.id,
    prompt_text_input: prompt.text,
    room_code_input: session.roomCode,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function submitSpotVote(
  session: SpotRoomSession,
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

export async function getSpotRoomSnapshot(session: SpotRoomSession) {
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

  return data as SpotSnapshot;
}
