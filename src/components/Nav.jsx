
// Import useState from React.
// useState allows this component to remember information that can change,
// such as whether the sidebar is collapsed or the login menu is open.
import { useEffect, useState } from "react";

// Import the Logo component used to display the UniRent logo.
import Logo from "./Logo.jsx";

// NAVIGATION ITEMS
// This array contains all the pages that can appear in the sidebar.
//
// Each object contains:
// page  - The internal page identifier used for navigation.
// label - The text displayed to the user.
// icon  - The icon displayed beside the page name.
// roles - The user roles allowed to see this navigation item.
//
// For example, the Dashboard is different for students and landlords.
// Guests can browse listings but cannot see student or landlord dashboards.
const NAV_ITEMS = [
  { page: "home", label: "Home", icon: "⌂", roles: ["guest", "student", "landlord", "admin"] },
  { page: "listings", label: "Browse", icon: "🔍", roles: ["guest", "student", "landlord", "admin"] },
  { page: "student-dashboard", label: "Dashboard", icon: "📋", roles: ["student"] },
  { page: "landlord-dashboard", label: "Dashboard", icon: "📋", roles: ["landlord"] },
  { page: "admin", label: "Console", icon: "⚙️", roles: ["admin"] },
  { page: "chat", label: "Messages", icon: "💬", roles: ["student", "landlord"] },
  { page: "comparison", label: "Compare", icon: "📊", roles: ["student"] },
];

