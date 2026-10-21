export interface Greeting {
  lang: string;
  dir: "ltr" | "rtl";
  text: string;
}

export const GREETINGS: readonly Greeting[] = [
  { lang: "en", dir: "ltr", text: "Welcome aboard" },
  { lang: "ar", dir: "rtl", text: "مرحباً بكم على متن الطائرة" },
  { lang: "fr", dir: "ltr", text: "Bienvenue à bord" },
  { lang: "es", dir: "ltr", text: "Bienvenido a bordo" },
  { lang: "de", dir: "ltr", text: "Willkommen an Bord" },
  { lang: "ru", dir: "ltr", text: "Добро пожаловать на борт" },
  { lang: "ja", dir: "ltr", text: "ご搭乗を歓迎いたします" },
  { lang: "zh", dir: "ltr", text: "欢迎登机" },
];

const ROWS = 35;
const LETTERS = "ABCDEF";

export function randomSeat(rand: () => number = Math.random): string {
  let row = 1 + Math.floor(rand() * (ROWS - 1));
  if (row >= 13) row += 1; // skip row 13
  return `${row}${LETTERS[Math.floor(rand() * LETTERS.length)]}`;
}

const SEAT_KEY = "cabinview.seat";
let seat: string | undefined;

export function getSessionSeat(): string {
  if (seat) return seat;
  try {
    seat = sessionStorage.getItem(SEAT_KEY) ?? undefined;
  } catch { /* memory only */ }
  if (!seat) {
    seat = randomSeat();
    try { sessionStorage.setItem(SEAT_KEY, seat); } catch { /* memory only */ }
  }
  return seat;
}