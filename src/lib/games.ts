export type GameCard = {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  status: "live" | "coming-soon";
};

export const gameCards: GameCard[] = [
  {
    slug: "rps",
    title: "Piedra, papel o tijera",
    eyebrow: "Listo para jugar",
    description:
      "Crea una sala, comparte el link por AirDrop y arranca una partida en segundos.",
    href: "/games/rps/",
    status: "live",
  },
  {
    slug: "ttt",
    title: "Tic tac toe",
    eyebrow: "Listo para jugar",
    description:
      "Crea una sala, comparte el link y juega una partida por turnos en segundos.",
    href: "/games/ttt/",
    status: "live",
  },
  {
    slug: "bj",
    title: "Blackjack",
    eyebrow: "Listo para jugar",
    description:
      "Una mesa rapida para dos jugadores contra la banca, sin apuestas ni rodeos.",
    href: "/games/bj/",
    status: "live",
  },
  {
    slug: "bjd",
    title: "Blackjack duelo",
    eyebrow: "Listo para jugar",
    description:
      "Un cara a cara con manos ocultas hasta el reveal final.",
    href: "/games/bjd/",
    status: "live",
  },
  {
    slug: "bb",
    title: "Bluff Battle",
    eyebrow: "Listo para jugar",
    description:
      "Un party mode de bluff con colores, desafios y tres vidas por jugador.",
    href: "/games/bb/",
    status: "live",
  },
  {
    slug: "spot",
    title: "Amigos suyos",
    eyebrow: "Listo para jugar",
    description:
      "Cartas sociales, voto simultaneo y marcador abierto para seguir mientras el grupo quiera.",
    href: "/games/spot/",
    status: "live",
  },
  {
    slug: "imp",
    title: "Impostor",
    eyebrow: "Listo para jugar",
    description:
      "Palabra secreta, un impostor, orden cambiante y votaciones hasta dejarlo al descubierto.",
    href: "/games/imp/",
    status: "live",
  },
  {
    slug: "guess",
    title: "Adivina el numero",
    eyebrow: "Proximamente",
    description:
      "Un duelo rapido para ir ampliando el arcade sin rehacer la base del proyecto.",
    href: "#",
    status: "coming-soon",
  },
  {
    slug: "memory",
    title: "Memoria relampago",
    eyebrow: "Proximamente",
    description:
      "Otra pieza prevista para validar que el menu y las salas escalan a varios juegos.",
    href: "#",
    status: "coming-soon",
  },
];
