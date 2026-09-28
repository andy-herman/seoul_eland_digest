import { CLUB_SONGS } from "./clubSongs";
import { withBase } from "./paths";

/** Every club song's URL in playlist order, joined with "|" for a data attribute (GameAudio splits it). */
export const clubPlaylistAttr = (): string => CLUB_SONGS.map((s) => withBase(`/play/${s.file}`)).join("|");
