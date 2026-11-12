// Generated from the synced audio core. Do not edit.
// assist-audio-core v1.1.0 sha256:efd7038dc9460b97022686ce5099386be0919b4828b066c312c5cf16698a913d
// Synced from assistwithlife shared/media/audio.ts. Do not edit here; change it upstream and re-sync.
/** Assist family audio policy. Canonical copy: assistwithlife; sync, do not fork. */
export const AUDIO_CORE_VERSION = "1.1.0";
export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/aac", "audio/mpeg", "audio/wav", "audio/flac"];
export const AUDIO_MIME_ALIASES = Object.freeze({
    "audio/webm": "audio/webm", "video/webm": "audio/webm",
    "audio/ogg": "audio/ogg", "application/ogg": "audio/ogg",
    "audio/mp4": "audio/mp4", "audio/m4a": "audio/mp4", "audio/x-m4a": "audio/mp4",
    "audio/aac": "audio/aac", "audio/x-aac": "audio/aac",
    "audio/mpeg": "audio/mpeg", "audio/mp3": "audio/mpeg", "audio/x-mp3": "audio/mpeg",
    "audio/wav": "audio/wav", "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/vnd.wave": "audio/wav",
    "audio/flac": "audio/flac", "audio/x-flac": "audio/flac",
});
/** A hint only. Never accepts bytes or infers a type from a filename. */
export function normalizeAudioMime(value) {
    const mime = value.split(";")[0].trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(AUDIO_MIME_ALIASES, mime) ? AUDIO_MIME_ALIASES[mime] : null;
}
const ascii = (b, at, text) => [...text].every((char, i) => b[at + i] === char.charCodeAt(0));
const be32 = (b, at) => b[at] * 0x1000000 + b[at + 1] * 0x10000 + b[at + 2] * 0x100 + b[at + 3];
/** Read a finite EBML size (unknown sizes are not valid for the header). */
function ebmlSize(b, at) {
    for (let width = 1; width <= 8; width++) {
        const marker = 1 << (8 - width);
        if (!(b[at] & marker))
            continue;
        if (at + width > b.length)
            return null;
        let value = b[at] & (marker - 1);
        for (let i = 1; i < width; i++)
            value = value * 256 + b[at + i];
        if (!Number.isSafeInteger(value) || value === 2 ** (7 * width) - 1)
            return null;
        return { value, next: at + width };
    }
    return null;
}
function webmHeader(b) {
    if (be32(b, 0) !== 0x1a45dfa3)
        return false;
    const size = ebmlSize(b, 4);
    if (!size || size.next + size.value > b.length)
        return false;
    const end = size.next + size.value;
    let docType = false;
    for (let at = size.next; at < end;) {
        let width = 1;
        while (width <= 4 && !(b[at] & (1 << (8 - width))))
            width++;
        if (width > 4 || at + width > end)
            return false;
        const isDocType = width === 2 && b[at] === 0x42 && b[at + 1] === 0x82;
        const field = ebmlSize(b, at + width);
        if (!field || field.next + field.value > end)
            return false;
        if (isDocType) {
            if (field.value !== 4 || !ascii(b, field.next, "webm"))
                return false;
            docType = true;
        }
        at = field.next + field.value;
    }
    return docType;
}
/**
 * Inspect a prefix containing complete identifying headers (supply up to 64 KiB).
 * This is a candidate only: NEVER accept an upload from this prefix check.
 * Call validateAudioContainer on the complete original to check framing, audio
 * tracks and duration; sites still verify integrity and local codec support.
 * In particular an MP4/WebM header cannot prove the absence of video.
 * Declared MIME/name is unused.
 */
export function sniffAudioType(b) {
    if (webmHeader(b))
        return "audio/webm";
    if (b.length >= 28 && ascii(b, 0, "OggS") && b[4] === 0 && b[5] === 2 && b[26] > 0) {
        const count = b[26], at = 27 + count;
        // The first complete packet must be an Opus identification header.
        const length = b[27];
        if (length >= 19 && length < 255 && at + length <= b.length && ascii(b, at, "OpusHead") && b[at + 8] === 1 && b[at + 9] > 0)
            return "audio/ogg";
    }
    if (b.length >= 16 && ascii(b, 4, "ftyp")) {
        const size = be32(b, 0);
        if (size >= 16 && size % 4 === 0 && size <= b.length) {
            const brands = ["M4A ", "M4B ", "isom", "iso2", "mp41", "mp42", "qt  "];
            for (let at = 8; at < size; at += 4) {
                if (at !== 12 && brands.some((brand) => ascii(b, at, brand)))
                    return "audio/mp4";
            }
        }
    }
    // ADTS AAC: layer zero, supported sampling index, nonzero channels, full header.
    if (b.length >= 7 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0 && ((b[2] >> 2) & 15) < 13) {
        const header = b[1] & 1 ? 7 : 9;
        const frame = ((b[3] & 3) << 11) | (b[4] << 3) | (b[5] >> 5);
        const channels = ((b[2] & 1) << 2) | (b[3] >> 6);
        if (b.length >= header && frame >= header && channels > 0)
            return "audio/aac";
    }
    // ID3 alone is metadata, not proof of MP3. Skip a complete synchsafe tag.
    let mp3At = 0;
    if (ascii(b, 0, "ID3")) {
        if (b.length < 10 || ![2, 3, 4].includes(b[3]) || b[4] === 255 || b.slice(6, 10).some((v) => v > 127))
            return null;
        mp3At = 10 + b[6] * 2097152 + b[7] * 16384 + b[8] * 128 + b[9];
        if (b[3] === 4 && (b[5] & 0x10))
            mp3At += 10;
    }
    if (b.length >= mp3At + 4 && b[mp3At] === 0xff && (b[mp3At + 1] & 0xe0) === 0xe0 &&
        ((b[mp3At + 1] >> 3) & 3) !== 1 && ((b[mp3At + 1] >> 1) & 3) === 1 &&
        (b[mp3At + 2] >> 4) > 0 && (b[mp3At + 2] >> 4) < 15 && ((b[mp3At + 2] >> 2) & 3) !== 3)
        return "audio/mpeg";
    if (b.length >= 36 && ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE")) {
        const le32 = (at) => b[at] + b[at + 1] * 256 + b[at + 2] * 65536 + b[at + 3] * 16777216;
        const riffEnd = le32(4) + 8;
        for (let at = 12; at + 8 <= b.length;) {
            const size = le32(at + 4), end = at + 8 + size;
            if (end > b.length || end > riffEnd)
                break;
            if (ascii(b, at, "fmt ")) {
                const format = b[at + 8] | (b[at + 9] << 8);
                if (size >= 16 && [1, 3, 6, 7, 0xfffe].includes(format) &&
                    (b[at + 10] | (b[at + 11] << 8)) > 0 && le32(at + 12) > 0)
                    return "audio/wav";
                break;
            }
            at = end + size % 2;
        }
    }
    // FLAC requires the complete, mandatory first STREAMINFO block, not just fLaC.
    if (b.length >= 42 && ascii(b, 0, "fLaC") && (b[4] & 0x7f) === 0 && b[5] === 0 && b[6] === 0 && b[7] === 34 &&
        ((b[18] << 12) | (b[19] << 4) | (b[20] >> 4)) > 0)
        return "audio/flac";
    return null;
}
/** Decimal MB, compatible with effectiveFileCap/checkFileSize in the usage core. */
export const DEFAULT_AUDIO_FILE_CAPS = Object.freeze({ voicenote: 10_000_000, audio: 100_000_000 });
export const DEFAULT_AUDIO_DURATION_CAPS = Object.freeze({ voicenote: 600, audio: null });
export function checkVoiceNoteDuration(seconds, maxSeconds = DEFAULT_AUDIO_DURATION_CAPS.voicenote) {
    if (!Number.isFinite(maxSeconds) || maxSeconds < 0)
        throw new Error("Invalid duration cap");
    if (!Number.isFinite(seconds) || seconds <= 0)
        return { code: "INVALID_AUDIO_DURATION", maxSeconds, gotSeconds: seconds };
    return seconds > maxSeconds ? { code: "AUDIO_TOO_LONG", maxSeconds, gotSeconds: seconds } : null;
}
export const RECORDER_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];
export const RECORDER_AUDIO_BITS_PER_SECOND = 32_000;
export const RECORDER_CHANNEL_COUNT = 1;
export function chooseRecorderFormat(isSupported) {
    const mimeType = RECORDER_MIME_TYPES.find(isSupported);
    return mimeType ? { mimeType, audioBitsPerSecond: RECORDER_AUDIO_BITS_PER_SECOND, channelCount: RECORDER_CHANNEL_COUNT } : null;
}
export const AUDIO_ENVIRONMENTS = ["prod", "production", "dev", "development", "staging", "preview", "sandbox", "test"];
const validEnv = (env) => AUDIO_ENVIRONMENTS.includes(env);
// Generated UUIDs or 128/256-bit hex ids only. A validator cannot establish provenance;
// sites must generate these ids, never encode user text or use an owner id here.
const validRef = (ref) => /^(?:[a-f0-9]{32}|[a-f0-9]{64}|[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(ref);
export function buildAudioStorageKey(env, opaqueRef) {
    if (!validEnv(env) || !validRef(opaqueRef))
        throw new Error("Audio keys require a known environment and generated opaque reference");
    return `private/v1/${env}/audio/${opaqueRef}/original`;
}
export function parseAudioStorageKey(key) {
    const parts = key.split("/");
    return parts.length === 6 && parts[0] === "private" && parts[1] === "v1" && validEnv(parts[2]) && parts[3] === "audio" && validRef(parts[4]) && parts[5] === "original" ? parts[4] : null;
}
/**
 * Inclusive offsets. Unsupported or malformed Range is ignored (whole-file 200);
 * only an unsatisfiable single byte range yields 416. Sites set Content-Range,
 * stream bytes, and enforce capabilities.
 */
export function parseAudioRange(header, length) {
    if (!Number.isSafeInteger(length) || length < 0)
        throw new Error("Invalid resource length");
    if (header == null)
        return { kind: "whole" };
    const refuse = () => ({ kind: "refused", status: 416, reason: "unsatisfiable" });
    if (header.includes(","))
        return { kind: "whole" };
    const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
    if (!match || (!match[1] && !match[2]))
        return { kind: "whole" };
    const first = match[1] ? Number(match[1]) : null;
    const last = match[2] ? Number(match[2]) : null;
    if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last)))
        return { kind: "whole" };
    if (first !== null && last !== null && first > last)
        return { kind: "whole" };
    if (length === 0 || (first === null && last === 0))
        return refuse();
    const start = first ?? Math.max(0, length - last);
    const end = first === null || last === null ? length - 1 : Math.min(length - 1, last);
    if (start >= length || start > end)
        return refuse();
    return { kind: "partial", status: 206, start, end };
}
export const VOICE_NOTE_AUDIO_STATES = ["pending", "ready", "failed"];
export const VOICE_NOTE_TRANSCRIPTION_STATES = ["none", "queued", "done", "failed"];
export const INITIAL_VOICE_NOTE_STATE = Object.freeze({ audio: "pending", transcription: "none" });
export function withVoiceNoteTranscription(state, transcription) {
    return { ...state, transcription };
}
class AudioVideoTrack extends Error {
}
class AudioUnsupportedType extends Error {
}
// Workspace limits are parser resources, not site file/duration settings. All
// index pages have fixed sizes; hostile cardinalities are refused before growth.
const AUDIO_INDEX_PAGE_ENTRIES = 4096;
const AUDIO_MAX_INDEX_ENTRIES = 1_048_576;
const AUDIO_MAX_ACTIVE_STREAMS = 64;
const containerNeed = (ok) => { if (!ok)
    throw new Error("Invalid audio container"); };
