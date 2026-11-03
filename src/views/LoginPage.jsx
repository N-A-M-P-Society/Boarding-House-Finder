import { useState } from "react";
import Logo from "../components/Logo.jsx.";
import { supabase } from "../lib/supabase.js";
import { signIn, signOut, loadProfile } from "../lib/api.js";
const CONFIG = {
  student: {
    icon: "🎓",
    label: "Student",
    emailPlaceholder: "yourname@addu.edu.ph",
    emailHint: "Use your ADDU institutional email",
    accentClass: "bg-amber-500 hover:bg-amber-600",
    ringClass: "focus:ring-amber-400",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    headerBg: "from-amber-600 to-amber-700",
    extraFields: null,
  },
  landlord: {
    icon: "🏠",
    label: "Landlord",
    emailPlaceholder: "yourname@email.com",
    emailHint: "Use the email you registered with",
    accentClass: "bg-[var(--primary)] hover:opacity-90",
    ringClass: "focus:ring-[var(--primary)]",
    badgeClass: "bg-[var(--secondary)] text-[var(--primary)] border-[var(--primary)]/20",
    headerBg: "from-[var(--primary)] to-[#083D4F]",
    extraFields: null,
  },
  admin: {
    icon: "⚙️",
    label: "Admin",
    emailPlaceholder: "admin@unirents.ph",
    emailHint: "Admin accounts are invite-only",
    accentClass: "bg-purple-700 hover:bg-purple-800",
    ringClass: "focus:ring-purple-400",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    headerBg: "from-purple-700 to-purple-900",
    extraFields: "mfa",
  },
};
export default function LoginPage({ role, onBack, onLogin, onSignup }) {
  const cfg = CONFIG[role];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showMfa, setShowMfa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const displayName = email
    .split("@")[0]
    .trim()
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  // Confirm the account really belongs to the portal that was chosen.
  async function finishLogin() {
    const profile = await loadProfile();
    if (!profile) throw new Error("No UniRent account is linked to this login.");
    if (profile.role !== role) {
      await signOut();
      throw new Error(`This account is registered as ${profile.role}. Use the ${profile.role} portal instead.`);
    }
    onLogin(profile);
  }
  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (role === "student" && !email.trim().toLowerCase().endsWith("@addu.edu.ph")) {
      setError("Students must use an @addu.edu.ph institutional email.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (role === "admin" && showMfa) {
        const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
        if (fErr) throw fErr;
        const factor = factors?.totp?.[0];
        if (!factor) throw new Error("No authenticator is enrolled for this account.");
        const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (cErr) throw cErr;
        const { error: vErr } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: mfaCode });
        if (vErr) throw vErr;
        await finishLogin();
        return;
      }
      await signIn(email, password);
      if (role === "admin") {
        // Only ask for a code if this admin has enrolled a TOTP factor
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
          setShowMfa(true);
          return;
        }
      }
      await finishLogin();
    } catch (err) {
      setError(err.message || "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left decorative panel */}
      <div
        className={`hidden lg:flex lg:w-2/5 xl:w-1/2 relative flex-col justify-between p-10 bg-gradient-to-br ${cfg.headerBg} text-white overflow-hidden`}
      >
        <div className="absolute inset-0 opacity-10">
          <img
            src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&h=900&fit=crop&auto=format"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-white/5" />

        <div className="relative">
          <button onClick={onBack} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-medium">
            ← Back to role selection
          </button>
        </div>

        <div className="relative space-y-4">
          <div className="text-5xl">{cfg.icon}</div>
          <h2 className="font-display text-3xl xl:text-4xl font-semibold leading-tight">
            {role === "student" && "Find your perfect home near ADDU."}
            {role === "landlord" && "Reach verified ADDU students."}
            {role === "admin" && "Manage the UniRent platform."}
          </h2>
          <p className="text-white/65 text-sm leading-relaxed max-w-xs">
            {role === "student" && "Browse safety-scored listings, request roommate matches, and chat with landlords — all in one place."}
            {role === "landlord" && "Upload your listing, earn verification badges, and connect with qualified student tenants."}
            {role === "admin" && "Review listings, moderate reviews, configure safety weights, and maintain an immutable audit log."}
          </p>
        </div>

        <div className="relative">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 text-xs font-medium ${cfg.badgeClass.replace("border-", "border-opacity-30 border-")} bg-white/10 text-white/80`}
          >
            {cfg.icon} Signing in as {cfg.label}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-[var(--background)]">
        {/* Mobile back + logo */}
        <div className="lg:hidden w-full max-w-md mb-6 flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] font-medium flex items-center gap-1"
          >
            ← Back
          </button>
          <Logo variant="dark" height={44} />
        </div>

        <div className="w-full max-w-md">
          {/* Role badge */}
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-6 ${cfg.badgeClass}`}>
            {cfg.icon} {cfg.label} Login
          </div>

          <h2 className="font-display text-3xl font-semibold mb-1">Sign in</h2>
          <p className="text-[var(--muted-foreground)] text-sm mb-8">{cfg.emailHint}</p>

          {!showMfa ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={cfg.emailPlaceholder}
                  className={`w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 transition-all ${cfg.ringClass}`}
                />
                {displayName && (
                  <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
                    You will appear as <span className="font-semibold text-[var(--foreground)]">{displayName}</span>.
                  </p>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-sm font-semibold">Password</label>
                  <button type="button" className="text-xs text-[var(--primary)] hover:underline">
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={`w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 transition-all ${cfg.ringClass}`}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  <span className="flex-shrink-0">⚠</span> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3.5 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60 ${cfg.accentClass}`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {role === "admin" ? "Verifying credentials…" : "Signing in…"}
                  </span>
                ) : role === "admin" ? (
                  "Sign In to Console"
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          ) : (
            /* MFA step — admin only */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-800 mb-2">
                <div className="font-semibold mb-1">🔐 Two-Factor Authentication Required</div>
                Enter the 6-digit code from your authenticator app to access the admin console.
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">Authentication Code</label>
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-purple-300 bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-purple-400 transition-all text-center font-mono text-2xl tracking-widest"
                />
              </div>
              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full py-3.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Verifying…
                  </span>
                ) : (
                  "Verify & Enter Console"
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowMfa(false)}
                className="w-full text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] py-2"
              >
                ← Back to credentials
              </button>
            </form>
          )}

          {/* Back to role selection */}
          <p className="text-center text-xs text-[var(--muted-foreground)] mt-6">
            <button onClick={onBack} className="text-[var(--primary)] hover:underline font-medium">
              ← Back to role selection
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
