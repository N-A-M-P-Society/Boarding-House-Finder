import Logo from "../components/Logo.jsx";
const ROLES = [
  {
    role: "student",
    label: "Student",
    sub: "Find verified off-campus housing near ADDU Jacinto Campus",
    icon: "🎓",
    color: "text-amber-700",
    border: "border-amber-200 hover:border-amber-400",
    bg: "bg-amber-50 hover:bg-amber-100/60",
    page: "login-student",
  },
  {
    role: "landlord",
    label: "Landlord",
    sub: "List and manage your rental properties for ADDU students",
    icon: "🏠",
    color: "text-[var(--primary)]",
    border: "border-[var(--primary)]/30 hover:border-[var(--primary)]",
    bg: "bg-[var(--secondary)] hover:bg-[var(--secondary)]/80",
    page: "login-landlord",
  },
  {
    role: "admin",
    label: "Admin",
    sub: "Verify listings, moderate reviews, and manage platform safety",
    icon: "⚙️",
    color: "text-purple-700",
    border: "border-purple-200 hover:border-purple-400",
    bg: "bg-purple-50 hover:bg-purple-100/60",
    page: "login-admin",
  },
];
export default function RoleSelect({ onNavigate }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-2/5 xl:w-1/2 relative flex-col justify-between p-10 bg-[var(--primary)] text-white overflow-hidden">
        {/* Background texture */}
        <div className="absolute inset-0 opacity-10">
          <img
            src="https://images.unsplash.com/photo-1573108724029-4c46571d6490?w=1200&h=900&fit=crop&auto=format"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/95 to-[#062e3a]/98" />

        {/* Geometric accent circles */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-[var(--accent)]/10" />

        {/* Content */}
        <div className="relative">
          <Logo variant="light" height={72} />
        </div>

        <div className="relative space-y-6">
          <h1 className="font-display text-4xl xl:text-5xl font-semibold leading-tight">
            Safe housing,
            <br />
            <em className="not-italic text-[#7DD4DE]">close to campus.</em>
          </h1>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">
            The verified off-campus housing platform for Ateneo de Davao University students and the landlords who serve them.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            {["Current listings", "Safety score details", "Direct landlord messaging"].map((feat) => (
              <span key={feat} className="flex items-center gap-1.5 text-white/60">
                <span className="text-[var(--accent)]">✓</span> {feat}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-white/30 text-xs">Ateneo de Davao University · Jacinto Campus, Davao City</p>
      </div>

      {/* Right panel — role selection */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-[var(--background)]">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8">
          <Logo variant="dark" height={64} />
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <h2 className="font-display text-3xl font-semibold mb-2">Welcome back</h2>
            <p className="text-[var(--muted-foreground)]">Choose your account type to continue.</p>
          </div>

          {/* Role cards */}
          <div className="flex flex-col gap-3 mb-6">
            {ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => onNavigate(r.page, r.role)}
                className={`group flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200 text-left ${r.bg} ${r.border}`}
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 bg-white shadow-sm group-hover:scale-105 transition-transform`}
                >
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-base ${r.color}`}>{r.label}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-snug">{r.sub}</div>
                </div>
                <span className={`text-lg opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all ${r.color}`}>→</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--muted-foreground)] font-medium">Don't have an account?</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Create account */}
          <button
            onClick={() => onNavigate("signup")}
            className="w-full py-3 border-2 border-[var(--border)] rounded-2xl text-sm font-semibold hover:border-[var(--primary)] hover:bg-[var(--secondary)] hover:text-[var(--primary)] transition-all"
          >
            Create an Account
          </button>

          <p className="text-center text-xs text-[var(--muted-foreground)] mt-6">Admin accounts are provisioned by invite only.</p>
        </div>
      </div>
    </div>
  );
}
