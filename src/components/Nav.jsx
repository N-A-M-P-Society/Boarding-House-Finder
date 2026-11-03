import { useState } from "react";
import Logo from "./Logo.jsx";
const NAV_ITEMS = [
  { page: "home", label: "Home", icon: "⌂", roles: ["guest", "student", "landlord", "admin"] },
  { page: "listings", label: "Browse", icon: "🔍", roles: ["guest", "student", "landlord", "admin"] },
  { page: "student-dashboard", label: "Dashboard", icon: "📋", roles: ["student"] },
  { page: "landlord-dashboard", label: "Dashboard", icon: "📋", roles: ["landlord"] },
  { page: "admin", label: "Console", icon: "⚙️", roles: ["admin"] },
  { page: "chat", label: "Messages", icon: "💬", roles: ["student", "landlord"] },
  { page: "comparison", label: "Compare", icon: "📊", roles: ["student"] },
];
export default function Nav({ currentPage, onNavigate, userRole, displayName, isDark, onToggleTheme, onLogin, onLogout }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const effectiveRole = userRole ?? "guest";
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(effectiveRole));
  return (
    <aside
      className={`
        flex flex-col h-screen sticky top-0 bg-[var(--card)] border-r border-[var(--border)]
        transition-all duration-300 flex-shrink-0 z-40
        ${collapsed ? "w-16" : "w-64"}
      `}
    >
      {/* Logo + collapse toggle */}
      <div className={`flex items-center border-b border-[var(--border)] h-20 px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <button onClick={() => onNavigate("home")} className="flex items-center hover:opacity-80 transition-opacity min-w-0 flex-1">
            <Logo variant={isDark ? "light" : "dark"} height={52} maxWidth={120} />
          </button>
        )}
        {collapsed && (
          <button
            onClick={() => onNavigate("home")}
            className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center hover:opacity-80 transition-opacity overflow-hidden p-1"
            title="UniRent"
          >
            <Logo variant="light" height={36} />
          </button>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] text-xs flex-shrink-0"
            title="Collapse sidebar"
          >
            ◀
          </button>
        )}
      </div>

      {/* Expand toggle (collapsed state) */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mt-2 mx-auto p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] text-xs"
          title="Expand sidebar"
        >
          ▶
        </button>
      )}

      {/* Nav items */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const active = currentPage === item.page;
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center gap-3 rounded-xl transition-all text-sm font-medium
                ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"}
                ${
                  active
                    ? "bg-[var(--secondary)] text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }
              `}
            >
              <span className="text-base leading-none flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
              {/* Unread badge for chat */}
              {item.page === "chat" && !collapsed && (
                <span className="ml-auto w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">
                  2
                </span>
              )}
              {item.page === "chat" && collapsed && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--accent)]" />}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 border-t border-[var(--border)]" />

      {/* Auth / User section */}
      <div className="py-4 px-2">
        <button
          type="button"
          onClick={onToggleTheme}
          title={collapsed ? `Switch to ${isDark ? "light" : "dark"} mode` : undefined}
          className={`mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] ${collapsed ? "justify-center" : ""}`}
          aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)]">
            <span className={`h-2 w-2 rounded-full ${isDark ? "bg-[var(--primary)]" : "bg-[var(--foreground)]"}`} />
          </span>
          {!collapsed && (isDark ? "Light mode" : "Dark mode")}
        </button>
        {userRole ? (
          <div className={`flex flex-col gap-2 ${collapsed ? "items-center" : ""}`}>
            {/* User avatar + info */}
            <div className={`flex items-center gap-2 px-2 py-2 rounded-xl bg-[var(--muted)] ${collapsed ? "justify-center" : ""}`}>
              <div className="w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(displayName || userRole).charAt(0).toUpperCase()}
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{displayName}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)] capitalize">{userRole}</div>
                </div>
              )}
            </div>
            <button
              onClick={onLogout}
              title={collapsed ? "Sign Out" : undefined}
              className={`flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-red-600 transition-colors ${collapsed ? "justify-center" : ""}`}
            >
              <span className="text-sm">↩</span>
              {!collapsed && "Sign Out"}
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setLoginOpen(!loginOpen)}
              title={collapsed ? "Sign In" : undefined}
              className={`w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity ${collapsed ? "justify-center" : ""}`}
            >
              <span className="text-base leading-none">→</span>
              {!collapsed && "Sign In"}
            </button>

            {loginOpen && (
              <div
                className={`absolute bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl p-3 w-44 z-50 ${collapsed ? "left-full ml-2 bottom-0" : "bottom-full mb-2 left-0 right-0"}`}
              >
                <p className="text-[10px] text-[var(--muted-foreground)] mb-2 font-semibold uppercase tracking-wider px-1">Sign in as</p>
                {["student", "landlord", "admin"].map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      onLogin(role);
                      setLoginOpen(false);
                    }}
                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-sm font-medium capitalize flex items-center gap-2"
                  >
                    <span className="w-5 h-5 rounded bg-[var(--secondary)] text-[var(--primary)] text-[10px] flex items-center justify-center font-bold">
                      {role[0].toUpperCase()}
                    </span>
                    {role}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
