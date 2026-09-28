// The club's own songs, the soundtrack of every mascot game. The games play them as a playlist: each
// visit starts on the next song in turn, and when a song ends the next one starts. The rhythm games
// (Seoul Song Rhythm, Clap for Seoul) let the player pick the song instead, because their charts and
// chants are built on each song's beat. Kept free of site imports so the headless suites can use it.

export type ClubSongId = "seoul-song-2024" | "my-seoul-eland-2022";
export type SongLocale = "en" | "pt";

export interface ClubSong {
  id: ClubSongId;
  file: string; // under /play/
  ko: string; // the title as the club publishes it
  year: number;
  gloss: Record<SongLocale, string>; // what the title means
}

export const CLUB_SONGS: readonly ClubSong[] = [
  { id: "seoul-song-2024", file: "seoul-song-2024.mp3", ko: "서울의 노래", year: 2024, gloss: { en: "Song of Seoul", pt: "Canção de Seoul" } },
  { id: "my-seoul-eland-2022", file: "my-seoul-eland-2022.mp3", ko: "사랑하는 나의 서울 이랜드", year: 2022, gloss: { en: "My beloved Seoul E-Land", pt: "Meu amado Seoul E-Land" } },
];

/** "서울의 노래 (2024 ver)" in English copy, "서울의 노래 (versão 2024)" in Portuguese. */
export function songTitle(song: ClubSong, locale: SongLocale = "en"): string {
  return locale === "pt" ? `${song.ko} (versão ${song.year})` : `${song.ko} (${song.year} ver)`;
}

/** Every club song's URL under a /play/ base that already carries the site base. */
export const clubPlaylist = (playBase: string): string[] => CLUB_SONGS.map((s) => `${playBase}${s.file}`);
