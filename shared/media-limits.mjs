/** Default media policy; server settings may supply lower per-owner limits. */
export const siteDefaults = Object.freeze({
  image: 25 * 1024 * 1024,
  voicenote: 10_000_000,
  audio: 100 * 1024 * 1024,
  video: 500 * 1024 * 1024,
});

export const transportLimits = Object.freeze({ image: 25 * 1024 * 1024, audio: 100 * 1024 * 1024, video: 500 * 1024 * 1024 });

export const voiceNoteMaxSeconds = 600;
export const audioPlaybackTtlMs = 5 * 60 * 1000;
