import { useData } from "../context/DataContext.jsx";
import PropertyCard from "../components/PropertyCard.jsx";
export default function Landing({ onNavigate, onSelectProperty }) {
  const { properties: PROPERTIES } = useData();
  const approvedProperties = PROPERTIES.filter((p) => p.status === "approved");
  const featured = approvedProperties.slice(0, 3);
  const availableRoomCount = approvedProperties.reduce(
    (count, property) => count + property.rooms.filter((room) => room.status === "available").length,
    0,
  );
  const safetyScores = approvedProperties
    .filter((property) => property.safetyScore != null)
    .map((property) => Number(property.safetyScore))
    .filter(Number.isFinite);
  const averageSafetyScore = safetyScores.length
    ? `${(safetyScores.reduce((total, score) => total + score, 0) / safetyScores.length).toFixed(1)}/10`
    : "—";
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[var(--primary)] text-white">
        <div className="absolute inset-0 opacity-20">
          <img
            src="https://images.unsplash.com/photo-1573108724029-4c46571d6490?w=1600&h=800&fit=crop&auto=format"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B5E6F]/90 via-[#0B5E6F]/80 to-[#083D4F]/95" />

        {/* Geometric accent */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-white/5 translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-[var(--accent)]/10 -translate-x-1/2 translate-y-1/2" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-xs font-medium mb-6 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
              Ateneo de Davao University — Jacinto Campus
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-tight mb-6">
              Find your home
              <br />
              <em className="not-italic text-[#7DD4DE]">close to campus,</em>
              <br />
              safe and verified.
            </h1>
            <p className="text-lg text-white/75 mb-8 max-w-xl leading-relaxed">
              Browse ADDU-area listings with safety details, room availability, and direct messaging — all in one platform built for students.
            </p>

            {/* Search bar */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-lg">
              <div className="flex-1 flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl px-4 py-3">
                <span className="text-white/60 text-sm">📍</span>
                <input
                  type="text"
                  placeholder="Near Ateneo de Davao..."
                  className="flex-1 bg-transparent text-white placeholder-white/50 text-sm outline-none"
                />
              </div>
              <button
                onClick={() => onNavigate("listings")}
                className="px-6 py-3 bg-[var(--accent)] hover:bg-[#e5532e] text-white rounded-xl font-semibold text-sm transition-colors whitespace-nowrap"
              >
                Search Rooms →
              </button>
            </div>

            <div className="flex flex-wrap gap-4 mt-6 text-sm text-white/60">
              {["Compare monthly rent", "Check room availability", "Message landlords directly"].map((tag) => (
                <span key={tag} className="flex items-center gap-1">
                  <span className="text-[var(--accent)]">✓</span> {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="bg-[var(--card)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { value: approvedProperties.length, label: "Approved Listings" },
            { value: availableRoomCount, label: "Available Rooms" },
            { value: averageSafetyScore, label: "Average Safety Score" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display text-2xl font-semibold text-[var(--primary)]">{stat.value}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured listings */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-3xl font-semibold">Featured listings</h2>
            <p className="text-[var(--muted-foreground)] mt-1">Approved listings with available safety details near ADDU</p>
          </div>
          <button
            onClick={() => onNavigate("listings")}
            className="text-sm text-[var(--primary)] font-medium hover:underline hidden sm:block"
          >
            View all →
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              onClick={() => {
                onSelectProperty(p.id);
                onNavigate("detail");
              }}
              imageClickNavigates
            />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-[var(--secondary)] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="font-display text-3xl font-semibold text-center mb-12">How UniRent works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Browse approved listings",
                desc: "Filter by price, distance, safety score, and amenities, then review each listing's available details.",
                icon: "🏠",
              },
              {
                step: "02",
                title: "Save your roommate preferences",
                desc: "Record your sleep, study, cleanliness, and guest preferences in your student profile.",
                icon: "🤝",
              },
              {
                step: "03",
                title: "Chat and book directly",
                desc: "Message landlords in real-time, check room availability on the calendar, and confirm your booking — no middleman.",
                icon: "💬",
              },
            ].map((item) => (
              <div key={item.step} className="bg-[var(--card)] rounded-2xl p-6 border border-[var(--border)]">
                <div className="text-4xl mb-4">{item.icon}</div>
                <div className="font-mono text-xs text-[var(--muted-foreground)] mb-2 tracking-wider">{item.step}</div>
                <h3 className="font-display text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--secondary)] text-[var(--primary)] text-xs font-medium mb-4">
              ⚡ Safety Score Engine
            </div>
            <h2 className="font-display text-3xl font-semibold mb-4">Know how safe your future home is before you move in</h2>
            <p className="text-[var(--muted-foreground)] leading-relaxed mb-6">
              Where inspection data is available, a listing's 0–10 Safety Score reflects police proximity, street lighting, gated access, and CCTV coverage.
            </p>
            <div className="space-y-3">
              {["Police post proximity", "Street lighting", "Gated access", "CCTV coverage"].map((factor) => (
                <div key={factor} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
                  <span className="text-[var(--primary)]">✓</span>
                  <span className="font-medium">{factor}</span>
                </div>
              ))}
              <p className="text-xs text-[var(--muted-foreground)]">
                Review each listing's inspection details; not every factor may have recorded data.
              </p>
            </div>
          </div>
          <div className="relative">
            <div className="rounded-2xl overflow-hidden bg-[var(--muted)] h-80">
              <img
                src="https://images.unsplash.com/photo-1551818255-e6e10975bc17?w=700&h=500&fit=crop&auto=format"
                alt="Safe street in Davao"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[var(--primary)] text-white py-16 text-center">
        <h2 className="font-display text-3xl font-semibold mb-4">Ready to find your ADDU home?</h2>
        <p className="text-white/70 mb-8 max-w-md mx-auto">Browse current listings and connect directly with landlords near campus.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => onNavigate("listings")}
            className="px-8 py-3 bg-white text-[var(--primary)] rounded-xl font-semibold hover:bg-white/90 transition-colors"
          >
            Browse Listings
          </button>
          <button className="px-8 py-3 border border-white/30 text-white rounded-xl font-semibold hover:bg-white/10 transition-colors">
            List Your Property
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--card)] border-t border-[var(--border)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-display font-semibold text-[var(--primary)]">UniRent</div>
          <p className="text-xs text-[var(--muted-foreground)]">Student housing near Ateneo de Davao University, Jacinto Campus</p>
          <p className="text-xs text-[var(--muted-foreground)]">© 2025 UniRent</p>
        </div>
      </footer>
    </div>
  );
}