const containerText = (b) => Array.from(b, (v) => String.fromCharCode(v)).join("");
const u32 = (b, at = 0, little = false) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, little);
const u16 = (b, at = 0, little = false) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(at, little);
const u64 = (b, at = 0, little = false) => {
    const n = Number(new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(at, little));
    containerNeed(Number.isSafeInteger(n));
    return n;
};
/** Two fixed-size cache pages; large payloads/metadata are never concatenated. */
class AudioReader {
    input;
    size;
    pages = new Map();
    constructor(input) {
        this.input = input;
        this.size = input instanceof Uint8Array ? input.length : input.size;
    }
    async bytes(at, count) {
        containerNeed(Number.isSafeInteger(at) && Number.isSafeInteger(count) && at >= 0 && count >= 0 && at + count <= this.size && count <= 65536);
        if (this.input instanceof Uint8Array)
            return this.input.subarray(at, at + count);
        if (!count)
            return new Uint8Array();
        const pageAt = Math.floor(at / 65536) * 65536;
        let page = this.pages.get(pageAt);
        if (!page) {
            page = await this.input.read(pageAt, Math.min(65536, this.size - pageAt));
            containerNeed(page instanceof Uint8Array && page.length === Math.min(65536, this.size - pageAt));
            if (this.pages.size === 2)
                this.pages.delete(this.pages.keys().next().value);
            this.pages.set(pageAt, page);
        }
        const start = at - pageAt;
        if (start + count <= page.length)
            return page.subarray(start, start + count);
        const out = new Uint8Array(count), first = page.length - start;
        out.set(page.subarray(start));
        out.set(await this.bytes(at + first, count - first), first);
        return out;
    }
    async num(at, count = 4, little = false) {
        const b = await this.bytes(at, count);
        if (count === 8)
            return u64(b, 0, little);
        let n = 0;
        for (let i = 0; i < count; i++)
            n = n * 256 + b[little ? count - i - 1 : i];
        return n;
    }
    async text(at, count) { return containerText(await this.bytes(at, count)); }
    async touch(start, end) {
        for (let at = start; at < end; at += 65536)
            await this.bytes(at, Math.min(65536, end - at));
    }
}
/**
 * Validate the complete original, never just the sniffed prefix. Checks container
 * boundaries, audio track declarations, nonempty complete frames/sample blocks and
 * format checksums where present; rejects video and incomplete/trailing framing.
 * This is structural validation, not codec decoding or a guarantee every browser
 * supports the codec. Sites still hash the original and enforce capabilities/caps.
 * A random-access chunk reader lets storage/Blob adapters serve bounded reads;
 * requests are at most 64 KiB, with two cached pages, never a second full-file copy.
 * Returns null duration for containers without reliable presentation timing.
 * Sites check size when duration is absent; refuse a voice note for duration
 * only when a reliable measured duration exceeds the configured limit.
 * What this does not catch:
 * - ADTS AAC zero/HTML payload with preserved ADTS headers and frame lengths.
 * - MP4 mdat zero/HTML payload with preserved AAC sample sizes and offsets.
 * - MP3 0xff side information/main data with preserved sync/header fields.
 * These auditor cases require decoding compressed data. A valid result certifies
 * STRUCTURE only, not decoded sound. Raw AAC MP4 samples have no ADTS header.
 * Malformed inputs, short reads and reader failures return invalid, never throw.
 */
