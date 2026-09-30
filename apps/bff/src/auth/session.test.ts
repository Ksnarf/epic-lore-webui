import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  LOGIN_ATTEMPT_COOKIE,
  readLoginAttemptCookie,
  readSessionCookie,
  SESSION_COOKIE,
  setLoginAttemptCookie,
  setSessionCookie,
} from "./session.js";

const SECRET = "test-session-secret";

/** Minimal fake matching only what session.ts actually reads/calls -- no real Fastify instance needed for this pure round-trip logic. */
function fakeRequest(cookies: Record<string, string | undefined>): FastifyRequest {
  return { cookies } as unknown as FastifyRequest;
}

function fakeReply() {
  const cookies: Record<string, { value: string; options: unknown }> = {};
  const cleared: string[] = [];
  const reply = {
    setCookie(name: string, value: string, options: unknown) {
      cookies[name] = { value, options };
      return reply;
    },
    clearCookie(name: string) {
      cleared.push(name);
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, cookies, cleared };
}

describe("auth/session (v1 task 8)", () => {
  it("round-trips a session cookie", () => {
    const { reply, cookies } = fakeReply();
    const payload = { userToken: "tok", userId: "u1", userName: "Kilgore Trout", expiresAt: Date.now() + 60_000 };
    setSessionCookie(reply, SECRET, true, payload);

    const request = fakeRequest({ [SESSION_COOKIE]: cookies[SESSION_COOKIE]!.value });
    expect(readSessionCookie(request, SECRET)).toEqual(payload);
  });

  it("treats an already-expired session as absent", () => {
    const { reply, cookies } = fakeReply();
    setSessionCookie(reply, SECRET, true, {
      userToken: "tok",
      userId: "u1",
      userName: "Kilgore Trout",
      expiresAt: Date.now() - 1000, // already expired
    });
    const request = fakeRequest({ [SESSION_COOKIE]: cookies[SESSION_COOKIE]!.value });
    expect(readSessionCookie(request, SECRET)).toBeUndefined();
  });

  it("treats a cookie encrypted under a different secret as absent", () => {
    const { reply, cookies } = fakeReply();
    setSessionCookie(reply, "a-different-secret", true, {
      userToken: "tok",
      userId: "u1",
      userName: "Kilgore Trout",
      expiresAt: Date.now() + 60_000,
    });
    const request = fakeRequest({ [SESSION_COOKIE]: cookies[SESSION_COOKIE]!.value });
    expect(readSessionCookie(request, SECRET)).toBeUndefined();
  });

  it("treats no cookie at all as absent", () => {
    expect(readSessionCookie(fakeRequest({}), SECRET)).toBeUndefined();
  });

  it("round-trips a login-attempt cookie", () => {
    const { reply, cookies } = fakeReply();
    const payload = { sessionCode: "sc", clientState: "cs", createdAt: Date.now() };
    setLoginAttemptCookie(reply, SECRET, true, payload);

    const request = fakeRequest({ [LOGIN_ATTEMPT_COOKIE]: cookies[LOGIN_ATTEMPT_COOKIE]!.value });
    expect(readLoginAttemptCookie(request, SECRET)).toEqual(payload);
  });

  it("clearSessionCookie clears the right cookie name", () => {
    const { reply, cleared } = fakeReply();
    clearSessionCookie(reply, true);
    expect(cleared).toEqual([SESSION_COOKIE]);
  });
});
