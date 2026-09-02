import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { POST, DELETE } from "@/app/api/user/apikey/route";

const authed = (id = "u1") =>
  getServerSession.mockResolvedValue({ user: { id, email: "u@example.com" } });

const jsonReq = (body) =>
  new Request("http://localhost/api/user/apikey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("user API key management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/user/apikey", () => {
    it("requires authentication", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await POST(jsonReq({ apiKey: "abc" }));
      expect(res.status).toBe(401);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("stores a trimmed custom API key", async () => {
      authed("u1");
      prisma.user.update.mockResolvedValue({ id: "u1", credits: 10, customApiKey: "key123" });

      const res = await POST(jsonReq({ apiKey: "  key123  " }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.customApiKey).toBe("key123");
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { customApiKey: "key123" },
        select: { id: true, credits: true, customApiKey: true },
      });
    });

    it("clears the key when an empty value is provided", async () => {
      authed("u1");
      prisma.user.update.mockResolvedValue({ id: "u1", credits: 10, customApiKey: null });

      const res = await POST(jsonReq({ apiKey: "" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { customApiKey: null } }),
      );
    });
  });

  describe("DELETE /api/user/apikey", () => {
    it("requires authentication", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await DELETE(new Request("http://localhost"));
      expect(res.status).toBe(401);
    });

    it("removes the stored key", async () => {
      authed("u1");
      prisma.user.update.mockResolvedValue({ id: "u1" });

      const res = await DELETE(new Request("http://localhost"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.customApiKey).toBeNull();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { customApiKey: null },
      });
    });
  });
});