export async function validateAudioContainer(input, declaredType) {
    const type = normalizeAudioMime(declaredType);
    if (!type)
        return { valid: false, reason: "unsupported-type" };
    try {
        const r = new AudioReader(input);
        containerNeed(Number.isSafeInteger(r.size) && r.size > 0);
        let durationSeconds;
        switch (type) {
            case "audio/wav":
                durationSeconds = await containerWav(r);
                break;
            case "audio/flac":
                durationSeconds = await containerFlac(r);
                break;
            case "audio/mpeg":
            case "audio/aac":
                durationSeconds = await containerMpeg(r, type);
                break;
            case "audio/ogg":
                durationSeconds = await containerOgg(r);
                break;
            case "audio/webm":
                durationSeconds = await containerWebm(r);
                break;
            case "audio/mp4":
                durationSeconds = await containerMp4(r);
                break;
        }
        // Also proves skipped opaque metadata/payload bytes really exist in the reader.
        await r.touch(0, r.size);
        containerNeed(durationSeconds === null || (Number.isFinite(durationSeconds) && durationSeconds > 0));
        return { valid: true, type, durationSeconds };
    }
    catch (error) {
        return { valid: false, reason: error instanceof AudioVideoTrack ? "video-track" : error instanceof AudioUnsupportedType ? "unsupported-type" : "invalid-container" };
    }
}
async function containerWav(r) {
    const head = await r.bytes(0, 12);
    containerNeed(ascii(head, 0, "RIFF") && ascii(head, 8, "WAVE"));
    const declared = u32(head, 4, true);
    containerNeed(declared === 0xffffffff || declared + 8 === r.size);
    let align = 0, rate = 0, samples = 0, format = 0;
    for (let at = 12; at < r.size;) {
        const h = await r.bytes(at, 8), name = containerText(h.subarray(0, 4));
        let size = u32(h, 4, true);
        // Streaming WAV uses sentinel lengths, never permission to omit sample bytes.
        if (size === 0xffffffff) {
            containerNeed(name === "data");
            size = r.size - at - 8;
        }
        const end = at + 8 + size;
        containerNeed(end <= r.size);
        if (name === "fmt ") {
            containerNeed(!align && size >= 16);
            const b = await r.bytes(at + 8, Math.min(size, 40));
            format = u16(b, 0, true);
            const channels = u16(b, 2, true);
            rate = u32(b, 4, true);
            align = u16(b, 12, true);
            const bits = u16(b, 14, true);
            if (format === 0xfffe) {
                containerNeed(size >= 40 && u16(b, 16, true) >= 22);
                format = u16(b, 24, true);
                containerNeed(ascii(b, 26, "\0\0\0\0\x10\0\x80\0\0\xaa\0\x38\x9b\x71"));
            }
            containerNeed([1, 3, 6, 7].includes(format) && channels > 0 && rate > 0 && align > 0 && bits > 0);
            containerNeed(align === channels * Math.ceil(bits / 8) && u32(b, 8, true) === rate * align);
            containerNeed(format !== 3 || bits === 32 || bits === 64);
        }
        if (name === "LIST")
            await containerWaveInfoFraming(r, at + 8, end);
        if (name === "data") {
            containerNeed(align > 0 && size > 0 && size % align === 0);
            samples += size / align;
        }
        at = end + size % 2;
        // A streaming sentinel data chunk may end at EOF without an RIFF pad byte.
        if (end === r.size && size % 2 && u32(h, 4, true) === 0xffffffff)
            at = end;
        containerNeed(at <= r.size);
    }
    containerNeed(samples > 0 && format > 0);
    return samples / rate;
}
async function containerMpeg(r, mime) {
    let at = 0, frames = 0, seconds = 0, declaredBytes = null, declaredFrames = null;
    if (r.size >= 3 && await r.text(0, 3) === "ID3") {
        const tag = await r.bytes(0, 10);
        containerNeed([2, 3, 4].includes(tag[3]) && tag[4] !== 255 && !tag.subarray(6).some((v) => v > 127));
        at = 10 + tag[6] * 2097152 + tag[7] * 16384 + tag[8] * 128 + tag[9] + (tag[3] === 4 && (tag[5] & 16) ? 10 : 0);
        containerNeed(at <= r.size);
        await containerId3Framing(r, tag, at);
    }
    const start = at, audioEnd = mime === "audio/mpeg" ? await containerMpegTail(r) : r.size;
    let trimSamples = 0, trimRate = 0;
    while (at < audioEnd) {
        const b = await r.bytes(at, mime === "audio/aac" ? 7 : 4);
        containerNeed(b[0] === 255);
        let size, duration, indexFrame = false;
        if (mime === "audio/aac") {
            const rateIndex = (b[2] >> 2) & 15;
            containerNeed((b[1] & 0xf6) === 0xf0 && rateIndex < 13 && (((b[2] & 1) << 2) | (b[3] >> 6)) > 0);
            size = ((b[3] & 3) << 11) | (b[4] << 3) | (b[5] >> 5);
            containerNeed(size > (b[1] & 1 ? 7 : 9));
            duration = 1024 * ((b[6] & 3) + 1) / [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350][rateIndex];
        }
        else {
            const version = (b[1] >> 3) & 3, index = b[2] >> 4, rate = (b[2] >> 2) & 3;
            containerNeed((b[1] & 0xe0) === 0xe0 && version !== 1 && ((b[1] >> 1) & 3) === 1 && index > 0 && index < 15 && rate < 3 && (b[3] & 3) !== 2);
            const bitrate = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[index] * 1000;
            const sampleRate = [44100, 48000, 32000][rate] / (version === 3 ? 1 : version === 2 ? 2 : 4);
            size = Math.floor((version === 3 ? 144 : 72) * bitrate / sampleRate) + ((b[2] >> 1) & 1);
            duration = (version === 3 ? 1152 : 576) / sampleRate;
            if (at === start) {
                const info = at + 4 + (b[1] & 1 ? 0 : 2) + (version === 3 ? b[3] >> 6 === 3 ? 17 : 32 : b[3] >> 6 === 3 ? 9 : 17);
                if (info + 8 <= at + size && ["Info", "Xing"].includes(await r.text(info, 4))) {
                    indexFrame = true;
                    const flags = await r.num(info + 4);
                    let p = info + 8;
                    containerNeed((flags & ~15) === 0);
                    if (flags & 1) {
                        containerNeed(p + 4 <= at + size);
                        declaredFrames = await r.num(p);
                        p += 4;
                    }
                    if (flags & 2) {
                        containerNeed(p + 4 <= at + size);
                        declaredBytes = await r.num(p);
                        p += 4;
                    }
                    if (flags & 4)
                        p += 100;
                    if (flags & 8)
                        p += 4;
                    containerNeed(p <= at + size);
                    if (p + 24 <= at + size && /^(LAME|Lavc|Lavf)/.test(await r.text(p, 4))) {
                        const gap = await r.bytes(p + 21, 3);
                        trimSamples = (gap[0] << 4) + (gap[1] >> 4) + ((gap[1] & 15) << 8) + gap[2];
                        trimRate = sampleRate;
                    }
                }
            }
        }
        containerNeed(size > 4 && at + size <= audioEnd);
        if (!indexFrame) {
            frames++;
            seconds += duration;
        }
        at += size;
    }
    containerNeed(frames > 0 && (declaredBytes === null || declaredBytes === at - start) && (declaredFrames === null || declaredFrames === frames));
    return seconds - (trimRate ? trimSamples / trimRate : 0);
}
function updateCrc(value, byte, polynomial, width) {
    const top = 2 ** (width - 1), mask = width === 32 ? -1 : 2 ** width - 1;
    value ^= byte << (width - 8);
    for (let bit = 0; bit < 8; bit++)
        value = ((value << 1) ^ ((value & top) ? polynomial : 0)) & mask;
    return value >>> 0;
}
async function containerCrc(r, start, end, poly, width) {
    let crc = 0;
    for (let at = start; at < end; at += 65536)
        for (const byte of await r.bytes(at, Math.min(65536, end - at)))
            crc = updateCrc(crc, byte, poly, width);
    return crc;
}
class AudioBits {
    r;
    bit;
    constructor(r, byte) {
        this.r = r;
        this.bit = byte * 8;
    }
    async read(n) {
        containerNeed(n >= 0 && n <= 32 && this.bit + n <= this.r.size * 8);
        if (!n)
            return 0;
        const start = Math.floor(this.bit / 8), b = await this.r.bytes(start, Math.ceil((this.bit % 8 + n) / 8));
        let value = 0;
        for (let i = 0; i < n; i++, this.bit++)
            value = value * 2 + ((b[Math.floor(this.bit / 8) - start] >> (7 - this.bit % 8)) & 1);
        return value;
    }
    skip(n) { containerNeed(Number.isSafeInteger(n) && n >= 0 && this.bit + n <= this.r.size * 8); this.bit += n; }
    async unary() { let zeros = 0; while (await this.read(1) === 0)
        zeros++; return zeros; }
}
async function containerFlac(r) {
    containerNeed(await r.text(0, 4) === "fLaC");
    let at = 4, last = false, first = true, rate = 0, depth = 0, channels = 0, expected = 0;
    while (!last) {
        const h = await r.bytes(at, 4), size = h[1] * 65536 + h[2] * 256 + h[3], type = h[0] & 127;
        last = Boolean(h[0] & 128);
        at += 4;
        containerNeed(at + size <= r.size && type !== 127);
        if (first) {
            containerNeed(type === 0 && size === 34);
            const b = await r.bytes(at, 34);
            rate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
            channels = ((b[12] >> 1) & 7) + 1;
            depth = ((b[12] & 1) << 4) + (b[13] >> 4) + 1;
            expected = (b[13] & 15) * 4294967296 + u32(b, 14);
            containerNeed(rate > 0 && depth >= 4 && depth <= 32 && u16(b) >= 16 && u16(b, 2) >= u16(b));
        }
        else {
            containerNeed(type !== 0);
            if (type === 4)
                await containerVorbisFraming(r, at, at + size);
        }
        first = false;
        at += size;
    }
    let samples = 0, frames = 0;
    while (at < r.size) {
        const b = await r.bytes(at, 4);
        containerNeed(b[0] === 255 && (b[1] & 0xfe) === 0xf8 && !(b[3] & 1));
        let end = at + 4, number = await r.num(end++, 1), follow = 0;
        if (number & 128) {
            let mask = 128;
            while (number & mask) {
                follow++;
                mask >>= 1;
            }
            containerNeed(follow >= 2 && follow <= 7);
            number &= (1 << (7 - follow)) - 1;
            for (let i = 1; i < follow; i++) {
                const v = await r.num(end++, 1);
                containerNeed((v & 192) === 128);
                number = number * 64 + (v & 63);
            }
        }
        if (follow)
            containerNeed(number >= [0, 0, 128, 2048, 65536, 2097152, 67108864, 2147483648][follow]);
        containerNeed(number < (b[1] & 1 ? 2 ** 36 : 2 ** 31));
        const code = b[2] >> 4, rateCode = b[2] & 15, assignment = b[3] >> 4, depthCode = (b[3] >> 1) & 7;
        containerNeed(code > 0 && rateCode !== 15 && assignment <= 10 && depthCode !== 3);
        let count = code === 1 ? 192 : code <= 5 ? 576 * 2 ** (code - 2) : code >= 8 ? 256 * 2 ** (code - 8) : 0;
        if (code === 6)
            count = await r.num(end++, 1) + 1;
        if (code === 7) {
            count = await r.num(end, 2) + 1;
            end += 2;
        }
        let frameRate = [rate, 88200, 176400, 192000, 8000, 16000, 22050, 24000, 32000, 44100, 48000, 96000][rateCode];
        if (rateCode === 12)
            frameRate = await r.num(end++, 1) * 1000;
        if (rateCode === 13 || rateCode === 14) {
            frameRate = await r.num(end, 2) * (rateCode === 14 ? 10 : 1);
            end += 2;
        }
        const frameDepth = [depth, 8, 12, 0, 16, 20, 24, 32][depthCode];
        containerNeed(frameRate === rate && frameDepth === depth && (assignment <= 7 ? assignment + 1 : 2) === channels);
        containerNeed(number === (b[1] & 1 ? samples : frames));
        containerNeed(await containerCrc(r, at, end + 1, 7, 8) === 0);
        end++;
        const bits = new AudioBits(r, end);
        async function residual(order) {
            const method = await bits.read(2);
            containerNeed(method <= 1);
            const partitions = 2 ** await bits.read(4);
            containerNeed(count % partitions === 0);
            for (let part = 0; part < partitions; part++) {
                const n = count / partitions - (part === 0 ? order : 0);
                containerNeed(n >= 0);
                const param = await bits.read(method === 0 ? 4 : 5);
                if (param === (method === 0 ? 15 : 31))
                    bits.skip(n * await bits.read(5));
                else
                    for (let i = 0; i < n; i++) {
                        await bits.unary();
                        bits.skip(param);
                    }
            }
        }
        for (let channel = 0; channel < channels; channel++) {
            containerNeed(await bits.read(1) === 0);
            const type = await bits.read(6), wasted = await bits.read(1) ? await bits.unary() + 1 : 0;
            const side = (assignment === 8 && channel === 1) || (assignment === 9 && channel === 0) || (assignment === 10 && channel === 1);
            const width = depth + (side ? 1 : 0) - wasted;
            containerNeed(width > 0);
            if (type === 0)
                bits.skip(width);
            else if (type === 1)
                bits.skip(count * width);
            else if (type >= 8 && type <= 12) {
                const order = type - 8;
                containerNeed(order <= count);
                bits.skip(order * width);
                await residual(order);
            }
            else if (type >= 32) {
                const order = type - 31;
                containerNeed(order <= count);
                bits.skip(order * width);
                const precision = await bits.read(4) + 1;
                containerNeed(precision !== 16);
                bits.skip(5 + order * precision);
                await residual(order);
            }
            else
                containerNeed(false);
        }
        if (bits.bit % 8)
            containerNeed(await bits.read(8 - bits.bit % 8) === 0);
        end = bits.bit / 8 + 2;
        containerNeed(await containerCrc(r, at, end, 0x8005, 16) === 0);
        samples += count;
        frames++;
        at = end;
    }
    containerNeed(frames > 0 && (!expected || expected === samples));
    return samples / rate;
}
async function containerOgg(r) {
    const streams = new Map();
    let audio = 0, duration = 0;
    for (let at = 0; at < r.size;) {
        const h = await r.bytes(at, 27);
        containerNeed(ascii(h, 0, "OggS") && h[4] === 0 && !(h[5] & ~7));
        const flags = h[5], serial = u32(h, 14, true), seq = u32(h, 18, true);
        const sizes = await r.bytes(at + 27, h[26]), body = at + 27 + sizes.length;
        const length = sizes.reduce((a, v) => a + v, 0), end = body + length;
        containerNeed(end <= r.size);
        // Ogg CRC includes a zeroed checksum field.
        let crc = 0;
        for (let pos = at; pos < end; pos += 65536) {
            const bytes = await r.bytes(pos, Math.min(65536, end - pos));
            for (let i = 0; i < bytes.length; i++)
                crc = updateCrc(crc, pos + i >= at + 22 && pos + i < at + 26 ? 0 : bytes[i], 0x04c11db7, 32);
        }
        containerNeed(crc === u32(h, 22, true));
        let s = streams.get(serial);
        if (!s) {
            containerNeed((flags & 2) && seq === 0 && streams.size < AUDIO_MAX_ACTIVE_STREAMS);
            s = { packet: [], page: at, body, length: 0, packets: 0, ended: false, sequence: -1, preSkip: 0, streamCount: 1, samples: 0, granule: 0, audio: 0 };
            streams.set(serial, s);
        }
        else
            containerNeed(!(flags & 2));
        containerNeed(!s.ended && seq === ((s.sequence + 1) >>> 0) && Boolean(flags & 1) === Boolean(s.length));
        s.sequence = seq;
        let offset = body;
        for (const size of sizes) {
            const partAt = offset;
            offset += size;
            // Never concatenate a continued packet. Retain only small header prefixes
            // or physical spans (adjacent lacing segments coalesce into one span/page).
            if (s.packets < 2) {
                const count = Math.min(size, 512 - s.packet.length);
                if (count)
                    for (const byte of await r.bytes(partAt, count))
                        s.packet.push(byte);
            }
            if (s.length === 0) {
                s.page = at;
                s.body = partAt;
            }
            s.length += size;
            if (size < 255) {
                const packet = Uint8Array.from(s.packet);
                if (s.packets === 0) {
                    if (!ascii(packet, 0, "OpusHead"))
                        throw new AudioUnsupportedType();
                    containerNeed(packet.length >= 19 && packet[8] >= 1 && packet[8] < 16 && packet[9] > 0);
                    s.preSkip = u16(packet, 10, true);
                    const family = packet[18];
                    if (family === 0)
                        containerNeed(packet[9] <= 2 && s.length === 19);
                    else {
                        containerNeed(s.length >= 21 + packet[9] && packet[19] > 0 && packet[20] <= packet[19]);
                        containerNeed(packet.subarray(21, 21 + packet[9]).every((v) => v === 255 || v < packet[19] + packet[20]));
                        s.streamCount = packet[19];
                    }
                }
                else if (s.packets === 1) {
                    containerNeed(ascii(packet, 0, "OpusTags") && s.length >= 16);
                    const tags = containerOggPacketReader(r, s.page, s.body, serial, s.length);
                    await containerVorbisFraming(tags, 8, s.length);
                }
                else {
                    const packetReader = containerOggPacketReader(r, s.page, s.body, serial, s.length);
                    s.samples += await containerOpusRange(packetReader, 0, s.length, s.streamCount);
                    s.audio++;
                    audio++;
                }
                s.packets++;
                s.packet = [];
                s.length = 0;
            }
        }
        s.ended = Boolean(flags & 4);
        const granule = new DataView(h.buffer, h.byteOffset, h.byteLength).getBigUint64(6, true);
        if (granule !== 0xffffffffffffffffn) {
            const n = Number(granule);
            containerNeed(Number.isSafeInteger(n) && n >= s.granule);
            s.granule = n;
        }
        if (s.ended) {
            containerNeed(!s.length && s.audio > 0 && s.granule > s.preSkip && s.granule <= s.samples);
            duration += (s.granule - s.preSkip) / 48000;
            streams.delete(serial);
        }
        at = end;
    }
    containerNeed(audio > 0 && streams.size === 0);
    return duration;
}
async function containerVint(r, at, keep = false) {
    const first = await r.num(at, 1);
    let width = 1;
    while (width <= (keep ? 4 : 8) && !(first & (1 << (8 - width))))
        width++;
    containerNeed(width <= (keep ? 4 : 8));
    const b = await r.bytes(at, width);
    let n = keep ? first : first & ((1 << (8 - width)) - 1);
    let unknown = !keep && n === (1 << (8 - width)) - 1;
    for (let i = 1; i < width; i++) {
        n = n * 256 + b[i];
        unknown = unknown && b[i] === 255;
    }
    containerNeed(unknown || Number.isSafeInteger(n));
    return { value: n, width, unknown };
}
async function containerEbml(r, at, end) {
    const id = await containerVint(r, at, true), size = await containerVint(r, at + id.width);
    const body = at + id.width + size.width, limit = size.unknown ? end : body + size.value;
    containerNeed(body <= limit && limit <= end);
    if (size.unknown)
        containerNeed(id.value === 0x18538067 || id.value === 0x1f43b675);
    return { id: id.value, body, end: limit, unknown: size.unknown };
}
async function containerFloat(r, at, size) {
    containerNeed(size === 4 || size === 8);
    const b = await r.bytes(at, size), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const n = size === 4 ? v.getFloat32(0) : v.getFloat64(0);
    containerNeed(Number.isFinite(n));
    return n;
}
async function containerWebm(r) {
    const header = await containerEbml(r, 0, r.size);
    containerNeed(header.id === 0x1a45dfa3);
    let doc = false;
    for (let at = header.body; at < header.end;) {
        const e = await containerEbml(r, at, header.end);
        if (e.id === 0x4282) {
            containerNeed(e.end - e.body === 4 && await r.text(e.body, 4) === "webm");
            doc = true;
        }
        at = e.end;
    }
    containerNeed(doc);
    const tracks = new Map();
    let scale = 1_000_000, declared = null, blocks = 0, latest = 0, earliest = Infinity, segmentSeen = false;
    const levelOne = new Set([0x114d9b74, 0x1549a966, 0x1654ae6b, 0x1f43b675, 0x1c53bb6b, 0x1941a469, 0x1043a770, 0x1254c367]);
    async function entry(e) {
        let privateData = null;
        const t = { id: 0, type: 0, codec: "", delay: 0, channels: 1, streamCount: 1, private: false };
        for (let at = e.body; at < e.end;) {
            const c = await containerEbml(r, at, e.end), n = c.end - c.body;
            if ([0xd7, 0x83, 0x56aa].includes(c.id)) {
                containerNeed(n >= 1 && n <= 8);
                const v = await r.num(c.body, n);
                if (c.id === 0xd7)
                    t.id = v;
                if (c.id === 0x83)
                    t.type = v;
                if (c.id === 0x56aa)
                    t.delay = v / 1e9;
            }
            if (c.id === 0x86) {
                containerNeed(n <= 32);
                t.codec = await r.text(c.body, n);
            }
            if (c.id === 0x63a2) {
                containerNeed(!privateData);
                privateData = c;
            }
            if (c.id === 0xe1)
                for (let pos = c.body; pos < c.end;) {
                    const a = await containerEbml(r, pos, c.end);
                    if (a.id === 0x9f) {
                        containerNeed(a.end - a.body <= 8);
                        t.channels = await r.num(a.body, a.end - a.body);
                        containerNeed(t.channels > 0 && t.channels <= 255);
                    }
                    if (a.id === 0xb5)
                        containerNeed(await containerFloat(r, a.body, a.end - a.body) > 0);
                    if (a.id === 0x78b5)
                        containerNeed(await containerFloat(r, a.body, a.end - a.body) > 0);
                    else if (a.id === 0x6264) {
                        const size = a.end - a.body;
                        if (size >= 1 && size <= 8)
                            await r.num(a.body, size);
                    }
                    pos = a.end;
                }
            if ([0xb9, 0x88, 0x55aa, 0x9c].includes(c.id) && n >= 1 && n <= 8)
                await r.num(c.body, n);
            at = c.end;
        }
        if (t.type === 1)
            throw new AudioVideoTrack();
        if (t.type !== 2 || t.codec !== "A_OPUS")
            throw new AudioUnsupportedType();
        containerNeed(privateData);
        const data = privateData;
        const head = await r.bytes(data.body, Math.min(data.end - data.body, 512));
        containerNeed(head.length >= 19 && ascii(head, 0, "OpusHead") && head[8] >= 1 && head[8] < 16 && head[9] > 0);
        const expected = head[18] ? 21 + head[9] : 19;
        containerNeed(data.end - data.body >= expected);
        if (head[18]) {
            containerNeed(head[19] > 0 && head[20] <= head[19] && head.subarray(21, expected).every((v) => v === 255 || v < head[19] + head[20]));
            t.streamCount = head[19];
        }
        else
            containerNeed(head[9] <= 2);
        t.private = true;
        containerNeed(t.channels === head[9]);
        containerNeed(t.id > 0 && !tracks.has(t.id) && t.channels > 0);
        containerNeed(tracks.size < AUDIO_MAX_ACTIVE_STREAMS);
        tracks.set(t.id, t);
    }
    async function block(e, timecode, discard = 0) {
        const track = await containerVint(r, e.body);
        containerNeed(!track.unknown);
        const t = tracks.get(track.value);
        containerNeed(t);
        const flagsAt = e.body + track.width + 2;
        containerNeed(flagsAt < e.end);
        const h = await r.bytes(e.body + track.width, 3);
        const relative = new DataView(h.buffer, h.byteOffset, 3).getInt16(0), lace = (h[2] >> 1) & 3;
        let at = flagsAt + 1;
        const sizes = [];
        if (!lace)
            sizes.push(e.end - at);
        else {
            const count = await r.num(at++, 1) + 1;
            let total = 0;
            if (lace === 2) {
                containerNeed((e.end - at) % count === 0);
                sizes.push(...Array(count).fill((e.end - at) / count));
            }
            else {
                for (let i = 1; i < count; i++) {
                    let size = 0;
                    if (lace === 1) {
                        let value;
                        do {
                            value = await r.num(at++, 1);
                            size += value;
                            containerNeed(at <= e.end);
                        } while (value === 255);
                    }
                    else {
                        const v = await containerVint(r, at);
                        containerNeed(!v.unknown);
                        at += v.width;
                        size = i === 1 ? v.value : sizes[i - 2] + v.value - (2 ** (7 * v.width - 1) - 1);
                    }
                    containerNeed(size >= 1);
                    sizes.push(size);
                    total += size;
                }
                sizes.push(e.end - at - total);
            }
        }
        let samples = 0;
        for (const size of sizes) {
            containerNeed(size >= 1 && at + size <= e.end);
            samples += await containerOpusRange(r, at, at + size, t.streamCount);
            at += size;
            blocks++;
        }
        containerNeed(at === e.end);
        const start = (timecode + relative) * scale / 1e9 - t.delay;
        earliest = Math.min(earliest, start);
        latest = Math.max(latest, start + samples / 48000 - Math.max(0, discard));
    }
    async function cluster(e) {
        let timecode = null;
        for (let at = e.body; at < e.end;) {
            const c = await containerEbml(r, at, e.end);
            if (e.unknown && levelOne.has(c.id))
                return at;
            if (c.id === 0xe7) {
                containerNeed(c.end - c.body <= 8);
                timecode = await r.num(c.body, c.end - c.body);
            }
            if (c.id === 0xa3) {
                containerNeed(timecode !== null);
                await block(c, timecode);
            }
            if (c.id === 0xa0) {
                let payload = null, discard = 0;
                for (let pos = c.body; pos < c.end;) {
                    const g = await containerEbml(r, pos, c.end);
                    if (g.id === 0xa1) {
                        containerNeed(!payload);
                        payload = g;
                    }
                    if (g.id === 0x75a2) {
                        const n = g.end - g.body;
                        containerNeed(n > 0 && n <= 8);
                        const bytes = await r.bytes(g.body, n);
                        let value = bytes[0] & 128 ? -1 : 0;
                        for (const byte of bytes)
                            value = value * 256 + byte;
                        containerNeed(Number.isSafeInteger(value));
                        discard = value / 1e9;
                    }
                    pos = g.end;
                }
                containerNeed(payload && timecode !== null);
                await block(payload, timecode, discard);
            }
            // A cluster's unrecognized finite elements may be skipped, not reinterpreted.
            at = c.end;
        }
        return e.end;
    }
    for (let root = header.end; root < r.size;) {
        const segment = await containerEbml(r, root, r.size);
        if ([0xec, 0xbf].includes(segment.id)) {
            root = segment.end;
            continue;
        }
        containerNeed(segment.id === 0x18538067 && !segmentSeen);
        segmentSeen = true;
        for (let at = segment.body; at < segment.end;) {
            const e = await containerEbml(r, at, segment.end);
            if (e.id === 0x1549a966)
                for (let pos = e.body; pos < e.end;) {
                    const i = await containerEbml(r, pos, e.end);
                    if (i.id === 0x2ad7b1) {
                        containerNeed(i.end - i.body <= 8);
                        scale = await r.num(i.body, i.end - i.body);
                        containerNeed(scale > 0);
                    }
                    if (i.id === 0x4489)
                        declared = await containerFloat(r, i.body, i.end - i.body);
                    pos = i.end;
                }
            if (e.id === 0x1654ae6b)
                for (let pos = e.body; pos < e.end;) {
                    const t = await containerEbml(r, pos, e.end);
                    if (t.id === 0xae)
                        await entry(t);
                    pos = t.end;
                }
            if (e.id === 0x1254c367)
                await containerMatroskaTagFraming(r, e.body, e.end);
            if (e.id === 0x1f43b675) {
                at = await cluster(e);
                continue;
            }
            at = e.end;
        }
        root = segment.end;
    }
    containerNeed(segmentSeen && tracks.size > 0 && blocks > 0 && latest > 0);
    // Missing Duration is normal for MediaRecorder. Verified packet durations plus
    // cluster timestamps, codec delay and end discard give the playback timeline.
    const derived = latest - Math.max(0, earliest);
    if (declared !== null)
        containerNeed(declared > 0);
    return derived;
}
/** Opus packet framing from a bounded reader; padding need not be buffered. */
async function containerOpusRange(r, start, end, streams = 1) {
    let cursor = start, samples = 0;
    for (let stream = 0; stream < streams; stream++) {
        containerNeed(cursor < end);
        const selfDelimited = stream < streams - 1, toc = await r.num(cursor++, 1), code = toc & 3;
        let count = code === 0 ? 1 : 2, pad = 0, vbr = false;
        async function byte() { containerNeed(cursor < end); return r.num(cursor++, 1); }
        async function size() { const first = await byte(); return first < 252 ? first : first + 4 * await byte(); }
        const lengths = [];
        if (code === 2) {
            vbr = true;
            lengths.push(await size());
        }
        if (code === 3) {
            const flags = await byte();
            count = flags & 63;
            containerNeed(count > 0);
            vbr = Boolean(flags & 128);
            if (flags & 64) {
                let value;
                do {
                    value = await byte();
                    pad += value === 255 ? 254 : value;
                } while (value === 255);
            }
            if (vbr)
                for (let i = 1; i < count; i++)
                    lengths.push(await size());
        }
        if (selfDelimited) {
            const last = await size();
            if (vbr)
                lengths.push(last);
            else
                lengths.push(...Array(count).fill(last));
        }
        else {
            const available = end - cursor - pad;
            if (vbr)
                lengths.push(available - lengths.reduce((n, v) => n + v, 0));
            else {
                containerNeed(available % count === 0);
                lengths.push(...Array(count).fill(available / count));
            }
        }
        const config = toc >> 3, ms = config < 12 ? [10, 20, 40, 60][config % 4] : config < 16 ? [10, 20][config % 2] : [2.5, 5, 10, 20][config % 4];
        // Zero-byte frames are legal DTX, not absent packets. Self-delimited framing
        // supports mapped multichannel Opus without buffering its compressed payload.
        containerNeed(ms * count <= 120 && lengths.every((n) => n >= 0 && n <= 1275));
        cursor += lengths.reduce((n, v) => n + v, 0) + pad;
        containerNeed(cursor <= end);
        if (stream)
            containerNeed(samples === ms * count * 48);
        else
            samples = ms * count * 48;
    }
    containerNeed(cursor === end);
    return samples;
}
/** Incremental box walk: padding/unknown atoms never form a retained object graph. */
async function* containerBoxes(r, start, end) {
    for (let at = start; at < end;) {
        const h = await r.bytes(at, 8);
        let size = u32(h), header = 8;
        if (size === 1) {
            size = await r.num(at + 8, 8);
            header = 16;
        }
        if (size === 0)
            size = end - at;
        containerNeed(size >= header && at + size <= end);
        const type = containerText(h.subarray(4));
        if (size === 8 && ["free", "skip", "wide"].includes(type)) {
            // Audit F5: millions of legal empty atoms are padding, not an index. Walk
            // consecutive runs within bounded pages rather than allocate/yield objects.
            let cursor = at;
            while (cursor + 8 <= end) {
                const bytes = await r.bytes(cursor, Math.floor(Math.min(65536, end - cursor) / 8) * 8);
                let used = 0;
                for (; used < bytes.length; used += 8) {
                    const name = be32(bytes, used + 4);
                    if (be32(bytes, used) !== 8 || ![0x66726565, 0x736b6970, 0x77696465].includes(name))
                        break;
                }
                cursor += used;
                if (used < bytes.length)
                    break;
            }
            containerNeed(cursor > at);
            at = cursor;
            continue;
        }
        yield { type, at, body: at + header, end: at + size };
        at += size;
    }
}
/** Only singleton fields needed by this parser are indexed, never all siblings. */
async function containerBoxFields(r, start, end, names) {
    const result = new Map();
    for await (const box of containerBoxes(r, start, end))
        if (names.includes(box.type)) {
            containerNeed(!result.has(box.type));
            result.set(box.type, box);
        }
    return result;
}
/** Fixed-size numeric pages, with a fixed total workspace ceiling. No allocation
 * uses a file byte length, declared count, sample size or extent size. */
