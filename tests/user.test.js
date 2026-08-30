import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma client before importing the service
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { UserService } from "@/lib/services/user";

describe("UserService credit math", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getCredits returns the stored balance", async () => {
    prisma.user.findUnique.mockResolvedValue({ credits: 42 });
    await expect(UserService.getCredits("u1")).resolves.toBe(42);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { credits: true },
    });
  });

  it("getCredits returns 0 for unknown users", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(UserService.getCredits("ghost")).resolves.toBe(0);
  });

  it("addCredits increments the balance", async () => {
    prisma.user.update.mockResolvedValue({ id: "u1", credits: 60 });
    await UserService.addCredits("u1", 10);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { credits: { increment: 10 } },
    });
  });

  it("addCredits ignores non-positive amounts", async () => {
    await UserService.addCredits("u1", 0);
    await UserService.addCredits("u1", -5);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("deductCredits decrements when balance is sufficient", async () => {
    prisma.user.findUnique.mockResolvedValue({ credits: 10 });
    prisma.user.update.mockResolvedValue({ id: "u1", credits: 8 });
    await UserService.deductCredits("u1", 2);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { credits: { decrement: 2 } },
    });
  });

  it("deductCredits throws on insufficient balance", async () => {
    prisma.user.findUnique.mockResolvedValue({ credits: 1 });
    await expect(UserService.deductCredits("u1", 10)).rejects.toThrow(
      "Insufficient credits",
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("deductCredits ignores non-positive amounts", async () => {
    await UserService.deductCredits("u1", 0);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
