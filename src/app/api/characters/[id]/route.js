import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOwnedCharacter(id, userId) {
  const character = await prisma.character.findUnique({ where: { id } });
  if (!character) return { error: "Character not found", status: 404 };
  if (!character.isCustom) {
    return { error: "Preset characters cannot be modified", status: 403 };
  }
  if (character.userId !== userId) {
    return { error: "Forbidden", status: 403 };
  }
  return { character };
}

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { character, error, status } = await getOwnedCharacter(id, session.user.id);
    if (!character) {
      return NextResponse.json({ error }, { status });
    }

    const body = await req.json();
    const data = {};

    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.avatar !== undefined) data.avatar = String(body.avatar);
    if (body.profile_url !== undefined) data.profileUrl = body.profile_url || null;
    if (body.description !== undefined) data.description = String(body.description);
    if (body.personality !== undefined) data.personality = String(body.personality);
    if (body.systemPrompt !== undefined) data.systemPrompt = String(body.systemPrompt);
    if (body.greeting !== undefined) data.greeting = String(body.greeting);
    if (typeof body.is_public === "boolean") data.isPublic = body.is_public;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    if (data.name !== undefined && !data.name) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const updated = await prisma.character.update({ where: { id }, data });
    return NextResponse.json({ character: updated });
  } catch (error) {
    console.error("[CHARACTER_PATCH_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { character, error, status } = await getOwnedCharacter(id, session.user.id);
    if (!character) {
      return NextResponse.json({ error }, { status });
    }

    // Chats and their messages cascade-delete via Prisma relations
    await prisma.character.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CHARACTER_DELETE_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