class AudioIndexPages {
    stride;
    pages = [];
    length = 0;
    constructor(stride) {
        this.stride = stride;
        // Reservation is constant for the parser, not a function of file size or a
        // hostile count. Each arena page is a fixed bounded numeric chunk.
        for (let n = 0; n < AUDIO_MAX_INDEX_ENTRIES / AUDIO_INDEX_PAGE_ENTRIES; n++)
            this.pages.push(new Float64Array(AUDIO_INDEX_PAGE_ENTRIES * stride));
    }
    add() {
        containerNeed(this.length < AUDIO_MAX_INDEX_ENTRIES);
        return this.length++;
    }
    get(index, field) { return this.pages[Math.floor(index / AUDIO_INDEX_PAGE_ENTRIES)][(index % AUDIO_INDEX_PAGE_ENTRIES) * this.stride + field]; }
    set(index, field, value) { this.pages[Math.floor(index / AUDIO_INDEX_PAGE_ENTRIES)][(index % AUDIO_INDEX_PAGE_ENTRIES) * this.stride + field] = value; }
}
class AudioExtentIndex {
    pool = new AudioIndexPages(2);
    get length() { return this.pool.length; }
    add(start, end) { const n = this.pool.add(); this.pool.set(n, 0, start); this.pool.set(n, 1, end); }
    start(n) { return this.pool.get(n, 0); }
    end(n) { return this.pool.get(n, 1); }
}
/** Bounded AVL range set: no file-sized bitmap and no O(n) insertion shifts. */
class AudioSampleReferences {
    size;
    pool = new AudioIndexPages(5); // start, end, left, right, height
    root = -1;
    bytes = 0;
    constructor(size) {
        this.size = size;
    }
    height(n) { return n < 0 ? 0 : this.pool.get(n, 4); }
    update(n) { this.pool.set(n, 4, 1 + Math.max(this.height(this.pool.get(n, 2)), this.height(this.pool.get(n, 3)))); }
    rotate(n, right) {
        const side = right ? 2 : 3, other = right ? 3 : 2, child = this.pool.get(n, side);
        this.pool.set(n, side, this.pool.get(child, other));
        this.pool.set(child, other, n);
        this.update(n);
        this.update(child);
        return child;
    }
    insert(n, start, end) {
        if (n < 0) {
            n = this.pool.add();
            this.pool.set(n, 0, start);
            this.pool.set(n, 1, end);
            this.pool.set(n, 2, -1);
            this.pool.set(n, 3, -1);
            this.pool.set(n, 4, 1);
            return n;
        }
        if (end <= this.pool.get(n, 0))
            this.pool.set(n, 2, this.insert(this.pool.get(n, 2), start, end));
        else if (start >= this.pool.get(n, 1))
            this.pool.set(n, 3, this.insert(this.pool.get(n, 3), start, end));
        else
            containerNeed(false);
        this.update(n);
        const left = this.pool.get(n, 2), right = this.pool.get(n, 3), balance = this.height(left) - this.height(right);
        if (balance > 1) {
            if (this.height(this.pool.get(left, 2)) < this.height(this.pool.get(left, 3)))
                this.pool.set(n, 2, this.rotate(left, false));
            return this.rotate(n, true);
        }
        if (balance < -1) {
            if (this.height(this.pool.get(right, 3)) < this.height(this.pool.get(right, 2)))
                this.pool.set(n, 3, this.rotate(right, true));
            return this.rotate(n, false);
        }
        return n;
    }
    add(at, size) {
        containerNeed(size > 0 && Number.isSafeInteger(at + size) && this.bytes + size <= this.size);
        const end = at + size;
        let node = this.root, before = -1, after = -1;
        while (node >= 0) {
            if (this.pool.get(node, 0) <= at) {
                before = node;
                node = this.pool.get(node, 3);
            }
            else {
                after = node;
                node = this.pool.get(node, 2);
            }
        }
        containerNeed((before < 0 || this.pool.get(before, 1) <= at) && (after < 0 || end <= this.pool.get(after, 0)));
        // Adjacent samples share an extent; ordinary long recordings consume state
        // per disjoint run, not per sample. No reference ever bypasses overlap checks.
        if (before >= 0 && this.pool.get(before, 1) === at)
            this.pool.set(before, 1, end);
        else if (after >= 0 && end === this.pool.get(after, 0))
            this.pool.set(after, 0, at);
        else
            this.root = this.insert(this.root, at, end);
        this.bytes += size;
    }
}
async function containerMp4(r) {
    let ftyp = false, movieScale = 0;
    // Only mdat extents are retained: they are the index required for sample lookup.
    const data = new AudioExtentIndex();
    for await (const box of containerBoxes(r, 0, r.size)) {
        if (box.type === "ftyp") {
            containerNeed(!ftyp && box.end - box.body >= 8 && (box.end - box.body) % 4 === 0);
            ftyp = true;
        }
        if (box.type === "mdat" && box.end > box.body)
            data.add(box.body, box.end);
        if (box.type === "moov")
            for await (const c of containerBoxes(r, box.body, box.end))
                if (c.type === "mvhd") {
                    const version = await r.num(c.body, 1);
                    containerNeed(version <= 1);
                    const pos = c.body + (version ? 20 : 12);
                    containerNeed(pos + 4 <= c.end);
                    movieScale = await r.num(pos);
                }
    }
    containerNeed(ftyp && data.length);
    const references = new AudioSampleReferences(r.size);
    let samples = 0;
    async function sample(at, size) {
        containerNeed(Number.isSafeInteger(at) && Number.isSafeInteger(size) && size > 0);
        let low = 0, high = data.length;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (data.start(mid) <= at)
                low = mid + 1;
            else
                high = mid;
        }
        containerNeed(low > 0 && at >= data.start(low - 1) && at + size <= data.end(low - 1));
        references.add(at, size);
        samples++;
        // AAC MP4 samples are raw access units (no ADTS sync header). Their sizes and
        // offsets are checked here; their compressed bits are explicitly not decoded.
    }
    const tracks = new Map(), defaults = new Map();
    async function table(box, t) {
        const children = await containerBoxFields(r, box.body, box.end, ["stsz", "stsc", "stco", "co64", "stsd", "stts"]), sz = children.get("stsz"), sc = children.get("stsc"), co = children.get("stco") ?? children.get("co64"), sd = children.get("stsd"), ts = children.get("stts");
        containerNeed(sd && sd.body + 8 <= sd.end && sz && sc && co && ts);
        const descriptionCount = await r.num(sd.body + 4);
        for await (const description of containerBoxes(r, sd.body + 8, sd.end)) {
            if (description.type !== "mp4a")
                throw new AudioUnsupportedType();
            containerNeed(description.end - description.body >= 28);
            t.descriptions++;
            const version = await r.num(description.body + 8, 2), extra = description.body + (version === 0 ? 28 : version === 1 ? 44 : version === 2 ? 64 : description.end - description.body);
            if (version > 2 || extra > description.end)
                throw new AudioUnsupportedType();
            else {
                if (!await containerMp4CodecConfiguration(r, extra, description.end))
                    throw new AudioUnsupportedType();
            }
        }
        containerNeed(t.descriptions > 0 && t.descriptions === descriptionCount);
        containerNeed(sz.body + 12 <= sz.end && sc.body + 8 <= sc.end && co.body + 8 <= co.end && ts.body + 8 <= ts.end);
        const fixed = await r.num(sz.body + 4), count = await r.num(sz.body + 8), entries = await r.num(sc.body + 4), chunks = await r.num(co.body + 4), width = co.type === "co64" ? 8 : 4;
        containerNeed(sz.body + 12 + (fixed ? 0 : count * 4) === sz.end && sc.body + 8 + entries * 12 === sc.end && co.body + 8 + chunks * width === co.end);
        // Every declared sample occupies at least one physical byte. Check aggregate
        // work BEFORE expanding fixed-size tables or repeated chunk references.
        containerNeed(count <= r.size && (!fixed || count * fixed <= r.size));
        let index = 0, entry = 0;
        for (let chunk = 1; chunk <= chunks; chunk++) {
            containerNeed(entries > 0 && await r.num(sc.body + 8) === 1);
            while (entry + 1 < entries && await r.num(sc.body + 8 + (entry + 1) * 12) <= chunk)
                entry++;
            const n = await r.num(sc.body + 12 + entry * 12), desc = await r.num(sc.body + 16 + entry * 12);
            containerNeed(n > 0 && n <= count - index && desc > 0 && desc <= t.descriptions);
            let at = await r.num(co.body + 8 + (chunk - 1) * width, width);
            for (let i = 0; i < n; i++) {
                const size = fixed || await r.num(sz.body + 12 + index * 4);
                await sample(at, size);
                at += size;
                index++;
            }
        }
        containerNeed(index === count);
        const times = await r.num(ts.body + 4);
        containerNeed(ts.body + 8 + times * 8 === ts.end);
        let total = 0, ticks = 0;
        for (let i = 0; i < times; i++) {
            const n = await r.num(ts.body + 8 + i * 8), duration = await r.num(ts.body + 12 + i * 8);
            containerNeed(n > 0 && duration > 0);
            total += n;
            ticks += n * duration;
        }
        containerNeed(total === count && Number.isSafeInteger(ticks));
        t.samples += count;
        t.ticks += ticks;
    }
    async function walk(items, depth = 0, t) {
        containerNeed(depth < 12);
        for await (const item of items) {
            if (item.type === "trak") {
                const children = await containerBoxFields(r, item.body, item.end, ["mdia", "tkhd", "edts"]), mdia = children.get("mdia"), tkhd = children.get("tkhd");
                containerNeed(mdia && tkhd);
                const media = await containerBoxFields(r, mdia.body, mdia.end, ["hdlr", "mdhd"]), handler = media.get("hdlr"), mdhd = media.get("mdhd");
                containerNeed(handler && handler.body + 12 <= handler.end && mdhd);
                const kind = await r.text(handler.body + 8, 4);
                if (kind === "vide")
                    throw new AudioVideoTrack();
                if (kind !== "soun")
                    continue;
                const version = await r.num(tkhd.body, 1), mv = await r.num(mdhd.body, 1);
                containerNeed(version <= 1 && mv <= 1);
                const idAt = tkhd.body + (version ? 20 : 12), scaleAt = mdhd.body + (mv ? 20 : 12);
                containerNeed(idAt + 4 <= tkhd.end && scaleAt + (mv ? 12 : 8) <= mdhd.end);
                const id = await r.num(idAt), scale = await r.num(scaleAt);
                containerNeed(id > 0 && scale > 0 && !tracks.has(id));
                const track = { id, scale, samples: 0, ticks: 0, timed: true, descriptions: 0 };
                const edts = children.get("edts");
                if (edts)
                    track.edits = (await containerBoxFields(r, edts.body, edts.end, ["elst"])).get("elst");
                containerNeed(tracks.size < AUDIO_MAX_ACTIVE_STREAMS);
                tracks.set(id, track);
                await walk(containerBoxes(r, mdia.body, mdia.end), depth + 1, track);
            }
            else if (["moov", "mdia", "minf", "mvex"].includes(item.type))
                await walk(containerBoxes(r, item.body, item.end), depth + 1, t);
            else if (item.type === "stbl" && t)
                await table(item, t);
            else if (item.type === "trex") {
                containerNeed(item.body + 24 === item.end);
                containerNeed(defaults.size < AUDIO_MAX_ACTIVE_STREAMS);
                defaults.set(await r.num(item.body + 4), { description: await r.num(item.body + 8), duration: await r.num(item.body + 12), size: await r.num(item.body + 16) });
            }
        }
    }
    await walk(containerBoxes(r, 0, r.size));
    for await (const moof of containerBoxes(r, 0, r.size))
        if (moof.type === "moof") {
            let previousTrafEnd = moof.at;
            for await (const traf of containerBoxes(r, moof.body, moof.end))
                if (traf.type === "traf") {
                    const items = await containerBoxFields(r, traf.body, traf.end, ["tfhd", "tfdt"]), tfhd = items.get("tfhd");
                    containerNeed(tfhd && tfhd.body + 8 <= tfhd.end);
                    const flags = await r.num(tfhd.body) & 0xffffff, track = tracks.get(await r.num(tfhd.body + 4));
                    containerNeed(track);
                    const initial = defaults.get(track.id);
                    let p = tfhd.body + 8, base = flags & 0x020000 ? moof.at : previousTrafEnd, defaultSize = initial?.size ?? 0, defaultDuration = initial?.duration ?? 0, desc = initial?.description ?? 1;
                    if (flags & 1) {
                        base = await r.num(p, 8);
                        p += 8;
                    }
                    if (flags & 2) {
                        desc = await r.num(p);
                        p += 4;
                    }
                    if (flags & 8) {
                        defaultDuration = await r.num(p);
                        p += 4;
                    }
                    if (flags & 16) {
                        defaultSize = await r.num(p);
                        p += 4;
                    }
                    if (flags & 32)
                        p += 4;
                    containerNeed(p === tfhd.end && desc > 0 && desc <= track.descriptions);
                    const decode = items.get("tfdt");
                    let time = track.ticks;
                    if (decode) {
                        const version = await r.num(decode.body, 1);
                        containerNeed(version <= 1 && decode.body + (version ? 12 : 8) === decode.end);
                        time = await r.num(decode.body + 4, version ? 8 : 4);
                    }
                    let offset = base;
                    for await (const trun of containerBoxes(r, traf.body, traf.end))
                        if (trun.type === "trun") {
                            containerNeed(trun.body + 8 <= trun.end);
                            const flags = await r.num(trun.body) & 0xffffff, count = await r.num(trun.body + 4);
                            let at = trun.body + 8;
                            if (flags & 1) {
                                const b = await r.bytes(at, 4);
                                offset = base + new DataView(b.buffer, b.byteOffset, 4).getInt32(0);
                                at += 4;
                            }
                            if (flags & 4)
                                at += 4;
                            const stride = ((flags & 256 ? 1 : 0) + (flags & 512 ? 1 : 0) + (flags & 1024 ? 1 : 0) + (flags & 2048 ? 1 : 0)) * 4;
                            containerNeed(at + count * stride === trun.end && count > 0 && count <= r.size && ((flags & 512) || count * defaultSize <= r.size));
                            for (let i = 0; i < count; i++) {
                                let duration = defaultDuration, size = defaultSize;
                                if (flags & 256) {
                                    duration = await r.num(at);
                                    at += 4;
                                }
                                if (flags & 512) {
                                    size = await r.num(at);
                                    at += 4;
                                }
                                if (flags & 1024)
                                    at += 4;
                                if (flags & 2048)
                                    at += 4;
                                await sample(offset, size);
                                offset += size;
                                track.samples++;
                                if (!duration)
                                    track.timed = false;
                                else
                                    time += duration;
                            }
                        }
                    previousTrafEnd = offset;
                    track.ticks = Math.max(track.ticks, time);
                }
        }
    containerNeed(samples > 0 && tracks.size > 0 && [...tracks.values()].every((t) => t.samples > 0));
    let duration = 0, reliable = true;
    for (const t of tracks.values()) {
        let seconds = null;
        if (t.timed && t.edits && movieScale > 0)
            seconds = await containerMp4Edits(r, t.edits, movieScale, t.scale, t.ticks);
        // Compressed sample timing without an understood presentation edit can include
        // unstated priming/padding. Do not publish it as an exact duration-cap value.
        if (seconds === null)
            reliable = false;
        else
            duration = Math.max(duration, seconds);
    }
    await containerMp4AuxiliaryFraming(r, containerBoxes(r, 0, r.size));
    return reliable ? duration : null;
}
async function containerMp4Edits(r, box, movieScale, mediaScale, mediaTicks) {
    containerNeed(box.body + 8 <= box.end);
    const version = await r.num(box.body, 1), count = await r.num(box.body + 4);
    containerNeed(version <= 1);
    const width = version ? 20 : 12;
    containerNeed(box.body + 8 + count * width === box.end);
    let duration = 0, media = false;
    for (let i = 0; i < count; i++) {
        const at = box.body + 8 + i * width, b = await r.bytes(at, width), view = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const ticks = version ? u64(b) : u32(b), time = version ? Number(view.getBigInt64(8)) : view.getInt32(4), rate = version ? 16 : 8;
        if (view.getInt16(rate) !== 1 || view.getUint16(rate + 2) !== 0 || !Number.isSafeInteger(time) || time < -1)
            return null;
        if (time >= 0) {
            if (time + ticks * mediaScale / movieScale > mediaTicks + 1)
                return null;
            media = true;
        }
        duration += ticks / movieScale;
    }
    return media && duration > 0 && Number.isFinite(duration) ? duration : null;
}
/** Nearest whole second; hours appear only when needed. */
export function formatAudioDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0)
        throw new Error("Invalid duration");
    const total = Math.round(seconds), hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, rest = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}
