// Game art lives in site/public/play/. Sprites were exported at a shared
// scale per character (Leoul: 320 px head width, Lenyang: 480 px ready pose),
// so one factor sizes every pose of a character.

export const IMAGE_FILES = {
  backdrop: "backdrop.webp",
  pitch: "pitch.webp",
  goalFrame: "goalframe.webp",
  ball: "ball.webp",
  title: "title.webp",
  trophy: "trophy.webp",
  leoulReady: "leoul-ready.webp",
  leoulRun: "leoul-run.webp",
  leoulKick: "leoul-kick.webp",
  leoulCelebrate: "leoul-celebrate.webp",
  leoulSad: "leoul-sad.webp",
  leoulWave: "leoul-wave.webp",
  leoulMeat: "leoul-meat.webp",
  lenyangReady: "lenyang-ready.webp",
  lenyangDive: "lenyang-dive.webp",
  lenyangJump: "lenyang-jump.webp",
  lenyangNap: "lenyang-nap.webp",
  lenyangSad: "lenyang-sad.webp",
  lenyangStarry: "lenyang-starry.webp",
  lenyangHug: "lenyang-hug.webp",
  iconFish: "icon-fish.webp",
  iconMeat: "icon-meat.webp",
  iconBalloon: "icon-balloon.webp",
  iconHeart: "icon-heart.webp",
  iconStar: "icon-star.webp",
  iconPaw: "icon-paw.webp",
} as const;

export type ImageKey = keyof typeof IMAGE_FILES;
export type Images = Record<ImageKey, HTMLImageElement>;

export const MUSIC_FILE = "seoul-song-2024.mp3";

/** The Blender layers were rendered at 1.5x the logical canvas. */
export const RENDER_SCALE = 1.5;
/** Top-left of the cropped goal-frame layer, in logical pixels. */
export const GOAL_FRAME_OFFSET = { x: 107.33, y: 408 };

/** Leoul: world metres per sprite pixel (a 0.62 m head is 320 px wide). */
export const LEOUL_UNIT = 0.62 / 320;
/** Lenyang: world metres per sprite pixel (the 480 px ready pose is 2.15 m tall). */
export const LENYANG_UNIT = 2.15 / 480;

export async function loadImages(base: string, onProgress: (done: number, total: number) => void): Promise<Images> {
  const entries = Object.entries(IMAGE_FILES) as [ImageKey, string][];
  let done = 0;
  const loaded = await Promise.all(
    entries.map(async ([key, file]) => {
      const img = new Image();
      img.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Could not load ${file}`));
        img.src = `${base}${file}`;
      });
      try {
        await img.decode();
      } catch {
        // Some mobile browsers reject decode() for large images; onload is enough.
      }
      done += 1;
      onProgress(done, entries.length);
      return [key, img] as const;
    }),
  );
  return Object.fromEntries(loaded) as Images;
}
