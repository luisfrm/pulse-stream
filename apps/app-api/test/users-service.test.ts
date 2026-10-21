import { describe, expect, it, vi } from "vitest";

import {
  EmailTakenError,
  UsernameTakenError,
  type CreateUserWithOAuthInput,
} from "../src/features/users/repository";
import { resolveGoogleUser } from "../src/features/users/service";
import { TEST_USER_ID, fakeRepository, fakeUser } from "./helpers";

describe("resolveGoogleUser", () => {
  it("crea el usuario OAuth con email lowercase y username del local-part", async () => {
    const created = fakeUser({
      id: TEST_USER_ID,
      email: "new.user@example.com",
      username: "new.user",
    });
    const createUserWithOAuth = vi.fn(
      async (_input: CreateUserWithOAuthInput) => created,
    );
    const repository = fakeRepository({
      findByOAuth: async () => null,
      findByEmail: async () => null,
      createUserWithOAuth,
    });

    const user = await resolveGoogleUser(
      { subject: "google-sub-1", email: "New.User@Example.com" },
      repository,
    );

    expect(user).toBe(created);
    expect(createUserWithOAuth).toHaveBeenCalledWith({
      email: "new.user@example.com",
      username: "new.user",
      provider: "google",
      providerAccountId: "google-sub-1",
      oauthEmail: "new.user@example.com",
    });
  });

  it("linkea por email sin tocar role/username/hashed_password", async () => {
    const existing = fakeUser({
      email: "boss@example.com",
      role: "admin",
      username: "boss",
      hashed_password: "already-hashed",
    });
    const linkOAuth = vi.fn(async () => undefined);
    const createUserWithOAuth = vi.fn(
      async (_input: CreateUserWithOAuthInput) => existing,
    );
    const repository = fakeRepository({
      findByOAuth: async () => null,
      findByEmail: async () => existing,
      linkOAuth,
      createUserWithOAuth,
    });

    const user = await resolveGoogleUser(
      { subject: "google-sub-2", email: "BOSS@example.com" },
      repository,
    );

    expect(user).toBe(existing);
    expect(user.role).toBe("admin");
    expect(user.username).toBe("boss");
    expect(user.hashed_password).toBe("already-hashed");
    expect(linkOAuth).toHaveBeenCalledWith(existing.id, {
      provider: "google",
      providerAccountId: "google-sub-2",
      email: "boss@example.com",
    });
    expect(createUserWithOAuth).not.toHaveBeenCalled();
  });

  it("si (provider, subject) ya existe, no busca por email ni crea", async () => {
    const linked = fakeUser({ id: TEST_USER_ID });
    const findByEmail = vi.fn(async () => {
      throw new Error("findByEmail should not be called");
    });
    const linkOAuth = vi.fn(async () => undefined);
    const repository = fakeRepository({
      findByOAuth: async () => linked,
      findByEmail,
      linkOAuth,
    });

    const user = await resolveGoogleUser(
      { subject: "google-sub-3", email: linked.email },
      repository,
    );

    expect(user).toBe(linked);
    expect(findByEmail).not.toHaveBeenCalled();
    expect(linkOAuth).not.toHaveBeenCalled();
  });

  it("reintenta con sufijo cuando el username está tomado", async () => {
    let attempts = 0;
    const createUserWithOAuth = vi.fn(
      async (input: CreateUserWithOAuthInput) => {
        attempts += 1;
        if (attempts === 1) throw new UsernameTakenError();
        return fakeUser({
          id: TEST_USER_ID,
          email: input.email,
          username: input.username,
        });
      },
    );
    const repository = fakeRepository({
      findByOAuth: async () => null,
      findByEmail: async () => null,
      createUserWithOAuth,
    });

    const user = await resolveGoogleUser(
      { subject: "google-sub-4", email: "user@example.com" },
      repository,
    );

    expect(user.username).toBe("user-2");
    expect(createUserWithOAuth).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ username: "user" }),
    );
    expect(createUserWithOAuth).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ username: "user-2" }),
    );
  });

  it("resuelve la carrera de email: re-busca y linkea", async () => {
    const concurrent = fakeUser({ email: "user@example.com" });
    let emailLookups = 0;
    const findByEmail = vi.fn(async () => {
      emailLookups += 1;
      return emailLookups === 1 ? null : concurrent;
    });
    const linkOAuth = vi.fn(async () => undefined);
    const createUserWithOAuth = vi.fn(
      async (_input: CreateUserWithOAuthInput) => {
        throw new EmailTakenError();
      },
    );
    const repository = fakeRepository({
      findByOAuth: async () => null,
      findByEmail,
      linkOAuth,
      createUserWithOAuth,
    });

    const user = await resolveGoogleUser(
      { subject: "google-sub-5", email: "user@example.com" },
      repository,
    );

    expect(user).toBe(concurrent);
    expect(emailLookups).toBe(2);
    expect(linkOAuth).toHaveBeenCalledWith(concurrent.id, {
      provider: "google",
      providerAccountId: "google-sub-5",
      email: "user@example.com",
    });
  });
});
