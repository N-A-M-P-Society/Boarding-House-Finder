"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Nav from "./components/Nav.jsx";
import RoleSelect from "./views/RoleSelect.jsx";
import LoginPage from "./views/LoginPage.jsx";
import Signup from "./views/Signup.jsx";
import Landing from "./views/Landing.jsx";
import Listings from "./views/Listings.jsx";
import PropertyDetail from "./views/PropertyDetail.jsx";
import StudentDashboard from "./views/StudentDashboard.jsx";
import LandlordDashboard from "./views/LandlordDashboard.jsx";
import AdminConsole from "./views/AdminConsole.jsx";
import Chat from "./views/Chat.jsx";
import Comparison from "./views/Comparison.jsx";
import { DataProvider } from "./context/DataContext.jsx";
import { supabase, isSupabaseConfigured } from "./lib/supabase.js";
import { fetchMessages, loadProfile, signOut } from "./lib/api.js";
const AUTH_PAGES = ["role-select", "login-student", "login-landlord", "login-admin", "signup"];
// Owns the Supabase session so DataProvider can refetch (RLS) whenever the user changes.
export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    loadProfile()
      .then((p) => active && setSession(p))
      .catch(() => {})
      .finally(() => active && setAuthReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setSession(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">Loading…</div>;
  }
  return (
    <DataProvider session={session}>
      <Shell session={session} setSession={setSession} />
    </DataProvider>
  );
}
function Shell({ session, setSession }) {
  const userRole = session?.role ?? null;
  const displayName = session?.name ?? "";
  const accountId = session?.accountId;
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const unreadRefreshSequence = useRef(0);
  const refreshUnreadMessageCount = useCallback(async () => {
    const request = ++unreadRefreshSequence.current;
    if (!accountId) {
      setUnreadMessageCount(0);
      return;
    }

    try {
      const messages = await fetchMessages(accountId);
      if (request === unreadRefreshSequence.current) {
        setUnreadMessageCount(messages.filter((message) =>
          String(message.receiver_id) === String(accountId) && !message.is_read
        ).length);
      }
    } catch (error) {
      if (request === unreadRefreshSequence.current) {
        console.error("Could not refresh unread message count:", error);
      }
    }
  }, [accountId]);
  useEffect(() => {
    if (!accountId) {
      unreadRefreshSequence.current += 1;
      setUnreadMessageCount(0);
      return;
    }

    refreshUnreadMessageCount();
    const channel = supabase
      .channel(`unread-messages-${accountId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${accountId}`,
      }, refreshUnreadMessageCount)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${accountId}`,
      }, refreshUnreadMessageCount)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refreshUnreadMessageCount();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, refreshUnreadMessageCount]);
  const profilePhotoUrl =
    session?.student?.profile_photo_url ||
    session?.landlord?.profile_photo_url ||
    session?.profile_photo_url ||
    "";
  const [page, setPage] = useState(session ? (session.role === "student" ? "student-dashboard" : session.role === "landlord" ? "landlord-dashboard" : "admin") : "role-select");
  const [pendingLoginRole, setPendingLoginRole] = useState("student");
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [comparedIds, setComparedIds] = useState([]);
  const [chatTarget, setChatTarget] = useState(null);
  const [isDark, setIsDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const isAuthPage = AUTH_PAGES.includes(page);
  // Read the saved theme after mount (localStorage/window don't exist during SSR)
  useEffect(() => {
    let dark = false;
    try {
      const saved = localStorage.getItem("unirent-theme");
      dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {}
    setIsDark(dark);
    setThemeReady(true);
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("unirent-theme", isDark ? "dark" : "light");
    } catch {}
  }, [isDark, themeReady]);
  function navigate(p) {
    setPage(p);
    document.getElementById("main-content")?.scrollTo({ top: 0, behavior: "smooth" });
  }
  function handleRoleNav(authPage, role) {
    if (role) setPendingLoginRole(role);
    navigate(authPage);
  }
  function handleLogin(profile) {
    setSession(profile);
    if (profile.role === "student") navigate("student-dashboard");
    else if (profile.role === "landlord") navigate("landlord-dashboard");
    else navigate("admin");
  }
  function handleProfilePhotoChange(url) {
    setSession((current) => current && ({
      ...current,
      profile_photo_url: url,
      student: current.student ? { ...current.student, profile_photo_url: url } : current.student,
      landlord: current.landlord ? { ...current.landlord, profile_photo_url: url } : current.landlord,
    }));
  }
  async function handleLogout() {
    await signOut();
    setSession(null);
    navigate("role-select");
  }
  function handleCompare(property) {
    setComparedIds((prev) => {
      if (prev.includes(property.id)) return prev.filter((id) => id !== property.id);
      if (prev.length >= 4) return prev;
      return [...prev, property.id];
    });
  }
  const fullHeightPages = ["listings", "chat"];
  const isFullHeight = fullHeightPages.includes(page);
  // ── Auth flow (no sidebar) ──────────────────────────────────────────────
  if (isAuthPage) {
    return (
      <div className="relative min-h-screen bg-[var(--background)]" style={{ fontFamily: "var(--font-outfit)" }}>
        <button
          type="button"
          onClick={() => setIsDark((dark) => !dark)}
          className="fixed right-4 top-4 z-50 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--muted)]"
          aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        >
          {isDark ? "Light mode" : "Dark mode"}
        </button>
        {page === "role-select" && <RoleSelect onNavigate={handleRoleNav} />}
        {(page === "login-student" || page === "login-landlord" || page === "login-admin") && (
          <LoginPage
            role={pendingLoginRole}
            onBack={() => navigate("role-select")}
            onLogin={handleLogin}
            onSignup={() => navigate("signup")}
          />
        )}
        {page === "signup" && <Signup onBack={() => navigate("role-select")} onLogin={handleLogin} />}
      </div>
    );
  }
  // ── App shell (with sidebar) ────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]" style={{ fontFamily: "var(--font-outfit)" }}>
      <Nav
        currentPage={page}
        onNavigate={(p) => navigate(p)}
        userRole={userRole}
        displayName={displayName}
        profilePhotoUrl={profilePhotoUrl}
        unreadMessageCount={unreadMessageCount}
        isDark={isDark}
        onToggleTheme={() => setIsDark((dark) => !dark)}
        onLogin={(role) => handleRoleNav(`login-${role}`, role)}
        onLogout={handleLogout}
      />

      <main id="main-content" className={`min-h-0 min-w-0 flex-1 ${isFullHeight ? "overflow-hidden" : "overflow-y-auto"}`}>
        {page === "home" && <Landing onNavigate={(p) => navigate(p)} onSelectProperty={setSelectedPropertyId} />}
        {page === "listings" && (
          <Listings
            onNavigate={(p) => navigate(p)}
            onSelectProperty={setSelectedPropertyId}
            comparedIds={comparedIds}
            onCompare={userRole === "admin" ? undefined : handleCompare}
            userRole={userRole}
            session={session}
          />
        )}
        {page === "detail" && (
          <PropertyDetail
            propertyId={selectedPropertyId}
            onNavigate={(p) => navigate(p)}
            onStartChat={(target) => {
              setChatTarget(target || null);
              navigate("chat");
            }}
            userRole={userRole}
            session={session}
            onRequireLogin={() => handleRoleNav("login-student", "student")}
          />
        )}
        {page === "student-dashboard" && (
          <StudentDashboard
            onNavigate={(p) => navigate(p)}
            onStartChat={(target) => {
              setChatTarget(target || null);
              navigate("chat");
            }}
            onSelectProperty={setSelectedPropertyId}
            comparedIds={comparedIds}
            onCompare={handleCompare}
            displayName={displayName}
            session={session}
            onProfilePhotoChange={handleProfilePhotoChange}
          />
        )}
        {page === "landlord-dashboard" && (
          <LandlordDashboard onNavigate={(p) => navigate(p)} displayName={displayName} session={session} onProfilePhotoChange={handleProfilePhotoChange} />
        )}
        {page === "admin" && <AdminConsole displayName={displayName} session={session} onProfilePhotoChange={handleProfilePhotoChange} />}
        {page === "chat" && <Chat userRole={userRole} session={session} chatTarget={chatTarget} onMessagesRead={refreshUnreadMessageCount} />}
        {page === "comparison" && (
          <Comparison
            comparedIds={comparedIds}
            onNavigate={(p) => navigate(p)}
            onSelectProperty={setSelectedPropertyId}
            onRemove={(id) => setComparedIds((prev) => prev.filter((i) => i !== id))}
          />
        )}

        {userRole !== "admin" && comparedIds.length > 0 && page !== "comparison" && (
          <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
            <div className="bg-[var(--foreground)] text-[var(--background)] rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
              <span className="text-sm font-medium">
                {comparedIds.length} listing{comparedIds.length !== 1 ? "s" : ""} selected
              </span>
              <button
                onClick={() => navigate("comparison")}
                className="px-4 py-1.5 bg-[var(--accent)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Compare Now →
              </button>
              <button onClick={() => setComparedIds([])} className="text-sm opacity-60 hover:opacity-100 transition-opacity">
                Clear
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
