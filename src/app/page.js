"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import {
  Search,
  LogIn,
  LogOut,
  X,
  Plus,
  MessageSquare,
  Loader2,
  Menu,
  Pencil,
  Trash2,
} from "lucide-react";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "official", label: "Featured" },
  { id: "community", label: "Community" },
  { id: "mine", label: "My Characters" },
];

const INITIAL_VISIBLE = 24;
const VISIBLE_STEP = 24;

const EMPTY_CHAR = {
  name: "",
  avatar: "🤖",
  profile_url: "",
  description: "",
  personality: "",
  systemPrompt: "",
  greeting: "",
  is_public: true,
};

export default function HomeDashboard() {
  const router = useRouter();
  const { data: session, status: authStatus, update: updateSession } = useSession();

  // Core data states
  const [characters, setCharacters] = useState([]);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [userCredits, setUserCredits] = useState(50);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // Create/Edit Character Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState(null);
  const [newChar, setNewChar] = useState(EMPTY_CHAR);
  const [isCreating, setIsCreating] = useState(false);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      // Fetch all characters from DB
      const charRes = await fetch("/api/characters");
      const charData = await charRes.json();
      if (charData.characters) {
        setCharacters(charData.characters);
      }

      if (authStatus === "authenticated") {
        // Sync active chats from the database
        const chatRes = await fetch("/api/chats");
        const chatData = await chatRes.json();
        if (chatData.chats) {
          setChats(chatData.chats);
        }
      }
    } catch (err) {
      console.error("Failed to load initial workspace data", err);
      toast.error("Failed to load workspace data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => fetchInitialData(), 0);
    return () => clearTimeout(id);
  }, [authStatus]);

  useEffect(() => {
    if (session?.user?.credits === undefined) return;
    const credits = session.user.credits;
    const id = setTimeout(() => setUserCredits(credits), 0);
    return () => clearTimeout(id);
  }, [session]);

  // Surface payment redirects from Stripe checkout
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment_success") === "true" || params.get("success") === "true") {
      toast.success("Payment successful! Your credits will appear shortly.");
      updateSession();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("payment_canceled") === "true" || params.get("canceled") === "true") {
      toast("Checkout canceled — no credits were charged.", { icon: "ℹ️" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Triggers creation of a chat session
  const handleStartChat = async (characterId, characterName) => {
    if (authStatus !== "authenticated") {
      signIn("google");
      return;
    }
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: characterId }),
      });
      const data = await res.json();
      if (data.chat) {
        const slug = characterName.toLowerCase().replace(/ /g, "-");
        router.push(`/${slug}/${data.chat.id}`);
      }
    } catch (err) {
      console.error("Failed to instantiate chat thread", err);
      toast.error("Failed to start chat session.");
    }
  };

  const openCreateModal = () => {
    setEditingCharacter(null);
    setNewChar(EMPTY_CHAR);
    setShowCreateModal(true);
  };

  const openEditModal = (char) => {
    setEditingCharacter(char);
    setNewChar({
      name: char.name || "",
      avatar: char.avatar || "🤖",
      profile_url: char.profileUrl || "",
      description: char.description || "",
      personality: char.personality || "",
      systemPrompt: char.systemPrompt || "",
      greeting: char.greeting || "",
      is_public: char.isPublic !== false,
    });
    setShowCreateModal(true);
  };

  const handleSaveCharacter = async (e) => {
    e.preventDefault();
    if (authStatus !== "authenticated") {
      signIn("google");
      return;
    }
    try {
      setIsCreating(true);
      const isEdit = Boolean(editingCharacter);
      const res = await fetch(
        isEdit ? `/api/characters/${editingCharacter.id}` : "/api/characters",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newChar),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save character");
      }
      if (data.character) {
        if (isEdit) {
          setCharacters((prev) =>
            prev.map((c) => (c.id === data.character.id ? data.character : c)),
          );
          toast.success("Character updated!");
          setShowCreateModal(false);
          setEditingCharacter(null);
          setNewChar(EMPTY_CHAR);
        } else {
          setCharacters((prev) => [...prev, data.character]);
          toast.success("Character created!");
          setShowCreateModal(false);
          setNewChar(EMPTY_CHAR);
          await handleStartChat(data.character.id, data.character.name);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to save character.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteCharacter = async (char) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete "${char.name}"? All of its chat sessions and messages will be permanently removed.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/characters/${char.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete character");
      setCharacters((prev) => prev.filter((c) => c.id !== char.id));
      setChats((prev) => prev.filter((c) => c.characterId !== char.id));
      toast.success("Character deleted.");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to delete character.");
    }
  };

  // Derive unique recent characters from chat history
  const recentCharactersMap = new Map();
  chats.forEach((c) => {
    if (c.character && !recentCharactersMap.has(c.character.id)) {
      recentCharactersMap.set(c.character.id, c.character);
    }
  });
  const recentCharacters = Array.from(recentCharactersMap.values());

  // Filter characters based on category tab + search
  const filteredCharacters = characters.filter((c) => {
    if (activeCategory === "official" && c.isCustom) return false;
    if (activeCategory === "community" && !c.isCustom) return false;
    if (activeCategory === "mine" && c.userId !== session?.user?.id) return false;

    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  });

  const visibleCharacters = filteredCharacters.slice(0, visibleCount);
  const isLowCredits =
    authStatus === "authenticated" &&
    !session?.user?.customApiKey &&
    typeof userCredits === "number" &&
    userCredits < 10;

  return (
    <div className="flex h-dvh overflow-hidden bg-bg-page text-primary-text font-sans antialiased">
      <Toaster position="top-right" />
      {/* MOBILE BACKDROP */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setShowSidebar(false)}
        />
      )}
      {/* 1. SIDE NAVIGATION BAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 md:relative md:translate-x-0 w-64 bg-bg-card border-r border-divider/50 p-5 flex flex-col shrink-0 select-none ${showSidebar ? "translate-x-0 shadow-2xl shadow-black" : "-translate-x-full"}`}
      >
        {/* BRAND LOGO HEADER */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-85 transition"
          >
            <h1 className="text-[17px] font-bold text-primary-text tracking-tight">
              (character.ai)
            </h1>
          </Link>
          <button
            onClick={openCreateModal}
            className="p-1.5 rounded text-secondary-text hover:text-primary-text transition cursor-pointer bg-bg-card-hover hover:bg-bg-elevated border border-divider/50"
            title="Create Character"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* RECENT DIALOGUE LIST */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <h3 className="text-[10px] font-bold text-secondary-text mb-3 uppercase tracking-wider">
            Recent Chats
          </h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {recentCharacters.length === 0 &&
              !loading &&
              authStatus === "authenticated" &&
              session?.user && (
                <p className="text-xs text-secondary-text italic px-1">
                  No recent chats found.
                </p>
              )}
            {recentCharacters.map((ch, idx) => (
              <button
                key={idx}
                onClick={() => {
                  handleStartChat(ch.id, ch.name);
                  setShowSidebar(false);
                }}
                className="w-full p-2.5 rounded flex items-center gap-3.5 text-left bg-transparent text-secondary-text hover:bg-bg-card-hover transition duration-150 cursor-pointer group"
              >
                <div className="h-8.5 w-8.5 rounded-full bg-bg-card border border-divider/50 flex items-center justify-center text-lg shrink-0 shadow-sm overflow-hidden relative">
                  {ch.profileUrl ||
                  (ch.avatar.length > 2 && ch.avatar.startsWith("http")) ? (
                    <img
                      src={ch.profileUrl || ch.avatar}
                      alt="avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    ch.avatar
                  )}
                </div>
                <div className="overflow-hidden">
                  <h4 className="font-semibold text-[13px] truncate text-primary-text tracking-wide group-hover:text-white transition">
                    {ch.name}
                  </h4>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* BOTTOM UPGRADE CAPSULE */}
        <div className="mt-4 pt-4 border-t border-divider/50">
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="w-full mb-4 py-2.5 px-4 rounded-full border border-divider/50 bg-bg-page text-secondary-text hover:text-primary-text font-bold text-xs tracking-wider transition hover:bg-bg-card-hover cursor-pointer active:scale-[0.98]"
          >
            Upgrade to (c.ai+)
          </button>

          {/* DYNAMIC USER SECTION */}
          {authStatus === "authenticated" && session?.user ? (
            <div className="flex items-center justify-between p-2 rounded bg-transparent select-none">
              <div className="flex items-center gap-3 overflow-hidden">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-9 h-9 rounded-full border border-divider/50 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center font-bold text-sm text-white shrink-0">
                    {session.user.name?.[0] || "U"}
                  </div>
                )}
                <div className="overflow-hidden">
                  <h4 className="font-bold text-xs truncate leading-tight text-primary-text">
                    {session.user.name || "User"}
                  </h4>
                  <p className="text-[10px] text-secondary-text truncate mt-0.5">
                    Premium Credits: {session.user.customApiKey ? "∞" : userCredits}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                type="button"
                title="Logout"
                className="p-1 hover:bg-bg-card-hover rounded text-secondary-text hover:text-primary-text transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn("google")}
              className="w-full py-2.5 px-4 rounded bg-primary hover:bg-primary-hover font-bold text-xs tracking-wider uppercase shadow-md flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
            >
              <LogIn className="w-4 h-4" />
              <span>Login with Google</span>
            </button>
          )}
        </div>
      </aside>
      {/* 2. MAIN CORE VIEWPORT */}
      <section className="flex-1 overflow-hidden bg-bg-page custom-scrollbar relative w-full py-6 sm:py-8">
        {/* HEADER BAR */}
        <header className="flex items-center justify-between mb-6 sm:mb-8 flex-wrap gap-4 px-4 sm:px-10">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 bg-bg-card-hover hover:bg-bg-elevated rounded-lg text-secondary-text hover:text-primary-text border border-divider/50 transition shrink-0"
              onClick={() => setShowSidebar(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <span className="text-secondary-text text-[10px] sm:text-xs font-semibold hidden sm:block">
                Welcome back,
              </span>
              <h2 className="text-base sm:text-xl font-bold text-primary-text tracking-tight sm:mt-0.5 truncate max-w-[140px] sm:max-w-xs">
                {session?.user?.name || "Guest"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-secondary-text">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search characters..."
                className="w-full pl-10 pr-4 py-2.5 bg-bg-card border border-divider/50 rounded-full text-xs focus:outline-none focus:bg-bg-card-hover focus:border-primary/50 text-primary-text placeholder-secondary-text transition duration-150"
              />
            </div>
          </div>
        </header>

        {/* LOW CREDIT BANNER */}
        {isLowCredits && (
          <div className="mx-4 sm:mx-10 mb-4 px-4 py-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold flex items-center justify-between gap-3">
            <span>
              Your credit balance is running low ({userCredits} remaining).
            </span>
            <button
              onClick={() => router.push("/pricing")}
              className="shrink-0 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-[11px] transition cursor-pointer"
            >
              Buy Credits
            </button>
          </div>
        )}

        {/* CHARACTER GRID */}
        <div className="flex flex-col gap-2 w-full h-full overflow-y-auto px-4 sm:px-10 pb-20">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="text-sm font-bold text-primary-text flex items-center gap-2">
              <span>Explore Characters</span>
            </h3>
            <button
              onClick={openCreateModal}
              className="text-xs font-bold text-primary hover:text-primary-hover transition flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full border border-primary/25"
            >
              <Plus className="w-3 h-3" />
              Create Own
            </button>
          </div>

          {/* CATEGORY TABS */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setVisibleCount(INITIAL_VISIBLE);
                }}
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition cursor-pointer ${
                  activeCategory === cat.id
                    ? "bg-primary text-primary-btn-text border-primary"
                    : "bg-bg-card text-secondary-text border-divider/50 hover:text-primary-text hover:bg-bg-card-hover"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleCharacters.map((char) => {
              const isOwner =
                session?.user?.id && char.userId === session.user.id;
              const chatCount = char._count?.chats;
              return (
                <div
                  key={char.id}
                  onClick={() => handleStartChat(char.id, char.name)}
                  className="bg-bg-card border border-divider/50 rounded p-2 flex gap-4 hover:border-primary/50 hover:bg-bg-card-hover transition duration-200 cursor-pointer shadow-lg relative group"
                >
                  {/* Owner actions */}
                  {isOwner && (
                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                      <button
                        type="button"
                        title="Edit character"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(char);
                        }}
                        className="p-1.5 rounded bg-bg-page/90 border border-divider/50 text-secondary-text hover:text-primary-text hover:border-primary/50 transition cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        title="Delete character"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCharacter(char);
                        }}
                        className="p-1.5 rounded bg-bg-page/90 border border-divider/50 text-secondary-text hover:text-rose-500 hover:border-rose-500/50 transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Character visual image */}
                  <div className="h-full w-20 aspect-[3/4] rounded overflow-hidden flex-shrink-0 bg-bg-page border border-divider/50 shadow flex items-center justify-center text-4xl">
                    {char.profileUrl ||
                    (char.avatar.length > 2 && char.avatar.startsWith("http")) ? (
                      <img
                        src={char.profileUrl || char.avatar}
                        alt={char.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      char.avatar
                    )}
                  </div>

                  {/* Info block */}
                  <div className="flex-1 flex flex-col justify-between overflow-hidden">
                    <div>
                      <h4 className="font-extrabold text-[13px] text-primary-text truncate leading-tight">
                        {char.name}
                      </h4>
                      <span className="text-[10px] text-primary block font-semibold truncate mt-0.5">
                        {char.isCustom
                          ? "Community Character"
                          : "Official Preset"}
                      </span>
                      <p className="text-[11px] text-secondary-text mt-1.5 leading-relaxed line-clamp-2 font-medium">
                        {char.description}
                      </p>
                    </div>

                    {/* Bottom metrics */}
                    <div className="flex items-center gap-1.5 text-[10px] text-secondary-text font-bold mt-2.5">
                      <MessageSquare className="w-3.5 h-3.5 text-primary" />
                      <span>
                        {typeof chatCount === "number" && chatCount > 0
                          ? `${chatCount} chat${chatCount === 1 ? "" : "s"}`
                          : "Chat Now"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredCharacters.length === 0 && !loading && (
            <div className="text-center py-20 text-secondary-text">
              <p>No characters found matching &ldquo;{searchQuery}&rdquo;.</p>
            </div>
          )}

          {filteredCharacters.length > visibleCount && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setVisibleCount((c) => c + VISIBLE_STEP)}
                className="px-5 py-2.5 rounded-full bg-bg-card border border-divider/50 text-xs font-bold text-secondary-text hover:text-primary-text hover:bg-bg-card-hover transition cursor-pointer"
              >
                Load more ({filteredCharacters.length - visibleCount} remaining)
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20 text-secondary-text gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span>Loading characters...</span>
            </div>
          )}
        </div>
      </section>
      {/* CREATE/EDIT CHARACTER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn select-none">
          <div className="bg-bg-card border border-divider/50 rounded w-full max-w-xl shadow-2xl relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-divider/50">
              <h2 className="text-lg font-bold text-primary-text flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                {editingCharacter ? "Edit Character" : "Create Custom Character"}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-bg-card-hover rounded text-secondary-text hover:text-primary-text transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveCharacter}
              className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                    Name
                  </label>
                  <input
                    required
                    value={newChar.name}
                    onChange={(e) =>
                      setNewChar({ ...newChar, name: e.target.value })
                    }
                    type="text"
                    className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                    placeholder="e.g. Master Chief"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                    Avatar Emoji
                  </label>
                  <input
                    required
                    value={newChar.avatar}
                    onChange={(e) =>
                      setNewChar({ ...newChar, avatar: e.target.value })
                    }
                    type="text"
                    className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                    placeholder="🤖"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Image URL (Optional)
                </label>
                <input
                  value={newChar.profile_url}
                  onChange={(e) =>
                    setNewChar({ ...newChar, profile_url: e.target.value })
                  }
                  type="text"
                  className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                  placeholder="https://example.com/image.png"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Short Description
                </label>
                <input
                  required
                  value={newChar.description}
                  onChange={(e) =>
                    setNewChar({ ...newChar, description: e.target.value })
                  }
                  type="text"
                  className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                  placeholder="A brief tagline shown in the UI."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Personality Traits
                </label>
                <input
                  required
                  value={newChar.personality}
                  onChange={(e) =>
                    setNewChar({ ...newChar, personality: e.target.value })
                  }
                  type="text"
                  className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                  placeholder="e.g. Sarcastic, brave, funny, protective."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Opening Greeting
                </label>
                <textarea
                  required
                  value={newChar.greeting}
                  onChange={(e) =>
                    setNewChar({ ...newChar, greeting: e.target.value })
                  }
                  className="w-full bg-bg-page border border-divider/50 rounded p-3 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition h-20 resize-none placeholder-secondary-text"
                  placeholder="The very first message they send when someone starts a chat."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  System Prompt (AI Brain)
                </label>
                <textarea
                  required
                  value={newChar.systemPrompt}
                  onChange={(e) =>
                    setNewChar({ ...newChar, systemPrompt: e.target.value })
                  }
                  className="w-full bg-bg-page border border-divider/50 rounded p-3 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition h-32 resize-none placeholder-secondary-text"
                  placeholder="You are [Name]. Act like... Follow these rules..."
                />
              </div>

              <div className="space-y-1.5 flex items-center justify-between p-3 bg-bg-page/40 border border-divider/50 rounded mt-2 select-none">
                <div>
                  <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider block">
                    Visibility Settings
                  </label>
                  <p className="text-[11px] text-secondary-text mt-0.5 font-semibold">
                    {newChar.is_public
                      ? "Public: Published to all users."
                      : "Private: Only you can chat with this character."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setNewChar((prev) => ({
                      ...prev,
                      is_public: !prev.is_public,
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${newChar.is_public ? "bg-primary" : "bg-bg-card-hover"}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${newChar.is_public ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>

              <div className="pt-5 border-t border-divider/50 flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2 text-xs font-bold text-secondary-text hover:text-primary-text transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded text-xs font-bold tracking-wide transition flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
                >
                  {isCreating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  {isCreating
                    ? "Saving..."
                    : editingCharacter
                      ? "Save Changes"
                      : "Create Character"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. PREMIUM PAYMENT / UPGRADE MODAL */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn select-none">
          <div className="bg-bg-card border border-divider/55 rounded w-full max-w-md overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500" />
            <div className="p-6 pt-8 text-center">
              <div className="h-16 w-16 bg-amber-500/10 border border-amber-500/30 rounded flex items-center justify-center text-4xl mx-auto mb-4 animate-bounce">
                👑
              </div>
              <span className="px-3.5 py-1 text-[10px] uppercase font-black tracking-widest text-amber-500 bg-amber-950/30 rounded-full border border-amber-800/40 shadow-inner">
                c.ai+ Premium tier
              </span>
              <h3 className="font-black text-2xl mt-4 mb-2 text-primary-text tracking-tight">
                Upgrade to character.ai+
              </h3>
              <p className="text-xs text-secondary-text max-w-sm mx-auto leading-relaxed mb-6 font-semibold">
                Unlock premium response models (GPT-4o, DeepSeek R1, Claude
                3.5) and top up your credit balance with flexible one-time
                packs.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 py-3.5 bg-bg-page hover:bg-bg-card-hover text-secondary-text hover:text-primary-text rounded font-bold text-xs uppercase tracking-wider transition border border-divider/50 cursor-pointer"
                >
                  Go Back
                </button>
                <button
                  onClick={() => router.push("/pricing")}
                  className="flex-1 py-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-extrabold text-xs uppercase tracking-wider transition cursor-pointer shadow-lg active:scale-95"
                >
                  View Plans
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
