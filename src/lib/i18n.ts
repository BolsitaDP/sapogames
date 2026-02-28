export const LANGUAGE_STORAGE_KEY = "sapogames:language";

export const languages = [
  { label: "Espanol", value: "es" },
  { label: "English", value: "en" },
] as const;

export type Language = (typeof languages)[number]["value"];

type DictionaryValue = string | Dictionary;
type Dictionary = {
  [key: string]: DictionaryValue;
};

export const dictionaries: Record<Language, Dictionary> = {
  es: {
    common: {
      appName: "Sapo Games",
      menu: "Menu",
      back: "Atras",
      close: "Cerrar",
      settings: "Configuracion",
      searchGames: "Buscar juegos",
      live: "En vivo",
      soon: "Proximamente",
      loadingRoom: "Cargando sala...",
      host: "Host",
      shared: "Compartido",
      copied: "Copiado",
      share: "Compartir",
      enter: "Entrar",
      room: "Sala",
    },
    settings: {
      title: "Configuracion",
      language: "Idioma",
      languageSelection: "Seleccion de idioma",
    },
    games: {
      rps: {
        title: "Piedra, papel o tijera",
      },
      guess: {
        title: "Adivina el numero",
      },
      memory: {
        title: "Memoria relampago",
      },
    },
    rps: {
      pendingConfig: "Configuracion pendiente",
      connectSupabase: "Conecta Supabase para habilitar las salas.",
      missingSupabase:
        "Falta definir NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. El proyecto ya incluye el SQL y el workflow para Pages.",
      setupStep1: "1. Crea el proyecto en Supabase.",
      setupStep2: "2. Ejecuta supabase/schema.sql.",
      setupStep3: "3. Copia .env.example a .env.local y rellena las claves.",
      setupStep4: "4. Lanza npm run dev.",
      createRoom: "Crear sala",
      creating: "Creando...",
      yourNickname: "Tu apodo",
      roomCodePlaceholder: "Codigo de sala",
      roomCodeMissing: "Falta el codigo de la sala.",
      invalidRoomCode: "Escribe un codigo valido.",
      enterRoom: "Entrar a la sala",
      entering: "Entrando...",
      join: "Entrar",
      firstEnterRoom: "Primero entra a la sala.",
      choose: "Tablero",
      choiceSent: "Jugada enviada",
      readyToChoose: "Listo para elegir",
      players: "Jugadores",
      score: "Marcador",
      waitingSecondPlayer: "Esperando al segundo jugador.",
      yourDevice: "Tu dispositivo",
      guest: "Invitado",
      round: "Ronda {{round}}",
      result: "Resultado",
      tie: "Empate",
      nextRound: "Siguiente ronda",
      opening: "Abriendo...",
      movesSent: "Jugadas enviadas: {{count}}/{{total}}",
      roomCode: "Sala: {{code}}",
      roomCreated: "",
      joinedRoom: "Entraste a la sala. Ya puedes jugar.",
      moveSubmitted: "Tu jugada fue {{choice}}.",
      nextRoundReady: "Nueva ronda lista.",
      createRoomError: "No se pudo crear la sala.",
      joinRoomError: "No se pudo entrar a la sala.",
      sendMoveError: "No se pudo enviar la jugada.",
      nextRoundError: "No se pudo abrir la siguiente ronda.",
      loadRoomError: "No se pudo cargar la sala.",
      nicknameBeforeCreate: "Pon tu apodo antes de crear la sala.",
      nicknameBeforeJoin: "Pon tu apodo para entrar.",
      shareText: "Entra a la sala y juguemos piedra, papel o tijera.",
      resultWinner: "{{name}} gano la ronda",
      choices: {
        rock: {
          label: "Piedra",
          description: "Gana a tijera",
        },
        paper: {
          label: "Papel",
          description: "Gana a piedra",
        },
        scissors: {
          label: "Tijera",
          description: "Gana a papel",
        },
      },
    },
  },
  en: {
    common: {
      appName: "Sapo Games",
      menu: "Menu",
      back: "Back",
      close: "Close",
      settings: "Settings",
      searchGames: "Search games",
      live: "Live",
      soon: "Soon",
      loadingRoom: "Loading room...",
      host: "Host",
      shared: "Shared",
      copied: "Copied",
      share: "Share",
      enter: "Enter",
      room: "Room",
    },
    settings: {
      title: "Settings",
      language: "Language",
      languageSelection: "Language selection",
    },
    games: {
      rps: {
        title: "Rock, paper, scissors",
      },
      guess: {
        title: "Guess the number",
      },
      memory: {
        title: "Flash memory",
      },
    },
    rps: {
      pendingConfig: "Configuration pending",
      connectSupabase: "Connect Supabase to enable rooms.",
      missingSupabase:
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. The project already includes the SQL and the Pages workflow.",
      setupStep1: "1. Create the project in Supabase.",
      setupStep2: "2. Run supabase/schema.sql.",
      setupStep3: "3. Copy .env.example to .env.local and fill in the keys.",
      setupStep4: "4. Run npm run dev.",
      createRoom: "Create room",
      creating: "Creating...",
      yourNickname: "Your nickname",
      roomCodePlaceholder: "Room code",
      roomCodeMissing: "Room code is missing.",
      invalidRoomCode: "Enter a valid code.",
      enterRoom: "Join room",
      entering: "Joining...",
      join: "Join",
      firstEnterRoom: "Join the room first.",
      choose: "Board",
      choiceSent: "Move sent",
      readyToChoose: "Ready to choose",
      players: "Players",
      score: "Score",
      waitingSecondPlayer: "Waiting for the second player.",
      yourDevice: "Your device",
      guest: "Guest",
      round: "Round {{round}}",
      result: "Result",
      tie: "Tie",
      nextRound: "Next round",
      opening: "Opening...",
      movesSent: "Moves sent: {{count}}/{{total}}",
      roomCode: "Room: {{code}}",
      roomCreated: "",
      joinedRoom: "You joined the room. You can play now.",
      moveSubmitted: "Your move was {{choice}}.",
      nextRoundReady: "New round ready.",
      createRoomError: "Could not create the room.",
      joinRoomError: "Could not join the room.",
      sendMoveError: "Could not send the move.",
      nextRoundError: "Could not open the next round.",
      loadRoomError: "Could not load the room.",
      nicknameBeforeCreate: "Enter your nickname before creating the room.",
      nicknameBeforeJoin: "Enter your nickname to join.",
      shareText: "Join the room and let's play rock, paper, scissors.",
      resultWinner: "{{name}} won the round",
      choices: {
        rock: {
          label: "Rock",
          description: "Beats scissors",
        },
        paper: {
          label: "Paper",
          description: "Beats rock",
        },
        scissors: {
          label: "Scissors",
          description: "Beats paper",
        },
      },
    },
  },
};

function getNestedValue(dictionary: Dictionary, path: string): string | undefined {
  const value = path
    .split(".")
    .reduce<DictionaryValue | undefined>((current, part) => {
      if (!current || typeof current === "string") {
        return undefined;
      }

      return current[part];
    }, dictionary);

  return typeof value === "string" ? value : undefined;
}

export function translate(
  language: Language,
  key: string,
  variables?: Record<string, string | number>,
) {
  const template =
    getNestedValue(dictionaries[language], key) ??
    getNestedValue(dictionaries.es, key) ??
    key;

  if (!variables) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_, variableName: string) => {
    return String(variables[variableName] ?? "");
  });
}
