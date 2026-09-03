import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    character: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { GET, POST, PATCH } from "@/app/api/characters/route";

const authed = (id = "u1") =>
  getServerSession.mockResolvedValue({ user: { id, email: "u@example.com" } });

const jsonReq = (body) =>
  new Request("http://localhost/api/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("characters API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/characters", () => {
    it("returns hardcoded defaults even when the DB is unavailable", async () => {
      getServerSession.mockResolvedValue(null);
      prisma.character.findMany.mockRejectedValue(new Error("DB down"));

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.characters.length).toBeGreaterThanOrEqual(8);
      expect(body.characters.some((c) => c.name === "Albert Einstein")).toBe(true);
    });

    it("merges public custom characters with the defaults", async () => {
      authed();
      prisma.character.findMany.mockResolvedValue([
        { id: "c1", name: "Custom Bot", isCustom: true, isPublic: true },
      ]);

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.characters.some((c) => c.id === "c1")).toBe(true);
      expect(body.characters.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe("POST /api/characters", () => {
    const valid = {
      name: "Test Bot",
      avatar: "🤖",
      description: "A test character",
      personality: "Helpful",
      systemPrompt: "You are a test.",
      greeting: "Hello!",
    };

    it("rejects unauthenticated requests with 401", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await POST(jsonReq(valid));
      expect(res.status).toBe(401);
      expect(prisma.character.create).not.toHaveBeenCalled();
    });

    it("rejects missing required fields with 400", async () => {
      authed();
      const res = await POST(jsonReq({ name: "Only name" }));
      expect(res.status).toBe(400);
      expect(prisma.character.create).not.toHaveBeenCalled();
    });

    it("creates a character for an authenticated user", async () => {
      authed("u1");
      prisma.character.create.mockResolvedValue({ id: "c9", ...valid, userId: "u1" });

      const res = await POST(jsonReq(valid));
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.character.id).toBe("c9");
      expect(prisma.character.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Test Bot",
          isCustom: true,
          isPublic: true,
          userId: "u1",
        }),
      });
    });

    it("honours the is_public flag", async () => {
      authed("u1");
      prisma.character.create.mockResolvedValue({ id: "c10" });

      await POST(jsonReq({ ...valid, is_public: false }));
      expect(prisma.character.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isPublic: false }),
      });
    });
  });

  describe("PATCH /api/characters", () => {
    it("requires authentication", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await PATCH(jsonReq({ characterId: "c1", isPublic: true }));
      expect(res.status).toBe(401);
    });

    it("validates input shape", async () => {
      authed();
      const res = await PATCH(jsonReq({ characterId: "c1" }));
      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown characters", async () => {
      authed();
      prisma.character.findUnique.mockResolvedValue(null);
      const res = await PATCH(jsonReq({ characterId: "nope", isPublic: true }));
      expect(res.status).toBe(404);
    });

    it("forbids editing characters owned by someone else", async () => {
      authed("u1");
      prisma.character.findUnique.mockResolvedValue({ id: "c1", userId: "someone-else" });
      const res = await PATCH(jsonReq({ characterId: "c1", isPublic: false }));
      expect(res.status).toBe(403);
      expect(prisma.character.update).not.toHaveBeenCalled();
    });

    it("toggles visibility for the owner", async () => {
      authed("u1");
      prisma.character.findUnique.mockResolvedValue({ id: "c1", userId: "u1" });
      prisma.character.update.mockResolvedValue({ id: "c1", isPublic: false });

      const res = await PATCH(jsonReq({ characterId: "c1", isPublic: false }));
      expect(res.status).toBe(200);
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { isPublic: false },
      });
    });
  });
});
