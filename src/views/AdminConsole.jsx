import { useState, useMemo, useEffect, useCallback } from "react";
import { useData } from "../context/DataContext.jsx";
import {
  fetchPendingVerifications,
  fetchModerationReviews,
  fetchAuditEntries,
  fetchSettings,
  updateSetting,
  moderateHouse,
  setVerificationStatus,
  setReviewHidden,
  recordInspection,
  updateHouse,
} from "../lib/api.js";
const SETTING_KEYS = { police: "weight_police", lighting: "weight_lighting", gated: "weight_gated", cctv: "weight_cctv" };
export default function AdminConsole({ displayName, session }) {
  const { properties: PROPERTIES, reload } = useData();
  const [verifications, setVerifications] = useState([]);
  const [AUDIT_LOG, setAuditRows] = useState([]);
  const [inspect, setInspect] = useState({ houseId: "", police: "", lighting: 3, gated: false, active: "", required: "" });
  const adminId = session?.accountId;
  const refreshAdmin = useCallback(async () => {
    try {
      const [v, r, a, st] = await Promise.all([fetchPendingVerifications(), fetchModerationReviews(), fetchAuditEntries(), fetchSettings()]);
      setVerifications(v);
      setReviews(r);
      setAuditRows(a);
      const w = {};
      Object.entries(SETTING_KEYS).forEach(([k, key]) => {
        const row = st.find((x) => x.setting_key === key);
        if (row) w[k] = Math.round(Number(row.setting_value) * 100);
      });
      setWeights((prev) => ({ ...prev, ...w }));
    } catch (e) {
      showToast("Load failed", e.message);
    }
  }, []);
  useEffect(() => {
    refreshAdmin();
  }, [refreshAdmin]);
  async function run(fn, okTitle, okMsg) {
    try {
      await fn();
      showToast(okTitle, okMsg);
      await Promise.all([reload(), refreshAdmin()]);
    } catch (e) {
      showToast("Action failed", e.message);
    }
  }
  const ADMIN_PENDING = PROPERTIES.filter((p) => p.status === "pending").map((p) => ({
    id: `house:${p.id}`,
    rawId: p.id,
    type: "listing",
    title: p.title,
    landlord: p.landlordName,
    submittedAt: p.createdAt || "",
    docs: 0,
  }));
  const [activeTab, setActiveTab] = useState("landlords");
  const [weights, setWeights] = useState({ police: 25, lighting: 25, gated: 25, cctv: 25 });
  const [modalItem, setModalItem] = useState(null);
  const [reason, setReason] = useState("");
  const [listingStatuses, setListingStatuses] = useState({});
  const [listingToSuspend, setListingToSuspend] = useState(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewToRemove, setReviewToRemove] = useState(null);
  const [toast, setToast] = useState(null);
  // Audit log state
  const [auditSearch, setAuditSearch] = useState("");
  const [auditCategory, setAuditCategory] = useState("all");
  const [auditSeverity, setAuditSeverity] = useState("all");
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [auditDetailModal, setAuditDetailModal] = useState(null);
  const allListings = PROPERTIES;
  const activeAdminName = displayName || "Admin";
  const auditLog = AUDIT_LOG;
  const filteredAuditLog = useMemo(() => {
    return auditLog.filter((e) => {
      const matchSearch =
        !auditSearch ||
        e.target.toLowerCase().includes(auditSearch.toLowerCase()) ||
        e.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
        e.admin.toLowerCase().includes(auditSearch.toLowerCase()) ||
        e.reason.toLowerCase().includes(auditSearch.toLowerCase());
      const matchCat = auditCategory === "all" || e.category === auditCategory;
      const matchSev = auditSeverity === "all" || e.severity === auditSeverity;
      return matchSearch && matchCat && matchSev;
    });
  }, [auditLog, auditSearch, auditCategory, auditSeverity]);
  function showToast(title, message) {
    setToast({ title, message });
    window.setTimeout(() => setToast(null), 4000);
  }
  function suspendListing() {
    if (!listingToSuspend || !suspensionReason.trim()) return;
    const target = listingToSuspend;
    const why = suspensionReason;
    run(
      () => moderateHouse({ adminId, houseId: target.id, status: "Suspended", reason: why }),
      "Listing suspended",
      `${target.title} is now SUSPENDED.`,
    );
    setListingToSuspend(null);
    setSuspensionReason("");
  }
  function updateReviewStatus(id, status) {
    run(
      () => setReviewHidden({ adminId, reviewId: id, hidden: status !== "flagged", reason: status === "hidden" ? "Hidden by moderator" : "Restored by moderator" }),
      "Review updated",
      `Review is now ${status}.`,
    );
  }
  function removeReview() {
    if (!reviewToRemove) return;
    const r = reviewToRemove;
    run(
      () => setReviewHidden({ adminId, reviewId: r.id, hidden: true, reason: "Removed by moderator" }),
      "Review removed",
      `${r.studentName}'s review is hidden from the public page.`,
    );
    setReviewToRemove(null);
  }
  // Weighted 0-10 safety score from the latest inspection inputs and the saved weights
  function computeScore({ police, lighting, gated, active, required }) {
    const parts = {
      police: 10 * (1 - Math.min(Number(police) || 0, 2000) / 2000),
      lighting: Number(lighting) * 2,
      gated: gated ? 10 : 0,
      cctv: Number(required) ? Math.min(10, (Number(active) / Number(required)) * 10) : 0,
    };
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const score = Object.keys(parts).reduce((sum, k) => sum + parts[k] * (weights[k] / total), 0);
    return Math.round(score * 10) / 10;
  }
  async function submitInspection() {
    if (!inspect.houseId) return showToast("Pick a property", "Select the property being inspected.");
    run(
      async () => {
        await recordInspection({
          adminId,
          houseId: inspect.houseId,
          policeDistanceM: Number(inspect.police) || 0,
          lightingRating: Number(inspect.lighting),
          hasGatedAccess: inspect.gated,
          cctvActive: Number(inspect.active) || 0,
          cctvRequired: Number(inspect.required) || 0,
        });
        await updateHouse(Number(inspect.houseId), { safety_score: computeScore(inspect) });
      },
      "Inspection saved",
      "Safety score recomputed for this property.",
    );
  }
  async function saveWeights() {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total !== 100) return showToast("Weights must total 100%", `Currently ${total}%.`);
    run(
      async () => {
        for (const [k, key] of Object.entries(SETTING_KEYS)) await updateSetting(key, weights[k] / 100, adminId);
      },
      "Weights saved",
      "New weights apply to future inspections (SuperAdmin only).",
    );
  }
  return (
    <div className="admin-console max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center font-bold">
          {activeAdminName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Admin Console</h1>
          <p className="text-[var(--muted-foreground)] text-sm flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            {activeAdminName} · MFA Active · All actions logged
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-8 overflow-x-auto">
        {[
          ["landlords", `Landlord Approval (${verifications.length})`],
          ["queue", `Approval Queue (${ADMIN_PENDING.length})`],
          ["listings", "All Listings"],
          ["safety", "Safety Inspection"],
          ["reviews", "Reviews"],
          ["badges", "Badge Verification"],
          ["audit", "Audit Log"],
        ].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Landlord Approval */}
      {activeTab === "landlords" && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-semibold mb-8">Pending Account Approval</h2>
          {verifications.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">No pending landlord verifications.</p>}
          {verifications.map((v) => ({ id: String(v.verification_id), name: v.landlords?.full_name || "Landlord", date: (v.verified_at || "").slice(0, 10), docs: [v.business_permit_url, v.isp_bill_url, v.water_proof_url, v.safety_audit_url].filter(Boolean).length })).map((landlord) => (
            <div key={landlord.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-purple-100 text-purple-700">
                      Verification
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{landlord.date}</span>
                  </div>
                  <h3 className="font-display font-semibold text-sm">Landlord Verification: {landlord.name}</h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">by {landlord.name}</p>
                  <p className="text-xs text-[var(--primary)] mt-2">{landlord.docs} document{landlord.docs !== 1 ? "s" : ""} attached</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => run(() => setVerificationStatus({ adminId, verificationId: landlord.id, status: "Approved", reason: "Documents verified" }), "Verification approved", `${landlord.name} was approved.`)}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setModalItem({ id: landlord.id, kind: "verification", title: `Landlord Verification: ${landlord.name}`, action: "reject" })}
                    className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approval Queue */}
      {activeTab === "queue" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-xl font-semibold">Pending Approvals</h2>
          </div>
          {ADMIN_PENDING.map((item) => (
            <div key={item.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        item.type === "listing"
                          ? "bg-blue-100 text-blue-700"
                          : item.type === "verification"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{item.submittedAt}</span>
                  </div>
                  <h3 className="font-semibold text-sm mb-0.5">{item.title}</h3>
                  {item.landlord !== "—" && <p className="text-xs text-[var(--muted-foreground)]">by {item.landlord}</p>}
                  {item.docs > 0 && (
                    <p className="text-xs text-[var(--primary)] mt-1">
                      📎 {item.docs} document{item.docs !== 1 ? "s" : ""} attached
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setModalItem({ id: item.rawId, kind: "house", title: item.title, action: "approve" })}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setModalItem({ id: item.rawId, kind: "house", title: item.title, action: "reject" })}
                    className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
          {ADMIN_PENDING.length === 0 && (
            <div className="text-center py-12 text-[var(--muted-foreground)]">
              <div className="text-3xl mb-3">✅</div>
              <p className="text-sm font-medium">All caught up!</p>
            </div>
          )}
        </div>
      )}

      {/* All Listings */}
      {activeTab === "listings" && (
        <div>
          <h2 className="font-display text-xl font-semibold mb-4">All Listings</h2>
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)]">
                <tr>
                  {["Property", "Landlord", "Rent", "Safety", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {allListings.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--muted)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-xs leading-snug max-w-48">{p.title}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{p.landlordName}</td>
                    <td className="px-4 py-3 text-xs font-mono">₱{p.monthlyRent.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs font-semibold">⚡ {p.safetyScore}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          listingStatuses[p.id] === "suspended"
                            ? "bg-red-100 text-red-700"
                            : p.status === "approved"
                              ? "bg-emerald-100 text-emerald-700"
                              : p.status === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                        }`}
                      >
                        {listingStatuses[p.id] === "suspended" ? "suspended" : p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button className="px-2 py-1 bg-[var(--secondary)] text-[var(--primary)] rounded text-[10px] font-medium hover:opacity-80">
                          Review
                        </button>
                        {p.status === "approved" && listingStatuses[p.id] !== "suspended" && (
                          <button
                            onClick={() => setListingToSuspend(p)}
                            className="px-2 py-1 bg-red-50 text-red-700 rounded text-[10px] font-medium hover:opacity-80"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Safety Weights */}
      {activeTab === "safety" && (
        <div className="max-w-lg space-y-6">
          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Safety Score Weights</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              Adjust the weight of each factor in the overall safety score calculation. Weights must sum to 100%.
            </p>
          </div>
          {[
            { key: "police", label: "Police Post Proximity", desc: "Distance to nearest police station or post" },
            { key: "lighting", label: "Street Lighting", desc: "Adequacy of street lights on walking routes" },
            { key: "gated", label: "Gated Access", desc: "Presence of locked gates / security guard" },
            { key: "cctv", label: "CCTV Coverage", desc: "Number and coverage of security cameras" },
          ].map((factor) => (
            <div key={factor.key} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-semibold text-sm">{factor.label}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{factor.desc}</div>
                </div>
                <span className="font-mono text-lg font-bold text-[var(--primary)]">{weights[factor.key]}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={weights[factor.key]}
                onChange={(e) => setWeights((prev) => ({ ...prev, [factor.key]: Number(e.target.value) }))}
                className="w-full accent-[var(--primary)]"
              />
            </div>
          ))}
          <div
            className={`flex justify-between items-center p-3 rounded-xl border ${
              Object.values(weights).reduce((a, b) => a + b, 0) === 100
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            <span className="text-sm font-medium">Total</span>
            <span className="font-mono font-bold">{Object.values(weights).reduce((a, b) => a + b, 0)}% / 100%</span>
          </div>
          <button onClick={saveWeights} className="w-full py-3 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
            Save Weights
          </button>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Record Inspection</h3>
            <select value={inspect.houseId} onChange={(e) => setInspect({ ...inspect, houseId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm">
              <option value="">Select property…</option>
              {PROPERTIES.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <input type="number" placeholder="Police distance (m)" value={inspect.police} onChange={(e) => setInspect({ ...inspect, police: e.target.value })} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]" />
              <select value={inspect.lighting} onChange={(e) => setInspect({ ...inspect, lighting: e.target.value })} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]">
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>Lighting {n}/5</option>
                ))}
              </select>
              <input type="number" placeholder="CCTV active" value={inspect.active} onChange={(e) => setInspect({ ...inspect, active: e.target.value })} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]" />
              <input type="number" placeholder="CCTV required" value={inspect.required} onChange={(e) => setInspect({ ...inspect, required: e.target.value })} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={inspect.gated} onChange={(e) => setInspect({ ...inspect, gated: e.target.checked })} /> Gated access
            </label>
            <button onClick={submitInspection} className="w-full py-2.5 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm">Save inspection & score</button>
          </div>
        </div>
      )}

      {/* Reviews */}
      {activeTab === "reviews" && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-semibold mb-4">Review Moderation</h2>
          {reviews.map((review) => (
            <div key={review.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                        review.status === "removed"
                          ? "bg-red-50 text-red-700"
                          : review.status === "hidden"
                            ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {review.status}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{review.date}</span>
                  </div>
                  <h3 className="font-display font-semibold text-sm">{review.studentName}</h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">on {review.propertyTitle}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-amber-500 text-sm">
                      {"★".repeat(review.rating)}
                      {"☆".repeat(5 - review.rating)}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{review.rating.toFixed(1)}</span>
                  </div>
                  <p className="text-sm text-[var(--foreground)] mt-1">“{review.comment}”</p>
                  <p className="text-xs text-amber-700 mt-2">
                    
                  </p>
                  {review.status === "hidden" && <p className="text-xs text-red-700 mt-2">Hidden from the public property page.</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {review.status === "hidden" && (
                    <button
                      onClick={() => updateReviewStatus(review.id, "flagged")}
                      className="px-3 py-1.5 bg-[var(--secondary)] text-[var(--primary)] rounded-lg text-xs font-semibold hover:opacity-80 transition-opacity"
                    >
                      Restore
                    </button>
                  )}
                  {review.status === "flagged" && (
                    <button
                      onClick={() => updateReviewStatus(review.id, "hidden")}
                      className="px-3 py-1.5 bg-[var(--secondary)] text-[var(--primary)] rounded-lg text-xs font-semibold hover:opacity-80 transition-opacity"
                    >
                      Hide
                    </button>
                  )}
                  {review.status !== "hidden" ? (
                    <button
                      onClick={() => setReviewToRemove(review)}
                      className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 bg-[var(--muted)] text-[var(--muted-foreground)] rounded-lg text-xs font-semibold">
                      Hidden
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Badge Verification */}
      {activeTab === "badges" && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Badge Verification</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              Review evidence submitted by landlords for listing verification badges.
            </p>
          </div>
          {PROPERTIES.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">No properties yet.</p>}
          {PROPERTIES.map((p) => (
            <div key={p.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-sm">{p.title}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{p.landlordName}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  ["badge_fast_wifi", "WiFi Verified"],
                  ["badge_24_7_water", "Water 24/7"],
                  ["badge_vetted_safe", "Vetted Safe"],
                ].map(([col, label]) => {
                  const on = p.badges.includes(label);
                  return (
                    <button
                      key={col}
                      onClick={() => run(() => updateHouse(Number(p.id), { [col]: !on }), "Badge updated", `${label} ${on ? "removed from" : "granted to"} ${p.title}.`)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${on ? "bg-emerald-600 text-white border-emerald-600" : "bg-[var(--muted)] border-[var(--border)]"}`}
                    >
                      {on ? "✓ " : ""}{label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audit Log */}
      {activeTab === "audit" && (
        <div className="space-y-5">
          {/* Header + stats */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">Immutable Audit Log</h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{AUDIT_LOG.length} records · Tamper-evident · Read-only</p>
            </div>
            <div className="flex gap-2">
              {[
                { label: "All", count: AUDIT_LOG.length, color: "bg-[var(--secondary)] text-[var(--primary)]" },
                { label: "Critical", count: AUDIT_LOG.filter((e) => e.severity === "critical").length, color: "bg-red-50 text-red-700" },
                { label: "Warning", count: AUDIT_LOG.filter((e) => e.severity === "warning").length, color: "bg-amber-50 text-amber-700" },
              ].map((s) => (
                <div key={s.label} className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${s.color}`}>
                  <span>{s.label}</span>
                  <span className="font-mono font-bold">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search actions, targets, admins, reasons…"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
              />
            </div>
            <select
              value={auditCategory}
              onChange={(e) => setAuditCategory(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
            >
              <option value="all">All Categories</option>
              <option value="listing">Listing</option>
              <option value="verification">Verification</option>
              <option value="review">Review</option>
              <option value="safety">Safety</option>
              <option value="account">Account</option>
              <option value="system">System</option>
            </select>
            <select
              value={auditSeverity}
              onChange={(e) => setAuditSeverity(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Log table */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[110px_80px_80px_1fr_28px] gap-3 px-4 py-2.5 bg-[var(--muted)] border-b border-[var(--border)]">
              {["Timestamp", "Category", "Severity", "Action / Target", ""].map((h) => (
                <div key={h} className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                  {h}
                </div>
              ))}
            </div>

            {filteredAuditLog.length === 0 && (
              <div className="py-12 text-center text-[var(--muted-foreground)] text-sm">
                <div className="text-2xl mb-2">🔍</div>
                No matching audit entries found.
              </div>
            )}

            <div className="divide-y divide-[var(--border)]">
              {filteredAuditLog.map((entry) => {
                const isExpanded = expandedEntry === entry.id;
                const sevConfig = {
                  info: { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", label: "INFO" },
                  warning: { dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700", label: "WARN" },
                  critical: { dot: "bg-red-500", badge: "bg-red-50 text-red-700", label: "CRIT" },
                }[entry.severity];
                const catConfig = {
                  listing: "bg-blue-50 text-blue-700",
                  verification: "bg-purple-50 text-purple-700",
                  review: "bg-pink-50 text-pink-700",
                  safety: "bg-teal-50 text-teal-700",
                  account: "bg-orange-50 text-orange-700",
                  system: "bg-[var(--secondary)] text-[var(--primary)]",
                };
                const actionColor = entry.action.startsWith("APPROVED")
                  ? "text-emerald-700 bg-emerald-50"
                  : entry.action.startsWith("REJECTED") || entry.action.startsWith("SUSPENDED") || entry.action.startsWith("REMOVED")
                    ? "text-red-700 bg-red-50"
                    : "text-amber-700 bg-amber-50";
                return (
                  <div
                    key={entry.id}
                    className={`transition-colors ${isExpanded ? "bg-[var(--secondary)]/40" : "hover:bg-[var(--muted)]"}`}
                  >
                    {/* Main row — clickable */}
                    <button
                      onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                      className="w-full grid grid-cols-[110px_80px_80px_1fr_28px] gap-3 px-4 py-3 text-left items-center"
                    >
                      <span className="font-mono text-[10px] text-[var(--muted-foreground)] leading-snug">
                        {entry.at.replace(" ", "\n")}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit ${catConfig[entry.category] ?? "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}
                      >
                        {entry.category}
                      </span>

                      <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold w-fit ${sevConfig.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sevConfig.dot} flex-shrink-0`} />
                        {sevConfig.label}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${actionColor}`}>{entry.action}</span>
                          <span className="text-xs font-medium text-[var(--foreground)] truncate">{entry.target}</span>
                        </div>
                        <p className="text-[11px] text-[var(--muted-foreground)] truncate">
                          by {entry.admin} · {entry.sessionId}
                        </p>
                      </div>

                      <span
                        className={`text-[var(--muted-foreground)] text-xs transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      >
                        ▾
                      </span>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 grid sm:grid-cols-2 gap-4">
                        {/* Reason */}
                        <div className="sm:col-span-2 bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
                          <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">
                            Reason / Notes
                          </div>
                          <p className="text-sm text-[var(--foreground)] leading-relaxed">{entry.reason}</p>
                        </div>

                        {/* Technical metadata */}
                        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 space-y-2">
                          <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">
                            Session Info
                          </div>
                          {[
                            ["Admin ID", entry.adminId],
                            ["Session", entry.sessionId],
                            ["IP Address", entry.ip],
                            ["Target ID", entry.targetId],
                          ].map(([label, val]) => (
                            <div key={label} className="flex justify-between items-center">
                              <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
                              <span className="font-mono text-xs text-[var(--foreground)]">{val}</span>
                            </div>
                          ))}
                        </div>

                        {/* Extra meta */}
                        {entry.meta && (
                          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 space-y-2">
                            <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">
                              Action Details
                            </div>
                            {Object.entries(entry.meta).map(([k, v]) => (
                              <div key={k} className="flex justify-between items-center">
                                <span className="text-xs text-[var(--muted-foreground)] capitalize">
                                  {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                                </span>
                                <span className="font-mono text-xs text-[var(--foreground)]">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="sm:col-span-2 flex gap-2 flex-wrap">
                          <button
                            onClick={() => setAuditDetailModal(entry)}
                            className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                          >
                            View Full Record
                          </button>
                          <button className="px-3 py-1.5 bg-[var(--secondary)] text-[var(--primary)] rounded-lg text-xs font-semibold hover:opacity-80 transition-opacity border border-[var(--primary)]/20">
                            Export Entry
                          </button>
                          {(entry.category === "listing" || entry.category === "account") && (
                            <button className="px-3 py-1.5 bg-[var(--muted)] text-[var(--foreground)] rounded-lg text-xs font-semibold hover:opacity-80 transition-opacity border border-[var(--border)]">
                              View Target →
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 bg-[var(--muted)] border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                🔒 Tamper-evident · Records are cryptographically sealed and cannot be modified or deleted
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                {filteredAuditLog.length}/{auditLog.length} entries
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Audit entry full-record modal */}
      {auditDetailModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card)] rounded-2xl w-full max-w-lg border border-[var(--border)] shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--muted)]">
              <div>
                <div className="font-semibold text-sm">Audit Record — {auditDetailModal.id.toUpperCase()}</div>
                <div className="text-[10px] text-[var(--muted-foreground)] font-mono mt-0.5">
                  {auditDetailModal.at} · {auditDetailModal.sessionId}
                </div>
              </div>
              <button
                onClick={() => setAuditDetailModal(null)}
                className="w-8 h-8 rounded-full bg-[var(--border)] hover:bg-[var(--muted-foreground)]/20 flex items-center justify-center text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Action badge + severity */}
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                    auditDetailModal.action.startsWith("APPROVED")
                      ? "bg-emerald-50 text-emerald-700"
                      : auditDetailModal.action.startsWith("REJECTED") ||
                          auditDetailModal.action.startsWith("SUSPENDED") ||
                          auditDetailModal.action.startsWith("REMOVED")
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {auditDetailModal.action}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    auditDetailModal.severity === "critical"
                      ? "bg-red-50 text-red-700"
                      : auditDetailModal.severity === "warning"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {auditDetailModal.severity.toUpperCase()}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[var(--secondary)] text-[var(--primary)] text-xs font-semibold capitalize">
                  {auditDetailModal.category}
                </span>
              </div>

              {/* Target */}
              <div className="bg-[var(--muted)] rounded-xl p-4">
                <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Target</div>
                <div className="font-medium text-sm">{auditDetailModal.target}</div>
                <div className="font-mono text-[10px] text-[var(--muted-foreground)] mt-0.5">{auditDetailModal.targetId}</div>
              </div>

              {/* Reason */}
              <div className="bg-[var(--muted)] rounded-xl p-4">
                <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">Reason / Notes</div>
                <p className="text-sm text-[var(--foreground)] leading-relaxed">{auditDetailModal.reason}</p>
              </div>

              {/* Session details */}
              <div className="bg-[var(--muted)] rounded-xl p-4 space-y-2.5">
                <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Session Details</div>
                {[
                  ["Performed By", auditDetailModal.admin],
                  ["Admin ID", auditDetailModal.adminId],
                  ["Session ID", auditDetailModal.sessionId],
                  ["IP Address", auditDetailModal.ip],
                  ["Timestamp", auditDetailModal.at],
                  ["Record ID", auditDetailModal.id],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center gap-4">
                    <span className="text-xs text-[var(--muted-foreground)] flex-shrink-0">{label}</span>
                    <span className="font-mono text-xs text-[var(--foreground)] text-right">{val}</span>
                  </div>
                ))}
              </div>

              {/* Action metadata */}
              {auditDetailModal.meta && (
                <div className="bg-[var(--muted)] rounded-xl p-4 space-y-2.5">
                  <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Action Metadata</div>
                  {Object.entries(auditDetailModal.meta).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center gap-4">
                      <span className="text-xs text-[var(--muted-foreground)] capitalize flex-shrink-0">
                        {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                      </span>
                      <span className="font-mono text-xs text-[var(--foreground)]">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-[var(--muted-foreground)] text-center pt-1 font-mono">
                🔒 This record is cryptographically sealed and cannot be altered.
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[var(--border)] flex justify-between items-center gap-2 bg-[var(--muted)]">
              <button className="px-4 py-2 bg-[var(--secondary)] text-[var(--primary)] rounded-xl text-xs font-semibold hover:opacity-80 transition-opacity border border-[var(--primary)]/20">
                Export as PDF
              </button>
              <button
                onClick={() => setAuditDetailModal(null)}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend listing modal */}
      {listingToSuspend && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="presentation">
          <div
            className="bg-[var(--card)] rounded-2xl p-6 w-full max-w-md border border-[var(--border)] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="suspend-listing-title"
          >
            <h3 id="suspend-listing-title" className="font-display text-lg font-semibold">
              Suspend Listing
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 mb-4">Are you sure you want to suspend this listing?</p>
            <label htmlFor="suspension-reason" className="block text-xs font-medium mb-1.5">
              Reason for suspension:
            </label>
            <textarea
              id="suspension-reason"
              value={suspensionReason}
              onChange={(event) => setSuspensionReason(event.target.value)}
              placeholder="Enter reason for suspension…"
              className="w-full border border-[var(--border)] rounded-xl p-3 text-sm resize-none h-24 outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all bg-[var(--muted)]"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setListingToSuspend(null);
                  setSuspensionReason("");
                }}
                className="flex-1 py-2.5 border border-[var(--border)] rounded-xl text-sm font-medium hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={suspendListing}
                disabled={!suspensionReason.trim()}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Suspend Listing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove review modal */}
      {reviewToRemove && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="presentation">
          <div
            className="bg-[var(--card)] rounded-2xl p-6 w-full max-w-md border border-[var(--border)] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-review-title"
          >
            <h3 id="remove-review-title" className="font-display text-lg font-semibold">
              Remove Review
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 mb-4">
              Are you sure you want to remove this review? It will be hidden from the public property page and the property's aggregate
              rating will be updated.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setReviewToRemove(null)}
                className="flex-1 py-2.5 border border-[var(--border)] rounded-xl text-sm font-medium hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={removeReview}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Remove Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval/Rejection modal */}
      {modalItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card)] rounded-2xl p-6 w-full max-w-md border border-[var(--border)] shadow-2xl">
            <h3 className="font-display text-lg font-semibold mb-1">
              {modalItem.action === "approve" ? "Approve" : "Reject"} — {modalItem.title}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] mb-4">This action will be permanently logged in the audit trail.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={modalItem.action === "reject" ? "Rejection reason (required)..." : "Optional notes..."}
              className="w-full border border-[var(--border)] rounded-xl p-3 text-sm resize-none h-24 outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all bg-[var(--muted)]"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setModalItem(null);
                  setReason("");
                }}
                className="flex-1 py-2.5 border border-[var(--border)] rounded-xl text-sm font-medium hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const m = modalItem;
                  const note = reason.trim() || (m.action === "approve" ? "Approved after review" : "");
                  const done = [m.action === "approve" ? "Approval recorded" : "Rejection recorded", `${m.title} was ${m.action === "approve" ? "approved" : "rejected"}.`];
                  if (m.kind === "house") {
                    run(() => moderateHouse({ adminId, houseId: m.id, status: m.action === "approve" ? "Published" : "Rejected", reason: note }), ...done);
                  } else if (m.kind === "verification") {
                    run(() => setVerificationStatus({ adminId, verificationId: m.id, status: m.action === "approve" ? "Approved" : "Rejected", reason: note }), ...done);
                  } else {
                    showToast(...done);
                  }
                  setModalItem(null);
                  setReason("");
                }}
                disabled={modalItem.action === "reject" && !reason.trim()}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${modalItem.action === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Confirm {modalItem.action === "approve" ? "Approval" : "Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-4 top-4 z-[60] w-[min(22.5rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-xl animate-[admin-toast-in_180ms_ease-out]">
          <div className="flex gap-3">
            <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
            <div>
              <div className="text-xs font-semibold">{toast.title}</div>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">{toast.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