// NAV COMPONENT
// This component creates the UniRent sidebar navigation.
//
// PROPS:
// currentPage  - The page currently being displayed.
// onNavigate   - Function called when the user selects a navigation item.
// userRole     - The current user's role (guest, student, landlord, or admin).
// displayName  - The name displayed in the user information section.
// isDark       - Indicates whether dark mode is currently enabled.
// onToggleTheme - Function that switches between light and dark mode.
// onLogin      - Function called when the user chooses a role to sign in as.
// onLogout     - Function called when the user signs out.
export default function Nav({
  currentPage,
  onNavigate,
  userRole,
  displayName,
  profilePhotoUrl,
  unreadMessageCount = 0,
  isDark,
  onToggleTheme,
  onLogin,
  onLogout
}) {

  // Controls whether the sign-in role selection menu is visible.
  // false means the menu is closed by default.
  const [loginOpen, setLoginOpen] = useState(false);

  // Controls whether the sidebar is expanded or collapsed.
  // false means the sidebar starts in its expanded state.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 640px)");
    const syncSidebar = () => setCollapsed(mobileViewport.matches);
    syncSidebar();
    mobileViewport.addEventListener("change", syncSidebar);
    return () => mobileViewport.removeEventListener("change", syncSidebar);
  }, []);

  // Determine the user's role.
  // If userRole is null or undefined, treat the user as a guest.
  const effectiveRole = userRole ?? "guest";

  // FILTER NAVIGATION ITEMS
  // Only display navigation items that are allowed for the current role.
  //
  // For example:
  // - Students see the student dashboard and comparison page.
  // - Landlords see the landlord dashboard.
  // - Admins see the admin console.
  // - Guests see Home and Browse.
  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(effectiveRole)
  );

  // SIDEBAR CONTAINER
  // The aside element represents the entire sidebar.
  return (
    <aside
      className={`
        relative flex flex-col h-screen sticky top-0 bg-[var(--card)] border-r border-[var(--border)]
        transition-[width] duration-300 ease-in-out flex-shrink-0 z-40

        /* Change the sidebar width depending on its collapsed state. */
        ${collapsed ? "w-[4.5rem]" : "w-64"}
      `}
    >

      {/* LOGO + COLLAPSE TOGGLE */}
      {/* This section displays the UniRent logo and the button
          that allows users to collapse the sidebar. */}

      <div className={`relative flex items-center border-b border-[var(--border)] h-20 px-3 ${collapsed ? "justify-center" : "justify-between"}`}>

        {/* Display the full logo when the sidebar is expanded. */}
        {!collapsed && (
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center hover:opacity-80 transition-opacity min-w-0 flex-1"
          >
            {/* Clicking the logo takes the user back to the Home page.
                The logo variant changes depending on the current theme. */}
            <Logo
              variant={isDark ? "light" : "dark"}
              height={60}
              maxWidth={156}
            />
          </button>
        )}

        {/* Display a smaller logo when the sidebar is collapsed. */}
        {collapsed && (
          <button
            onClick={() => onNavigate("home")}
            className="w-11 h-11 rounded-xl bg-[var(--primary)] flex items-center justify-center hover:opacity-80 transition-opacity overflow-hidden p-1"
            title="UniRent"
          >
            {/* The smaller logo also acts as a Home navigation button. */}
            <Logo variant="light" height={40} />
          </button>
        )}

        {/* Show the collapse button only when the sidebar is expanded. */}
        {!collapsed && (
          <button
            // Clicking this button changes collapsed to true.
            onClick={() => setCollapsed(true)}
            type="button"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            aria-expanded="true"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--background)] text-base text-[var(--muted-foreground)] shadow-sm transition-colors hover:border-[var(--primary)] hover:bg-[var(--secondary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            ‹
          </button>
        )}
      </div>

      {/* Keep the expand control aligned with the logo in the header. */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          type="button"
          title="Expand sidebar"
          aria-label="Expand sidebar"
          aria-expanded="false"
          className="absolute -right-4 top-1/2 z-50 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-base text-[var(--muted-foreground)] shadow-md transition-colors hover:border-[var(--primary)] hover:bg-[var(--secondary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-[640px]:hidden"
        >
          ›
        </button>
      )}

      {/* NAVIGATION ITEMS */}
      {/* This section displays the available pages for the current user. */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-1 overflow-y-auto">

        {/* Loop through the filtered navigation items.
            Each item becomes a clickable button in the sidebar. */}
        {visibleItems.map((item) => {

          // Check whether this navigation item matches the current page.
          // This is used to highlight the active page.
          const active = currentPage === item.page;
          const hasUnreadMessages = item.page === "chat" && unreadMessageCount > 0;
          const unreadTitle = unreadMessageCount === 1 ? "1 unread message" : `${unreadMessageCount} unread messages`;

          return (
            <button
              // React uses the page identifier as a unique key for each item.
              key={item.page}

              // Navigate to the selected page when clicked.
              onClick={() => onNavigate(item.page)}

              // When collapsed, show the page name as a tooltip.
              // When expanded, the page name is already visible.
              title={collapsed ? `${item.label}${hasUnreadMessages ? ` (${unreadTitle})` : ""}` : undefined}

              className={`
                relative flex items-center gap-3 rounded-xl transition-all text-sm font-medium

                /* Adjust spacing and alignment depending on sidebar width. */
                ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"}

                ${
                  active
                    // Highlight the button when its page is currently active.
                    ? "bg-[var(--secondary)] text-[var(--primary)]"

                    // Use the normal style for inactive navigation items.
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }
              `}
            >

              {/* Display the icon assigned to the navigation item. */}
              <span className="text-base leading-none flex-shrink-0">
                {item.icon}
              </span>

              {/* Display the page label only when the sidebar is expanded. */}
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}

              {/* Show the total unread message count only when messages are unread. */}
              {hasUnreadMessages && !collapsed && (
                <span aria-label={unreadTitle} className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                </span>
              )}

              {hasUnreadMessages && collapsed && (
                <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* DIVIDER */}
      {/* A horizontal line separates the navigation links
          from the theme and account controls. */}
      <div className="mx-3 border-t border-[var(--border)]" />

      {/* AUTHENTICATION / USER SECTION */}
      {/* This bottom section contains the theme toggle and
          the appropriate account controls for the current user. */}
      <div className="py-4 px-2">

        {/* LIGHT / DARK THEME TOGGLE */}
        <button
          type="button"

          // Call the parent component's theme-switching function.
          onClick={onToggleTheme}

          // Show a tooltip when the sidebar is collapsed.
          title={collapsed ? `Switch to ${isDark ? "light" : "dark"} mode` : undefined}

          className={`mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] ${collapsed ? "justify-center" : ""}`}

          // Accessibility label describing the action of the button.
          aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        >

          {/* Small circular theme indicator. */}
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)]">

            {/* Change the indicator color based on the active theme. */}
            <span className={`h-2 w-2 rounded-full ${isDark ? "bg-[var(--primary)]" : "bg-[var(--foreground)]"}`} />
          </span>

          {/* Display the theme option when the sidebar is expanded.
              If dark mode is active, offer Light mode, and vice versa. */}
          {!collapsed && (isDark ? "Light mode" : "Dark mode")}
        </button>

        {/* CHECK WHETHER A USER IS SIGNED IN */}
        {/* If userRole exists, display the user's information and Sign Out button.
            Otherwise, display the Sign In button. */}
        {userRole ? (

          // SIGNED-IN USER SECTION
          <div className={`flex flex-col gap-2 ${collapsed ? "items-center" : ""}`}>

            {/* USER AVATAR + INFORMATION */}
            <div className={`flex items-center gap-2 px-2 py-2 rounded-xl bg-[var(--muted)] ${collapsed ? "justify-center" : ""}`}>

              {/* Display the first letter of the user's name.
                  If no displayName exists, use the first letter of their role. */}
              <div className="w-9 h-9 overflow-hidden rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                {profilePhotoUrl
                  ? <img src={profilePhotoUrl} alt={`${displayName || userRole} profile`} className="h-full w-full object-cover" />
                  : (displayName || userRole).charAt(0).toUpperCase()}
              </div>

              {/* Show the user's name and role when expanded. */}
              {!collapsed && (
                <div className="min-w-0">

                  {/* Display the user's name. */}
                  <div className="text-xs font-semibold truncate">
                    {displayName}
                  </div>

                  {/* Display the user's role in lowercase-to-title-case style. */}
                  <div className="text-[10px] text-[var(--muted-foreground)] capitalize">
                    {userRole}
                  </div>
                </div>
              )}
            </div>

            {/* SIGN OUT BUTTON */}
            <button
              // Call the parent's logout function.
              onClick={onLogout}

              // Show a tooltip if the sidebar is collapsed.
              title={collapsed ? "Sign Out" : undefined}

              className={`flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-red-600 transition-colors ${collapsed ? "justify-center" : ""}`}
            >

              {/* Sign-out icon. */}
              <span className="text-sm">↩</span>

              {/* Hide the text when the sidebar is collapsed. */}
              {!collapsed && "Sign Out"}
            </button>
          </div>

        ) : (

          // GUEST USER SECTION
          // If no user is signed in, show the Sign In button.
          <div className="relative">

            {/* SIGN IN BUTTON */}
            <button
              // Toggle the login role-selection menu.
              // If it is open, close it; if closed, open it.
              onClick={() => setLoginOpen(!loginOpen)}

              // Show a tooltip when the sidebar is collapsed.
              title={collapsed ? "Sign In" : undefined}

              className={`w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity ${collapsed ? "justify-center" : ""}`}
            >

              {/* Sign-in icon. */}
              <span className="text-base leading-none">→</span>

              {/* Display the button label only when expanded. */}
              {!collapsed && "Sign In"}
            </button>

            {/* LOGIN ROLE SELECTION MENU */}
            {/* Only display this menu when loginOpen is true. */}
            {loginOpen && (
              <div
                // Position the menu differently depending on the sidebar width.
                // Expanded: show the menu above the Sign In button.
                // Collapsed: show the menu to the right of the sidebar.
                className={`absolute bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl p-3 w-44 z-50 ${collapsed ? "left-full ml-2 bottom-0" : "bottom-full mb-2 left-0 right-0"}`}
              >

                {/* Heading explaining that the user must choose a role. */}
                <p className="text-[10px] text-[var(--muted-foreground)] mb-2 font-semibold uppercase tracking-wider px-1">
                  Sign in as
                </p>

                {/* Create one button for each available account role. */}
                {["student", "landlord", "admin"].map((role) => (
                  <button
                    // Use the role name as the unique React key.
                    key={role}

                    // When a role is selected:
                    // 1. Call onLogin() and pass the selected role.
                    // 2. Close the role-selection menu.
                    onClick={() => {
                      onLogin(role);
                      setLoginOpen(false);
                    }}

                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-sm font-medium capitalize flex items-center gap-2"
                  >

                    {/* Display the first letter of the selected role
                        inside a small colored square. */}
                    <span className="w-5 h-5 rounded bg-[var(--secondary)] text-[var(--primary)] text-[10px] flex items-center justify-center font-bold">
                      {role[0].toUpperCase()}
                    </span>

                    {/* Display the role name: student, landlord, or admin. */}
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