export function voiceNoteTooLongError(seconds, maxSeconds = DEFAULT_AUDIO_DURATION_CAPS.voicenote, audience = "person") {
    const measured = formatAudioDuration(seconds), allowed = formatAudioDuration(maxSeconds);
    return { code: "AUDIO_TOO_LONG", message: audience === "ai"
            ? `The voice note is ${measured}; the longest allowed is ${allowed}. Ask the person to record a shorter voice note.`
            : `This voice note is ${measured}; the longest is ${allowed}.` };
}
export function invalidAudioFileError(audience = "person") {
    return { code: "INVALID_AUDIO_CONTAINER", message: audience === "ai"
            ? "The file can't be added because it isn't a complete audio file. Ask the person for a complete audio file."
            : "This file can't be added: it isn't a complete audio file." };
}
export function audioVideoTrackError(audience = "person") {
    return { code: "AUDIO_HAS_VIDEO", message: audience === "ai"
            ? "The file has video in it. Add it as a file instead of a voice note."
            : "This file has video in it. Add it as a file instead of a voice note." };
}
/** Logical packet reads rescan only forward through physical Ogg pages; the
 * packet's size never determines an allocation or a growing segment index. */
function containerOggPacketReader(r, firstPage, firstBody, serial, length) {
    let page = firstPage, body = firstBody, logical = 0;
    return new AudioReader({ size: length, async read(at, count) {
            if (at < logical) {
                page = firstPage;
                body = firstBody;
                logical = 0;
            }
            const out = new Uint8Array(count);
            let written = 0;
            while (written < count) {
                const h = await r.bytes(page, 27), sizes = await r.bytes(page + 27, h[26]);
                const stop = page + 27 + sizes.length + sizes.reduce((n, v) => n + v, 0), available = stop - body;
                containerNeed(stop <= r.size && body <= stop);
                if (at < logical + available) {
                    const n = Math.min(count - written, logical + available - at);
                    out.set(await r.bytes(body + at - logical, n), written);
                    written += n;
                    at += n;
                }
                if (written < count) {
                    logical += available;
                    page = stop;
                    for (;;) {
                        const next = await r.bytes(page, 27), laces = await r.bytes(page + 27, next[26]);
                        const end = page + 27 + laces.length + laces.reduce((n, v) => n + v, 0);
                        containerNeed(end <= r.size);
                        if (u32(next, 14, true) === serial) {
                            body = page + 27 + laces.length;
                            break;
                        }
                        page = end;
                    }
                }
            }
            return out;
        } });
}
// Only length/framing checks are retained; comment names and values are opaque.
async function containerVorbisFraming(r, start, end) {
    let at = start;
    const vendor = await r.num(at, 4, true);
    at += 4;
    containerNeed(at + vendor + 4 <= end);
    at += vendor;
    const count = await r.num(at, 4, true);
    at += 4;
    containerNeed(count <= (end - at) / 4);
    for (let i = 0; i < count; i++) {
        const size = await r.num(at, 4, true);
        at += 4;
        containerNeed(at + size <= end);
        at += size;
    }
}
async function containerId3Framing(r, tag, end) {
    if (tag[5])
        return; // unchanged handling of extended/compressed/unsynchronised tags
    const version = tag[3], header = version === 2 ? 6 : 10;
    for (let at = 10; at < end;) {
        if (await r.num(at, 1) === 0)
            return;
        containerNeed(at + header <= end);
        const h = await r.bytes(at, header);
        let size = version === 2 ? h[3] * 65536 + h[4] * 256 + h[5] : u32(h, 4);
        if (version === 4) {
            if (h.subarray(4, 8).some((v) => v > 127))
                return;
            size = h[4] * 2097152 + h[5] * 16384 + h[6] * 128 + h[7];
        }
        at += header;
        containerNeed(size > 0 && at + size <= end);
        at += size;
    }
}
async function containerWaveInfoFraming(r, start, end) {
    if (end - start < 4 || await r.text(start, 4) !== "INFO")
        return;
    for (let at = start + 4; at < end;) {
        containerNeed(at + 8 <= end);
        const size = await r.num(at + 4, 4, true);
        containerNeed(at + 8 + size + size % 2 <= end);
        at += 8 + size + size % 2;
    }
}
async function containerMatroskaTagFraming(r, start, end, depth = 0) {
    if (depth >= 12)
        return;
    for (let at = start; at < end;) {
        const tag = await containerEbml(r, at, end);
        if (tag.id === 0x7373)
            await containerMatroskaTagFraming(r, tag.body, tag.end, depth + 1);
        else if (tag.id === 0x67c8)
            for (let pos = tag.body; pos < tag.end;) {
                const child = await containerEbml(r, pos, tag.end);
                if (child.id === 0x67c8)
                    await containerMatroskaTagFraming(r, pos, child.end, depth + 1);
                pos = child.end;
            }
        at = tag.end;
    }
}
// Preserve the existing auxiliary box/tag length checks, without interpreting
// text, tag ids, codec-independent payload values or privacy policy.
async function containerMp4AuxiliaryFraming(r, items, depth = 0, parent = "root") {
    if (depth >= 12)
        return;
    for await (const item of items) {
        if (["moov", "trak", "mdia", "minf", "dinf", "stbl", "edts", "mvex", "moof", "traf", "mfra", "udta"].includes(item.type))
            await containerMp4AuxiliaryFraming(r, containerBoxes(r, item.body, item.end), depth + 1, item.type);
        else if (item.type === "meta") {
            if (item.end - item.body < 4)
                continue;
            const start = await r.num(item.body) === 0 ? item.body + 4 : item.body;
            let keyCount = 0;
            for await (const keys of containerBoxes(r, start, item.end))
                if (keys.type === "keys") {
                    containerNeed(keys.body + 8 <= keys.end);
                    keyCount = await r.num(keys.body + 4);
                    let at = keys.body + 8;
                    containerNeed(keyCount <= (keys.end - at) / 8);
                    for (let i = 0; i < keyCount; i++) {
                        containerNeed(at + 8 <= keys.end);
                        const size = await r.num(at);
                        containerNeed(size >= 8 && at + size <= keys.end);
                        at += size;
                    }
                    containerNeed(at === keys.end);
                }
            for await (const child of containerBoxes(r, start, item.end))
                if (child.type === "ilst" && !keyCount) {
                    for await (const field of containerBoxes(r, child.body, child.end))
                        if (field.type === "----") {
                            for await (const _part of containerBoxes(r, field.body, field.end)) { /* bounds only */ }
                        }
                }
                else if (child.type === "ilst") {
                    for await (const _field of containerBoxes(r, child.body, child.end)) { /* bounds only */ }
                }
        }
        else if (item.type === "dref" && parent === "dinf") {
            const size = item.end - item.body;
            if (size >= 8 && await r.num(item.body) === 0)
                for await (const child of containerBoxes(r, item.body + 8, item.end)) {
                    if (child.type !== "url " || child.end - child.body !== 4 || await r.num(child.body) !== 1)
                        break;
                }
        }
    }
}
/** Peel legal end tags before parsing frames; tag bytes never count as audio. */
async function containerMpegTail(r) {
    let end = r.size;
    const seen = new Set();
    for (;;) {
        let kind = "", next = end;
        if (end >= 128 && await r.text(end - 128, 3) === "TAG") {
            containerNeed(seen.size === 0);
            kind = "id3v1";
            next -= 128;
        }
        else if (end >= 32 && await r.text(end - 32, 8) === "APETAGEX") {
            kind = "ape";
            const footer = await r.bytes(end - 32, 32), size = u32(footer, 12, true), count = u32(footer, 16, true), flags = u32(footer, 20, true);
            containerNeed(u32(footer, 8, true) === 2000 && size >= 32 && size <= end && !(flags & 0x60000000) && footer.subarray(24).every((v) => v === 0));
            let at = end - size;
            next = at;
            if (flags & 0x80000000) {
                next -= 32;
                const header = await r.bytes(next, 32);
                containerNeed(ascii(header, 0, "APETAGEX") && u32(header, 8, true) === 2000 && u32(header, 12, true) === size && u32(header, 16, true) === count && u32(header, 20, true) === ((flags | 0x20000000) >>> 0) && header.subarray(24).every((v) => v === 0));
            }
            containerNeed(count <= (size - 32) / 10);
            for (let item = 0; item < count; item++) {
                containerNeed(at + 8 <= end - 32);
                const length = await r.num(at, 4, true);
                at += 8;
                let key = "";
                for (let i = 0;; i++) {
                    containerNeed(i <= 255 && at < end - 32);
                    const byte = await r.num(at++, 1);
                    if (!byte)
                        break;
                    containerNeed(byte >= 32 && byte <= 126);
                    key += String.fromCharCode(byte);
                }
                containerNeed(key.length >= 2 && at + length <= end - 32);
                at += length;
            }
            containerNeed(at === end - 32);
        }
        else if (end >= 15 && await r.text(end - 9, 9) === "LYRICS200") {
            containerNeed(seen.has("id3v1"));
            kind = "lyrics";
            const digits = await r.text(end - 15, 6);
            containerNeed(/^\d{6}$/.test(digits));
            next = end - 15 - Number(digits);
            containerNeed(next >= 0 && await r.text(next, 11) === "LYRICSBEGIN");
            let at = next + 11, fields = 0;
            while (at < end - 15) {
                containerNeed(at + 8 <= end - 15);
                const lengthText = await r.text(at + 3, 5);
                containerNeed(/^\d{5}$/.test(lengthText));
                const n = Number(lengthText);
                at += 8;
                containerNeed(at + n <= end - 15);
                at += n;
                fields++;
            }
            containerNeed(fields > 0);
        }
        else if (end >= 20 && await r.text(end - 9, 9) === "LYRICSEND") {
            containerNeed(seen.has("id3v1"));
            kind = "lyrics";
            const start = Math.max(0, end - 5120), text = await r.text(start, end - 9 - start), index = text.lastIndexOf("LYRICSBEGIN");
            containerNeed(index >= 0);
            next = start + index;
        }
        else
            return end;
        containerNeed(!seen.has(kind) && next >= 0 && next < end);
        seen.add(kind);
        end = next;
    }
}
/** AAC codec identity and configuration framing; no tag interpretation. */
async function containerMp4CodecConfiguration(r, start, end, depth = 0) {
    containerNeed(depth < 12);
    let aac = false;
    for await (const box of containerBoxes(r, start, end)) {
        if (box.type === "wave")
            aac = await containerMp4CodecConfiguration(r, box.body, box.end, depth + 1) || aac;
        else if (box.type === "esds") {
            containerNeed(!aac);
            aac = await containerEsds(r, box.body, box.end);
        }
        else if (box.type === "btrt" && box.end - box.body === 12) { /* three numeric bitrate fields */ }
        else if (box.type === "frma" && box.end - box.body === 4 && await r.text(box.body, 4) === "mp4a") { /* QuickTime wave format */ }
    }
    return aac;
}
async function containerEsds(r, start, end) {
    containerNeed(start + 4 <= end && await r.num(start) === 0);
    let decoder = false, asc = false;
    async function descriptors(at, limit, parent, depth) {
        containerNeed(depth <= 4);
        while (at < limit) {
            const tag = await r.num(at++, 1);
            let size = 0, done = false;
            for (let i = 0; i < 4; i++) {
                containerNeed(at < limit);
                const byte = await r.num(at++, 1);
                size = size * 128 + (byte & 127);
                if (!(byte & 128)) {
                    done = true;
                    break;
                }
            }
            containerNeed(done && at + size <= limit);
            const stop = at + size;
            if (tag === 3 && parent === 0) {
                containerNeed(at + 3 <= stop);
                const flags = await r.num(at + 2, 1);
                let child = at + 3;
                if (flags & 128)
                    child += 2;
                if (flags & 64) {
                    containerNeed(child < stop);
                    child += 1 + await r.num(child, 1);
                }
                if (flags & 32)
                    child += 2;
                containerNeed(child <= stop);
                await descriptors(child, stop, 3, depth + 1);
            }
            else if (tag === 4 && parent === 3) {
                containerNeed(!decoder && at + 13 <= stop);
                const object = await r.num(at, 1), stream = await r.num(at + 1, 1);
                if (![0x40, 0x66, 0x67, 0x68].includes(object) || (stream >> 2) !== 5)
                    throw new AudioUnsupportedType();
                containerNeed(stream & 1);
                decoder = true;
                await descriptors(at + 13, stop, 4, depth + 1);
            }
            else if (tag === 5 && parent === 4) {
                containerNeed(!asc && size >= 2);
                await containerAacConfig(r, at, stop);
                asc = true;
            }
            else if (tag === 6 && parent === 3 && size === 1 && await r.num(at, 1) === 2) { /* SL predefined MP4 */ }
            at = stop;
        }
    }
    await descriptors(start + 4, end, 0, 0);
    return decoder && asc;
}
async function containerAacConfig(r, start, end) {
    const bits = new AudioBits(r, start);
    async function read(n) { containerNeed(bits.bit + n <= end * 8); return bits.read(n); }
    async function object() { const n = await read(5); return n === 31 ? 32 + await read(6) : n; }
    async function frequency() { const index = await read(4); containerNeed(index < 13 || index === 15); if (index === 15)
        containerNeed(await read(24) > 0); }
    let type = await object();
    await frequency();
    const channels = await read(4);
    containerNeed(channels <= 7);
    const aacTypes = [1, 2, 3, 4, 5, 6, 17, 19, 20, 21, 22, 23, 29, 39, 42];
    if (!aacTypes.includes(type))
        throw new AudioUnsupportedType();
    if (type === 5 || type === 29) {
        await frequency();
        type = await object();
        if (!aacTypes.includes(type))
            throw new AudioUnsupportedType();
    }
    // Basic GASpecificConfig is positively understood. Complex PCE/ER/USAC
    // configurations retain AAC identity; their complex layout is not decoded.
    if (![1, 2, 3, 4].includes(type) || channels === 0 || end - start > 512) {
        return;
    }
    await read(1);
    if (await read(1))
        await read(14);
    const extension = await read(1);
    if (extension) {
        return;
    }
    if (end * 8 - bits.bit >= 16) {
        const sync = await read(11);
        if (sync === 0x2b7) {
            const ext = await object();
            if (ext !== 5) {
                return;
            }
            if (await read(1))
                await frequency();
        }
        else if (sync !== 0) {
            return;
        }
    }
    if (end * 8 - bits.bit >= 12) {
        const sync = await read(11);
        if (sync === 0x548)
            await read(1);
        else if (sync !== 0) {
            return;
        }
    }
    while (bits.bit < end * 8)
        if (await read(1)) {
            return;
        }
}
export function unsupportedAudioTypeError(audience = "person") {
    return { code: "UNSUPPORTED_AUDIO_TYPE", message: audience === "ai"
            ? "The audio codec isn't accepted here. Ask the person to save it as M4A, MP3 or WAV."
            : "This kind of audio can't be added here. Try saving it as M4A, MP3 or WAV." };
}
/** Select the sentence by refusal reason; unsupported never means incomplete. */
export function audioContainerError(reason, audience = "person") {
    switch (reason) {
        case "unsupported-type": return unsupportedAudioTypeError(audience);
        case "video-track": return audioVideoTrackError(audience);
        case "invalid-container": return invalidAudioFileError(audience);
    }
}
