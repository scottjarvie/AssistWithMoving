// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- synthetic Node socket and response boundaries. */
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { httpsRequestMock } = vi.hoisted(() => ({ httpsRequestMock: vi.fn() }));
vi.mock("node:https", () => ({ request: httpsRequestMock }));

import {
  fetchClientMetadata,
  METADATA_TIMEOUT_MS,
} from "../../convex/mcpClientMetadata";
import {
  clearClientMetadataCache,
  MAX_METADATA_BYTES,
  resolveClientIdentity,
  validateClientMetadataDocument,
} from "../../convex/lib/mcpClientIdentity";

const CLIENT_ID = "https://client.example/client.json";
const document = JSON.stringify({
  client_id: CLIENT_ID,
  client_name: "Synthetic client",
  redirect_uris: ["https://client.example/callback"],
});
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const dualStackAnswers = [
  { address: "2606:4700:4700::1111", family: 6 },
  { address: "93.184.216.34", family: 4 },
];
const response = (body: Iterable<Uint8Array> | AsyncIterable<Uint8Array>) => ({
  status: 200,
  headers: new Headers(),
  body,
  destroy: vi.fn(),
});

beforeEach(() => {
  clearClientMetadataCache();
  httpsRequestMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("#220 client metadata outbound policy", () => {
  it.each([
    "localhost", "sub.localhost", "host.local", "127.0.0.1", "127.1",
    "2130706433", "0x7f000001", "0177.0.0.1", "0.0.0.0", "10.0.0.1",
    "100.64.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1",
    "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "255.255.255.255", "[::]", "[::1]",
    "[::2]", "[::ffff:127.0.0.1]", "[::ffff:93.184.216.34]",
    "[fc00::1]", "[fe80::1]", "[fec0::1]", "[64:ff9b::7f00:1]",
    "[100::1]", "[2001:db8::1]", "[2002:7f00:1::1]", "[3fff:1::1]",
    "[4000::1]",
  ])("refuses non-public literal or local hostname %s before any request", async (host) => {
    const lookupFn = vi.fn(publicLookup);
    const requestFn = vi.fn();
    await expect(fetchClientMetadata(`https://${host}/client.json`, {
      lookupFn, requestFn,
    })).rejects.toThrow();
    expect(lookupFn).not.toHaveBeenCalled();
    expect(requestFn).not.toHaveBeenCalled();
  });

  it.each([
    "10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.0.1",
    "100.64.0.1", "::1", "::2", "::ffff:127.0.0.1", "fc00::1",
    "fe80::1", "fec0::1", "4000::1", "3fff:1::1",
  ])("refuses DNS containing a non-public answer, including mixed results: %s", async (address) => {
    const requestFn = vi.fn();
    for (const mixed of [false, true]) {
      await expect(fetchClientMetadata(CLIENT_ID, {
        lookupFn: async () => [
          ...(mixed ? await publicLookup() : []),
          { address, family: address.includes(":") ? 6 : 4 },
        ],
        requestFn,
      })).rejects.toThrow(/public Internet addresses/);
    }
    expect(requestFn).not.toHaveBeenCalled();
  });

  it.each([
    { answers: [] },
    { answers: [{ address: "invalid", family: 4 }] },
  ])("fails closed on unusable DNS answers: $answers", async ({ answers }) => {
    const requestFn = vi.fn();
    await expect(fetchClientMetadata(CLIENT_ID, {
      lookupFn: async () => answers, requestFn,
    })).rejects.toThrow();
    expect(requestFn).not.toHaveBeenCalled();
  });

  it.each([
    { address: "93.184.216.34", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ])("allows public IPv$family DNS and passes the validated address to the transport", async (answer) => {
    const requestFn = vi.fn(async () => response([Buffer.from(document)]));
    expect(await fetchClientMetadata(CLIENT_ID, {
      lookupFn: async () => [answer], requestFn,
    })).toBe(document);
    expect(requestFn).toHaveBeenCalledWith(expect.objectContaining({
      ...answer, accept: "application/json",
    }));
  });

  it("tries the next validated address when the first public address is unreachable", async () => {
    const lookupFn = vi.fn(async () => dualStackAnswers);
    const requestFn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("Network unreachable"), { code: "ENETUNREACH" }))
      .mockResolvedValueOnce(response([Buffer.from(document)]));
    expect(await fetchClientMetadata(CLIENT_ID, { lookupFn, requestFn })).toBe(document);
    expect(lookupFn).toHaveBeenCalledTimes(1);
    expect(requestFn).toHaveBeenCalledTimes(2);
    dualStackAnswers.forEach((answer, index) => {
      expect(requestFn).toHaveBeenNthCalledWith(index + 1, expect.objectContaining({
        ...answer, url: new URL(CLIENT_ID), accept: "application/json",
      }));
    });
  });

  it.each([0, 1_000])("falls back from a stalled IPv6 connection to pinned IPv4 after %sms of DNS", async (dnsMs) => {
    vi.useFakeTimers();
    const sockets: any[] = [];
    const lookupFn = vi.fn(async () => {
      if (dnsMs) await new Promise((resolve) => setTimeout(resolve, dnsMs));
      return dualStackAnswers;
    });
    httpsRequestMock.mockImplementation((url, options, onResponse) => {
      const answer = dualStackAnswers[sockets.length];
      expect(url.href).toBe(CLIENT_ID);
      expect(options).toMatchObject({
        agent: false, autoSelectFamily: false,
        headers: { accept: "application/json" },
      });
      expect(options.rejectUnauthorized).not.toBe(false);
      expect(options.checkServerIdentity).toBeUndefined();
      const callback = vi.fn();
      options.lookup("client.example", {}, callback);
      expect(callback).toHaveBeenCalledWith(null, answer.address, answer.family);
      const socket = new EventEmitter() as any;
      socket.destroy = vi.fn((error) => socket.emit("error", error));
      socket.end = () => {
        if (answer.family === 4) queueMicrotask(() => {
          const stream = Readable.from([Buffer.from(document)]);
          Object.assign(stream, { statusCode: 200, headers: {} });
          onResponse(stream);
        });
      };
      sockets.push(socket);
      return socket;
    });
    const pending = fetchClientMetadata(CLIENT_ID, { lookupFn });
    const assertion = expect(pending).resolves.toBe(document);
    const firstAttemptMs = (METADATA_TIMEOUT_MS - dnsMs) / dualStackAnswers.length;
    await vi.advanceTimersByTimeAsync(dnsMs + firstAttemptMs - 1);
    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
    expect(sockets[0].destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(sockets[0].destroy).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
    expect(sockets[1].destroy).not.toHaveBeenCalled();
    expect(httpsRequestMock).toHaveBeenCalledTimes(2);
    expect(lookupFn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets a successful first address stream beyond its connection budget within the total deadline", async () => {
    vi.useFakeTimers();
    const socket = new EventEmitter() as any;
    socket.destroy = vi.fn((error) => socket.emit("error", error));
    socket.end = () => queueMicrotask(() => {
      const stream = Readable.from((async function* () {
        yield Buffer.from(document.slice(0, 1));
        await new Promise((resolve) => setTimeout(resolve, 4_000));
        yield Buffer.from(document.slice(1));
      })());
      Object.assign(stream, { statusCode: 200, headers: {} });
      httpsRequestMock.mock.calls[0][2](stream);
    });
    httpsRequestMock.mockReturnValue(socket);
    const pending = fetchClientMetadata(CLIENT_ID, { lookupFn: async () => dualStackAnswers });
    const assertion = expect(pending).resolves.toBe(document);
    await vi.advanceTimersByTimeAsync(4_000);
    await assertion;
    expect(socket.destroy).not.toHaveBeenCalled();
    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares the remaining deadline across address attempts and streaming", async () => {
    vi.useFakeTimers();
    const remote = response((async function* () {
      yield Buffer.from("{");
      await new Promise(() => undefined);
    })());
    const requestFn = vi.fn()
      .mockImplementationOnce(() => new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("Connection failed")), 1_000);
      }))
      .mockResolvedValueOnce(remote);
    const pending = fetchClientMetadata(CLIENT_ID, {
      lookupFn: async () => dualStackAnswers, requestFn,
    });
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(1_000);
    const secondAttempt = requestFn.mock.calls[1]?.[0];
    await vi.advanceTimersByTimeAsync(METADATA_TIMEOUT_MS - 1_000);
    await assertion;
    expect(secondAttempt).toEqual(expect.objectContaining({
      ...dualStackAnswers[1], timeoutMs: METADATA_TIMEOUT_MS - 1_000,
    }));
    expect(remote.destroy).toHaveBeenCalled();
  });

  it("does not start another connection after the total deadline", async () => {
    vi.useFakeTimers();
    const requestFn = vi.fn(() => new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("Connection failed")), METADATA_TIMEOUT_MS);
    }));
    const pending = fetchClientMetadata(CLIENT_ID, {
      lookupFn: async () => dualStackAnswers, requestFn,
    });
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(METADATA_TIMEOUT_MS);
    await assertion;
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it("fails when all validated addresses are unreachable", async () => {
    const error = Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" });
    const requestFn = vi.fn().mockRejectedValue(error);
    await expect(fetchClientMetadata(CLIENT_ID, {
      lookupFn: async () => dualStackAnswers, requestFn,
    })).rejects.toBe(error);
    expect(requestFn).toHaveBeenCalledTimes(2);
  });

  it.each([301, 302, 303, 307, 308])("refuses HTTP %s without requesting a redirect destination", async (status) => {
    const destroy = vi.fn();
    const requestFn = vi.fn(async () => ({
      ...response([]), status,
      headers: new Headers({ location: "https://127.0.0.1/internal" }), destroy,
    }));
    await expect(fetchClientMetadata(CLIENT_ID, {
      lookupFn: async () => dualStackAnswers, requestFn,
    })).rejects.toThrow(/0-redirect limit/);
    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalled();
  });

  it.each([
    "http://client.example/client.json",
    "https://user:password@client.example/client.json",
    `${CLIENT_ID}#fragment`,
  ])("rejects invalid metadata URLs before DNS: %s", async (clientId) => {
    const lookupFn = vi.fn(publicLookup);
    const requestFn = vi.fn();
    await expect(fetchClientMetadata(clientId, { lookupFn, requestFn })).rejects.toThrow();
    expect(lookupFn).not.toHaveBeenCalled();
    expect(requestFn).not.toHaveBeenCalled();
  });

  it.each([false, true])("pins the actual HTTPS socket lookup, retaining hostname and TLS defaults (fallback: %s)", async (fallback) => {
    const answers = fallback ? dualStackAnswers : await publicLookup();
    const lookupFn = vi.fn()
      .mockResolvedValueOnce(answers)
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    httpsRequestMock.mockImplementation((url, options, onResponse) => {
      expect(url.href).toBe(CLIENT_ID);
      expect(options).toMatchObject({
        agent: false, autoSelectFamily: false,
        headers: { accept: "application/json" },
      });
      expect(options.rejectUnauthorized).not.toBe(false);
      expect(options.checkServerIdentity).toBeUndefined();
      const callback = vi.fn();
      options.lookup("client.example", {}, callback);
      const answer = answers[httpsRequestMock.mock.calls.length - 1];
      expect(callback).toHaveBeenCalledWith(null, answer.address, answer.family);
      const socket = new EventEmitter() as any;
      socket.end = () => queueMicrotask(() => {
        if (fallback && answer.family === 6) {
          socket.emit("error", Object.assign(new Error("Network unreachable"), { code: "ENETUNREACH" }));
          return;
        }
        const stream = Readable.from([Buffer.from(document)]);
        Object.assign(stream, { statusCode: 200, headers: {} });
        onResponse(stream);
      });
      return socket;
    });
    expect(await fetchClientMetadata(CLIENT_ID, { lookupFn })).toBe(document);
    expect(lookupFn).toHaveBeenCalledTimes(1);
    expect(httpsRequestMock).toHaveBeenCalledTimes(answers.length);
  });

  it("destroys a stalled HTTPS request even before headers arrive", async () => {
    vi.useFakeTimers();
    const socket = new EventEmitter() as any;
    socket.end = vi.fn();
    socket.destroy = vi.fn((error) => socket.emit("error", error));
    httpsRequestMock.mockReturnValue(socket);
    const pending = fetchClientMetadata(CLIENT_ID, { lookupFn: publicLookup });
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(METADATA_TIMEOUT_MS);
    await assertion;
    expect(METADATA_TIMEOUT_MS).toBe(5_000);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it("includes DNS resolution in the total deadline and never requests after timeout", async () => {
    vi.useFakeTimers();
    let finishDns!: (value: Awaited<ReturnType<typeof publicLookup>>) => void;
    const requestFn = vi.fn();
    const pending = fetchClientMetadata(CLIENT_ID, {
      lookupFn: () => new Promise((resolve) => { finishDns = resolve; }), requestFn,
    });
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(METADATA_TIMEOUT_MS);
    await assertion;
    finishDns(await publicLookup());
    await vi.advanceTimersByTimeAsync(0);
    expect(requestFn).not.toHaveBeenCalled();
  });

  it("aborts a slow streaming body at the total deadline", async () => {
    vi.useFakeTimers();
    async function* slowBody() {
      yield Buffer.from("{");
      await new Promise(() => undefined);
    }
    const remote = response(slowBody());
    const pending = fetchClientMetadata(CLIENT_ID, {
      lookupFn: publicLookup, requestFn: async () => remote,
    });
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(METADATA_TIMEOUT_MS);
    await assertion;
    expect(remote.destroy).toHaveBeenCalled();
  });

  it("rejects an oversized Content-Length before reading the body", async () => {
    const iterator = vi.fn();
    const remote = response({ [Symbol.iterator]: iterator });
    remote.headers.set("content-length", String(MAX_METADATA_BYTES + 1));
    await expect(fetchClientMetadata(CLIENT_ID, {
      lookupFn: publicLookup, requestFn: async () => remote,
    })).rejects.toThrow(/32768-byte/);
    expect(iterator).not.toHaveBeenCalled();
    expect(remote.destroy).toHaveBeenCalled();
  });

  it.each([undefined, "1"])("aborts chunked overflow despite declared length %s", async (length) => {
    const readPastLimit = vi.fn();
    function* chunks() {
      yield Buffer.alloc(MAX_METADATA_BYTES);
      yield Buffer.from("x");
      readPastLimit();
      yield Buffer.alloc(MAX_METADATA_BYTES);
    }
    const remote = response(chunks());
    if (length) remote.headers.set("content-length", length);
    await expect(fetchClientMetadata(CLIENT_ID, {
      lookupFn: publicLookup, requestFn: async () => remote,
    })).rejects.toThrow(/32768-byte/);
    expect(remote.destroy).toHaveBeenCalled();
    expect(readPastLimit).not.toHaveBeenCalled();
  });

  it("accepts exactly 32 KiB, retaining self-ID and digest validation", async () => {
    const raw = document.padEnd(MAX_METADATA_BYTES, " ");
    const identity = await resolveClientIdentity(CLIENT_ID, {
      fetchMetadata: (clientId) => fetchClientMetadata(clientId, {
        lookupFn: publicLookup, requestFn: async () => response([Buffer.from(raw)]),
      }),
    });
    expect(identity.clientId).toBe(CLIENT_ID);
    expect(identity.metadataDigest).toMatch(/^[a-f0-9]{64}$/);
    await expect(resolveClientIdentity("https://other.example/client.json", {
      fetchMetadata: (clientId) => fetchClientMetadata(clientId, {
        lookupFn: publicLookup, requestFn: async () => response([Buffer.from(raw)]),
      }),
    })).rejects.toMatchObject({ reason: "client_id_mismatch" });
  });

  it("measures Unicode metadata in bytes rather than characters", async () => {
    const raw = JSON.stringify({ client_id: CLIENT_ID, padding: "é".repeat(20_000) });
    expect(raw.length).toBeLessThan(MAX_METADATA_BYTES);
    await expect(validateClientMetadataDocument(CLIENT_ID, raw))
      .rejects.toMatchObject({ reason: "metadata_too_large" });
  });

  it("has no unsafe platform-fetch fallback when the safe loader is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveClientIdentity(CLIENT_ID))
      .rejects.toMatchObject({ reason: "metadata_fetch_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
