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
  updateAccountProfile,
} from "../lib/api.js";
import ProfilePhotoUpload from "../components/ProfilePhotoUpload.jsx";
import PaginatedTableBody from "../components/PaginatedTableBody.jsx";
import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardTabBar from "../components/DashboardTabBar.jsx";
const SETTING_KEYS = { police: "weight_police", lighting: "weight_lighting", gated: "weight_gated", cctv: "weight_cctv" };
export default function AdminConsole({ displayName, session, onProfilePhotoChange }) {
  const { properties: PROPERTIES, reload } = useData();
  const [verifications, setVerifications] = useState([]);
  const [AUDIT_LOG, setAuditRows] = useState([]);
  const [inspect, setInspect] = useState({ houseId: "", police: "", lighting: "", gated: false, active: "", required: "" });
  const [weightsLoaded, setWeightsLoaded] = useState(false);
  const adminId = session?.accountId;
  const isSuperAdmin = session?.dbRole === "SuperAdmin";
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
      setSavedWeights((prev) => ({ ...prev, ...w }));
      setWeightsLoaded(true);
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
  const [savedWeights, setSavedWeights] = useState({ police: 25, lighting: 25, gated: 25, cctv: 25 });
  const [modalItem, setModalItem] = useState(null);
  const [reason, setReason] = useState("");
  const [listingStatuses, setListingStatuses] = useState({});
  const [listingToSuspend, setListingToSuspend] = useState(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewToRemove, setReviewToRemove] = useState(null);
  const [verificationDetail, setVerificationDetail] = useState(null);
  const [listingDetail, setListingDetail] = useState(null);
  const [reviewDetail, setReviewDetail] = useState(null);
  const [verificationSearch, setVerificationSearch] = useState("");
  const [queueSearch, setQueueSearch] = useState("");
  const [listingSearch, setListingSearch] = useState("");
  const [listingStatusFilter, setListingStatusFilter] = useState("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("all");
  const [badgeSearch, setBadgeSearch] = useState("");
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
  const filteredListings = allListings.filter((listing) => {
    const query = listingSearch.trim().toLowerCase();
    const status = listingStatuses[listing.id] || listing.status;
    const matchesSearch = !query ||
      listing.title.toLowerCase().includes(query) ||
      listing.landlordName.toLowerCase().includes(query) ||
      listing.address.toLowerCase().includes(query);
    return matchesSearch && (listingStatusFilter === "all" || status === listingStatusFilter);
  });
  const filteredReviews = reviews.filter((review) => {
    const query = reviewSearch.trim().toLowerCase();
    const status = review.status === "hidden" ? "hidden" : "visible";
    const matchesSearch = !query ||
      String(review.studentName || "").toLowerCase().includes(query) ||
      String(review.propertyTitle || "").toLowerCase().includes(query) ||
      String(review.comment || "").toLowerCase().includes(query);
    return matchesSearch && (reviewStatusFilter === "all" || status === reviewStatusFilter);
  });
  const filteredVerifications = verifications.filter((verification) => {
    const query = verificationSearch.trim().toLowerCase();
    return !query || String(verification.landlords?.full_name || "").toLowerCase().includes(query);
  });
  const filteredPendingListings = ADMIN_PENDING.filter((item) => {
    const query = queueSearch.trim().toLowerCase();
    const listing = allListings.find((candidate) => candidate.id === item.rawId);
    return !query || item.title.toLowerCase().includes(query) ||
      item.landlord.toLowerCase().includes(query) ||
      String(listing?.address || "").toLowerCase().includes(query);
  });
  const badgeRows = allListings.flatMap((listing) =>
    [
      ["badge_fast_wifi", "WiFi Verified"],
      ["badge_24_7_water", "Water 24/7"],
      ["badge_vetted_safe", "Vetted Safe"],
    ].map(([column, label]) => ({ listing, column, label, verified: listing.badges.includes(label) })),
  ).filter(({ listing, label }) => {
    const query = badgeSearch.trim().toLowerCase();
    return !query || listing.title.toLowerCase().includes(query) ||
      listing.landlordName.toLowerCase().includes(query) || label.toLowerCase().includes(query);
  });
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
  function openAdminAction(item) {
    setReason("");
    setModalItem(item);
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
  function computeScore({ police, lighting, gated, active, required }, scoreWeights = weights) {
    const distance = Math.min(Math.max(Number(police) || 0, 0), 2000);
    const cctvRequired = Number(required) || 0;
    const parts = {
      police: 2 + 8 * (1 - distance / 2000),
      lighting: Number(lighting) * 2,
      gated: gated ? 10 : 4,
      cctv: cctvRequired ? Math.min(10, (Number(active) / cctvRequired) * 10) : 5,
    };
    const total = Object.values(scoreWeights).reduce((a, b) => a + b, 0) || 1;
    const score = Object.keys(parts).reduce((sum, k) => sum + parts[k] * (scoreWeights[k] / total), 0);
    return Math.round(score * 10) / 10;
  }
  async function submitInspection() {
    if (!inspect.houseId) return showToast("Pick a property", "Select the property being inspected.");
    if (weightTotal !== 100) return showToast("Weights must total 100%", `Current weights total ${weightTotal}%.`);
    if ([inspect.police, inspect.lighting, inspect.active, inspect.required].some((value) => value === "")) {
      return showToast("Complete the inspection", "Enter police distance, lighting rating, and both CCTV counts.");
    }
    if (!Number.isFinite(Number(inspect.police)) || Number(inspect.police) < 0 ||
        !Number.isFinite(Number(inspect.lighting)) ||
        !Number.isInteger(Number(inspect.active)) || !Number.isInteger(Number(inspect.required)) ||
        Number(inspect.active) < 0 || Number(inspect.required) < 0 || Number(inspect.lighting) < 1 || Number(inspect.lighting) > 5) {
      return showToast("Check inspection values", "Distances and camera counts must be non-negative; lighting must be 1–5.");
    }
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
    if (!isSuperAdmin) return showToast("Permission denied", "Only SuperAdmins can change safety score weights.");
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total !== 100) return showToast("Weights must total 100%", `Currently ${total}%.`);
    run(
      async () => {
        for (const [k, key] of Object.entries(SETTING_KEYS)) await updateSetting(key, weights[k] / 100, adminId);
        setSavedWeights(weights);
      },
      "Weights saved",
      "New weights apply to future inspections (SuperAdmin only).",
    );
  }
  function recalculateInspectionScore(property) {
    const inspection = property.safetyBreakdown;
    if (!inspection.inspectedAt) return;
    if ([inspection.policeDistanceMeters, inspection.lightingRating, inspection.cctvActive, inspection.cctvRequired]
      .some((value) => value == null || !Number.isFinite(Number(value)))) {
      return showToast("Inspection data incomplete", "Record all inspection measurements before recalculating this score.");
    }
    const score = computeScore({
      police: inspection.policeDistanceMeters,
      lighting: inspection.lightingRating,
      gated: inspection.hasGatedAccess,
      active: inspection.cctvActive,
      required: inspection.cctvRequired,
    }, savedWeights);
    run(
      () => updateHouse(Number(property.id), { safety_score: score }),
      "Score recalculated",
      `${property.title} now scores ${score}/10 using its latest inspection and saved weights.`,
    );
  }
  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);
  const inspectionReady = Boolean(inspect.houseId) &&
    [inspect.police, inspect.lighting, inspect.active, inspect.required].every((value) => value !== "") &&
    Number.isFinite(Number(inspect.police)) &&
    Number(inspect.police) >= 0 &&
    Number.isInteger(Number(inspect.active)) &&
    Number.isInteger(Number(inspect.required)) &&
    Number(inspect.active) >= 0 &&
    Number(inspect.required) >= 0 &&
    Number.isFinite(Number(inspect.lighting)) &&
    Number(inspect.lighting) >= 1 &&
    Number(inspect.lighting) <= 5 &&
    weightTotal === 100;
  const inspectionPreview = inspectionReady ? computeScore(inspect) : null;
  return (
    <div className="admin-console dashboard-shell">
      {/* Header */}
      <DashboardHeader
        avatar={(
          <ProfilePhotoUpload
            name={activeAdminName}
            photoUrl={session?.profile_photo_url}
            onUploaded={async (url) => {
              await updateAccountProfile(session.accountId, { profile_photo_url: url });
              onProfilePhotoChange?.(url);
            }}
          />
        )}
        title="Admin Console"
        description={(
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {activeAdminName} · MFA Active · All actions logged
          </span>
        )}
      />

      {/* Tabs */}
      <DashboardTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        items={[
          { id: "landlords", label: `Landlord Approval (${verifications.length})` },
          { id: "queue", label: `Approval Queue (${ADMIN_PENDING.length})` },
          { id: "listings", label: "All Listings" },
          { id: "safety", label: "Safety Inspection" },
          { id: "reviews", label: "Reviews" },
          { id: "badges", label: "Badge Verification" },
          { id: "audit", label: "Audit Log" },
        ]}
      />

      {/* Landlord Approval */}
      {activeTab === "landlords" && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Pending Landlord Verification</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Open a record to review its submitted documents before deciding.</p>
          </div>
          <input
            type="search"
            value={verificationSearch}
            onChange={(event) => setVerificationSearch(event.target.value)}
            placeholder="Search landlord name"
            aria-label="Search pending landlord verifications"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm sm:max-w-sm"
          />
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-[var(--muted)]">
                <tr>{["Landlord", "Submitted", "Documents", "Status", "Review"].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{heading}</th>
                ))}</tr>
              </thead>
              <PaginatedTableBody
                rows={filteredVerifications}
                columns={5}
                resetKey={verificationSearch}
                emptyMessage={verifications.length ? "No verifications match your search." : "No pending landlord verifications."}
                renderRow={(verification) => {
                  const documentCount = [
                    verification.government_id_url,
                    verification.proof_of_ownership_url,
                    verification.business_permit_url,
                    verification.isp_bill_url,
                    verification.water_proof_url,
                    verification.safety_audit_url,
                  ].filter(Boolean).length;
                  return (
                    <tr key={verification.verification_id} className="hover:bg-[var(--muted)]">
                      <td className="px-4 py-3 font-medium">{verification.landlords?.full_name || "Landlord"}</td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{(verification.created_at || verification.verified_at || "").slice(0, 10) || "—"}</td>
                      <td className="px-4 py-3">{documentCount}/4 attached</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-800">Pending</span></td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setVerificationDetail(verification)}
                          className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:opacity-80"
                        >
                          Review documents
                        </button>
                      </td>
                    </tr>
                  );
                }}
              />
            </table>
          </div>
        </div>
      )}

      {/* Approval Queue */}
      {activeTab === "queue" && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Pending Listing Approvals</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">View the full listing before approving or rejecting it.</p>
          </div>
          <input
            type="search"
            value={queueSearch}
            onChange={(event) => setQueueSearch(event.target.value)}
            placeholder="Search listing, landlord, address"
            aria-label="Search pending listing approvals"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm sm:max-w-sm"
          />
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[38rem] text-sm">
              <thead className="bg-[var(--muted)]">
                <tr>{["Listing", "Landlord", "Submitted", "Status", "Review"].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{heading}</th>
                ))}</tr>
              </thead>
              <PaginatedTableBody
                rows={filteredPendingListings}
                columns={5}
                resetKey={queueSearch}
                emptyMessage={ADMIN_PENDING.length ? "No pending listings match your search." : "All caught up."}
                renderRow={(item) => (
                  <tr key={item.id} className="hover:bg-[var(--muted)]">
                    <td className="px-4 py-3 font-medium">{item.title}</td>
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{item.landlord}</td>
                    <td className="px-4 py-3 text-xs">{item.submittedAt || "—"}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-800">Pending</span></td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setListingDetail(allListings.find((listing) => listing.id === item.rawId) || null)}
                        className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:opacity-80"
                      >
                        Review details
                      </button>
                    </td>
                  </tr>
                )}
              />
            </table>
          </div>
        </div>
      )}

      {/* All Listings */}
      {activeTab === "listings" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">All Listings</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Select a row to inspect the full listing and its safety details.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={listingSearch}
                onChange={(event) => setListingSearch(event.target.value)}
                placeholder="Search listing, landlord, address"
                aria-label="Search listings"
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              />
              <select value={listingStatusFilter} onChange={(event) => setListingStatusFilter(event.target.value)} aria-label="Filter listings by status" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Published</option>
                <option value="suspended">Suspended</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-[var(--muted)]">
                <tr>
                  {["Listing", "Landlord", "Rooms", "From / month", "Safety", "Status", "Details"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <PaginatedTableBody
                rows={filteredListings}
                columns={7}
                resetKey={`${listingSearch}|${listingStatusFilter}`}
                emptyMessage="No listings match your search or status filter."
                renderRow={(p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-[var(--muted)] transition-colors" onClick={() => setListingDetail(p)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-xs leading-snug max-w-48">{p.title}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{p.landlordName}</td>
                    <td className="px-4 py-3 text-xs">{p.rooms.length}</td>
                    <td className="px-4 py-3 text-xs font-mono">₱{p.monthlyRent.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs font-semibold">{Number(p.safetyScore).toFixed(1)}/10</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const status = listingStatuses[p.id] || p.status;
                        return (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          status === "suspended"
                            ? "bg-red-100 text-red-700"
                            : status === "approved"
                              ? "bg-emerald-100 text-emerald-700"
                              : status === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                        }`}
                      >
                        {status}
                      </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={(event) => { event.stopPropagation(); setListingDetail(p); }} className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">Review</button>
                    </td>
                  </tr>
                )}
              />
            </table>
          </div>
        </div>
      )}

      {/* Safety Weights */}
      {activeTab === "safety" && (
        <div className="space-y-8">
          {isSuperAdmin && (
            <section className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold">Safety Score Weights</h2>
                <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
                  Each percentage is that factor’s share of the final score out of 10. For example, a 25% weight means a factor rated 8/10 contributes 2 points. All four weights must total exactly 100%.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { key: "police", label: "Distance to police assistance", desc: "Closer is scored higher; 0–2,000m maps linearly from 10 to 0." },
                  { key: "lighting", label: "Street lighting", desc: "Inspector rating from 1 (poorly lit) to 5 (well lit), converted to 2–10." },
                  { key: "gated", label: "Gated access", desc: "Secure gated access scores 10; no secure gate scores 0." },
                  { key: "cctv", label: "CCTV coverage", desc: "Active cameras ÷ required cameras, capped at 10/10." },
                ].map((factor) => (
                  <div key={factor.key} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{factor.label}</div>
                        <div className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">{factor.desc}</div>
                      </div>
                      <span className="font-mono text-lg font-bold text-[var(--primary)]">{weights[factor.key]}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={weights[factor.key]}
                      aria-label={`${factor.label} weight`}
                      onChange={(e) => setWeights((prev) => ({ ...prev, [factor.key]: Number(e.target.value) }))}
                      className="w-full accent-[var(--primary)]"
                    />
                  </div>
                ))}
              </div>
              <div className={`flex items-center justify-between rounded-xl border p-3 ${weightTotal === 100 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                <span className="text-sm font-medium">Weight total</span>
                <span className="font-mono font-bold">{weightTotal}% / 100%</span>
              </div>
              <button
                onClick={saveWeights}
                disabled={weightTotal !== 100}
                className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save Weights
              </button>
            </section>
          )}

          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div>
              <h3 className="font-display text-lg font-semibold">Record a Safety Inspection</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Enter measured values from the property visit. Scores use the current weights and a 0–10 scale with partial credit for non-gated properties and neutral credit when CCTV is not required.</p>
            </div>
            <div>
              <label htmlFor="inspection-property" className="mb-1.5 block text-xs font-semibold">Property being inspected</label>
              <select id="inspection-property" value={inspect.houseId} onChange={(e) => setInspect({ ...inspect, houseId: e.target.value })} className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
                <option value="">Select property…</option>
                {PROPERTIES.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.landlordName}</option>)}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="inspection-police-distance" className="mb-1.5 block text-xs font-semibold">Nearest police station/post (meters)</label>
                <input id="inspection-police-distance" type="number" min="0" step="1" value={inspect.police} onChange={(e) => setInspect({ ...inspect, police: e.target.value })} placeholder="e.g. 450" className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm" />
                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">Closer stations score higher; proximity scores range from 10/10 nearby to 2/10 at 2km or farther.</p>
              </div>
              <div>
                <label htmlFor="inspection-lighting" className="mb-1.5 block text-xs font-semibold">Lighting on the route/property</label>
                <select id="inspection-lighting" value={inspect.lighting} onChange={(e) => setInspect({ ...inspect, lighting: e.target.value })} className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
                  <option value="">Select rating…</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5 — {n === 1 ? "Very poor" : n === 5 ? "Very well lit" : "Moderate"}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">Rate visible lighting coverage from 1 (poor) to 5 (well lit).</p>
              </div>
              <div>
                <label htmlFor="inspection-cctv-active" className="mb-1.5 block text-xs font-semibold">Active CCTV cameras</label>
                <input id="inspection-cctv-active" type="number" min="0" step="1" value={inspect.active} onChange={(e) => setInspect({ ...inspect, active: e.target.value })} placeholder="Number working" className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm" />
              </div>
              <div>
                <label htmlFor="inspection-cctv-required" className="mb-1.5 block text-xs font-semibold">CCTV cameras required</label>
                <input id="inspection-cctv-required" type="number" min="0" step="1" value={inspect.required} onChange={(e) => setInspect({ ...inspect, required: e.target.value })} placeholder="Number expected" className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm" />
                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">Enter 0 if cameras are not required; CCTV then receives a neutral 5/10 instead of lowering the score.</p>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
              <input type="checkbox" checked={inspect.gated} onChange={(e) => setInspect({ ...inspect, gated: e.target.checked })} className="mt-0.5" />
              <span><span className="block font-semibold">Secure gated property</span><span className="text-xs text-[var(--muted-foreground)]">Mark this only if access is controlled by a secure gate; a property without one receives partial credit (4/10) rather than zero.</span></span>
            </label>
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--primary)]/20 bg-[var(--secondary)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Weighted score preview</div>
                <div className="mt-1 text-sm text-[var(--muted-foreground)]">{inspectionPreview == null ? "Complete all inspection fields and set weights to 100% to preview the score." : "Score uses the current weights, totaling 100%."}</div>
              </div>
              <div className="font-display text-3xl font-bold text-[var(--primary)]">{inspectionPreview == null ? "—" : `${inspectionPreview}/10`}</div>
            </div>
            <button onClick={submitInspection} disabled={!inspectionReady} className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Save inspection & score</button>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-display text-lg font-semibold">Latest Inspection by Listing</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Measured values and score components from each listing’s newest inspection.</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <table className="w-full min-w-[64rem] text-sm">
                <thead className="bg-[var(--muted)]"><tr>{["Property", "Inspected", "Police distance", "Lighting", "Secure gate", "CCTV", "Score", "Update"].map((heading) => <th key={heading} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
                <PaginatedTableBody
                  rows={PROPERTIES}
                  columns={8}
                  resetKey={PROPERTIES.length}
                  emptyMessage="No listings available to inspect."
                  renderRow={(property) => {
                    const inspection = property.safetyBreakdown;
                    const hasCompleteInspection = Boolean(inspection.inspectedAt) &&
                      [inspection.policeDistanceMeters, inspection.lightingRating, inspection.cctvActive, inspection.cctvRequired]
                        .every((value) => value != null && Number.isFinite(Number(value)));
                    return (
                      <tr key={property.id}>
                        <td className="px-3 py-3 font-medium">{property.title}</td>
                        <td className="px-3 py-3 text-xs">{inspection.inspectedAt || "No inspection"}</td>
                        <td className="px-3 py-3 text-xs">{inspection.policeDistanceMeters == null ? "—" : `${inspection.policeDistanceMeters.toLocaleString()} m`}</td>
                        <td className="px-3 py-3 text-xs">{inspection.lightingRating == null ? "—" : `${inspection.lightingRating}/5`}</td>
                        <td className="px-3 py-3 text-xs">{inspection.inspectedAt ? inspection.hasGatedAccess ? "Yes" : "No" : "—"}</td>
                        <td className="px-3 py-3 text-xs">{inspection.cctvActive == null ? "—" : `${inspection.cctvActive} / ${inspection.cctvRequired}`}</td>
                        <td className="px-3 py-3 font-semibold">{inspection.inspectedAt ? `${Number(property.safetyScore).toFixed(1)}/10` : "Not scored"}</td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => recalculateInspectionScore(property)}
                            disabled={!hasCompleteInspection || !weightsLoaded}
                            className="whitespace-nowrap rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Recalculate score
                          </button>
                        </td>
                      </tr>
                    );
                  }}
                />
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Reviews */}
      {activeTab === "reviews" && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Review Moderation</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Open a review to read it in full and access moderation actions. Remove hides it from public display; it does not delete the record.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={reviewSearch}
              onChange={(event) => setReviewSearch(event.target.value)}
              placeholder="Search reviewer, listing, review text"
              aria-label="Search reviews"
              className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            />
            <select value={reviewStatusFilter} onChange={(event) => setReviewStatusFilter(event.target.value)} aria-label="Filter reviews by visibility" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
              <option value="all">All reviews</option>
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-[var(--muted)]">
                <tr>{["Reviewer", "Listing", "Rating", "Date", "Visibility", "Details"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr>
              </thead>
              <PaginatedTableBody
                rows={filteredReviews}
                columns={6}
                resetKey={`${reviewSearch}|${reviewStatusFilter}`}
                emptyMessage={reviews.length ? "No reviews match your search or filter." : "No reviews to moderate."}
                renderRow={(review) => (
                  <tr key={review.id} className="hover:bg-[var(--muted)]">
                    <td className="px-4 py-3 font-medium">{review.studentName}</td>
                    <td className="px-4 py-3">{review.propertyTitle || "—"}</td>
                    <td className="px-4 py-3 text-amber-600">{"★".repeat(Math.max(0, Math.min(5, review.rating)))} <span className="text-[var(--foreground)]">{Number(review.rating).toFixed(1)}/5</span></td>
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{review.date || "—"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${review.status === "hidden" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{review.status === "hidden" ? "Hidden" : "Visible"}</span></td>
                    <td className="px-4 py-3"><button type="button" onClick={() => setReviewDetail(review)} className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">Open review</button></td>
                  </tr>
                )}
              />
            </table>
          </div>
        </div>
      )}

      {/* Badge Verification */}
      {activeTab === "badges" && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Badge Verification</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Manage which verification badges are shown on listings. The current schema stores badge state only; it does not store supporting evidence or review history.</p>
          </div>
          <input type="search" value={badgeSearch} onChange={(event) => setBadgeSearch(event.target.value)} placeholder="Search listing, landlord, badge" aria-label="Search badge records" className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm sm:max-w-sm" />
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-[var(--muted)]"><tr>{["Listing", "Landlord", "Badge", "Status", "Action"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
              <PaginatedTableBody
                rows={badgeRows}
                columns={5}
                resetKey={badgeSearch}
                emptyMessage="No badge records match your search."
                renderRow={({ listing, column, label, verified }) => (
                  <tr key={`${listing.id}-${column}`} className="hover:bg-[var(--muted)]">
                    <td className="px-4 py-3 font-medium">{listing.title}</td>
                    <td className="px-4 py-3">{listing.landlordName}</td>
                    <td className="px-4 py-3">{label}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${verified ? "bg-emerald-50 text-emerald-700" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>{verified ? "Enabled" : "Not enabled"}</span></td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => run(() => updateHouse(Number(listing.id), { [column]: !verified }), "Badge updated", `${label} ${verified ? "removed from" : "granted to"} ${listing.title}.`)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${verified ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                        {verified ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                )}
              />
            </table>
          </div>
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

      {/* Listing detail and moderation */}
      {listingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="listing-detail-title">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--muted)] px-5 py-4">
              <div>
                <h3 id="listing-detail-title" className="font-display text-lg font-semibold">{listingDetail.title}</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{listingDetail.address} · Listed by {listingDetail.landlordName}</p>
              </div>
              <button type="button" onClick={() => setListingDetail(null)} aria-label="Close listing details" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--border)]">✕</button>
            </div>
            <div className="space-y-5 overflow-y-auto p-5">
              {listingDetail.images?.[0] && <img src={listingDetail.images[0]} alt={listingDetail.title} className="h-52 w-full rounded-xl object-cover" />}
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Listing overview</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{listingDetail.description || "No description provided."}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-[var(--secondary)] px-3 py-1 font-semibold text-[var(--primary)]">Status: {listingStatuses[listingDetail.id] || listingDetail.status}</span>
                  <span className="rounded-full bg-[var(--muted)] px-3 py-1">From ₱{Number(listingDetail.monthlyRent).toLocaleString()} / month</span>
                  <span className="rounded-full bg-[var(--muted)] px-3 py-1">{listingDetail.rooms.length} rooms</span>
                </div>
              </section>
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Rooms and rates</h4>
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead className="bg-[var(--muted)]"><tr>{["Room", "Monthly rent", "Deposit", "Capacity", "Status", "Amenities"].map((heading) => <th key={heading} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
                    <PaginatedTableBody
                      rows={listingDetail.rooms}
                      columns={6}
                      resetKey={listingDetail.id}
                      emptyMessage="No room records on this listing."
                      renderRow={(room) => (
                        <tr key={room.id}>
                          <td className="px-3 py-2 font-medium">{room.name || "Room"}</td>
                          <td className="px-3 py-2">₱{Number(room.price || 0).toLocaleString()}</td>
                          <td className="px-3 py-2">₱{Number(room.securityDeposit || 0).toLocaleString()}</td>
                          <td className="px-3 py-2">{room.capacity ?? "—"}</td>
                          <td className="px-3 py-2 capitalize">{room.status || "—"}</td>
                          <td className="px-3 py-2 text-xs">{room.amenities?.join(", ") || "—"}</td>
                        </tr>
                      )}
                    />
                  </table>
                </div>
                {listingDetail.badges.length > 0 && <p className="mt-2 text-xs text-[var(--muted-foreground)]">Badges: {listingDetail.badges.join(", ")}</p>}
              </section>
              <section className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Latest safety inspection</h4>
                {listingDetail.safetyBreakdown.inspectedAt ? (
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Inspection date</dt><dd className="font-medium">{listingDetail.safetyBreakdown.inspectedAt}</dd></div>
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Current overall score</dt><dd className="font-medium">{Number(listingDetail.safetyScore).toFixed(1)}/10</dd></div>
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Nearest police station/post</dt><dd className="font-medium">{listingDetail.safetyBreakdown.policeDistanceMeters == null ? "Not recorded" : `${listingDetail.safetyBreakdown.policeDistanceMeters.toLocaleString()} meters`}</dd></div>
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Lighting rating</dt><dd className="font-medium">{listingDetail.safetyBreakdown.lightingRating == null ? "Not recorded" : `${listingDetail.safetyBreakdown.lightingRating}/5`}</dd></div>
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Secure gated access</dt><dd className="font-medium">{listingDetail.safetyBreakdown.hasGatedAccess ? "Yes" : "No"}</dd></div>
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Active / required CCTV</dt><dd className="font-medium">{listingDetail.safetyBreakdown.cctvActive == null ? "Not recorded" : `${listingDetail.safetyBreakdown.cctvActive} / ${listingDetail.safetyBreakdown.cctvRequired}`}</dd></div>
                  </dl>
                ) : <p className="mt-2 text-sm text-[var(--muted-foreground)]">No safety inspection has been recorded for this listing.</p>}
              </section>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--muted)] px-5 py-3">
              <button type="button" onClick={() => setListingDetail(null)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold">Close</button>
              {listingDetail.status === "pending" && (
                <>
                  <button type="button" onClick={() => { openAdminAction({ kind: "house", id: listingDetail.id, title: listingDetail.title, action: "reject" }); setListingDetail(null); }} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white">Reject</button>
                  <button type="button" onClick={() => { openAdminAction({ kind: "house", id: listingDetail.id, title: listingDetail.title, action: "approve" }); setListingDetail(null); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Approve</button>
                </>
              )}
              {listingDetail.status === "approved" && <button type="button" onClick={() => { setListingToSuspend(listingDetail); setListingDetail(null); }} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white">Suspend listing</button>}
            </div>
          </div>
        </div>
      )}

      {/* Landlord verification detail */}
      {verificationDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="verification-detail-title">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--muted)] px-5 py-4">
              <div>
                <h3 id="verification-detail-title" className="font-display text-lg font-semibold">Landlord verification</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{verificationDetail.landlords?.full_name || "Landlord"} · Submitted {(verificationDetail.created_at || "").slice(0, 10) || "date unavailable"}</p>
              </div>
              <button type="button" onClick={() => setVerificationDetail(null)} aria-label="Close verification details" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--border)]">✕</button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-[var(--muted-foreground)]">Open each attached document and confirm it is valid before approving or rejecting this verification.</p>
              {[
                ["Government-issued ID", verificationDetail.government_id_url],
                ["Property ownership proof", verificationDetail.proof_of_ownership_url],
                ["Business permit", verificationDetail.business_permit_url],
                ["Internet service proof", verificationDetail.isp_bill_url],
                ["Water service proof", verificationDetail.water_proof_url],
                ["Safety audit", verificationDetail.safety_audit_url],
              ].map(([label, url]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
                  <span className="text-sm font-medium">{label}</span>
                  {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] underline">Open document</a> : <span className="text-xs text-[var(--muted-foreground)]">Not attached</span>}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--muted)] px-5 py-3">
              <button type="button" onClick={() => setVerificationDetail(null)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold">Close</button>
              <button type="button" onClick={() => { openAdminAction({ kind: "verification", id: verificationDetail.verification_id, title: verificationDetail.landlords?.full_name || "Landlord verification", action: "reject" }); setVerificationDetail(null); }} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white">Reject</button>
              <button type="button" onClick={() => { openAdminAction({ kind: "verification", id: verificationDetail.verification_id, title: verificationDetail.landlords?.full_name || "Landlord verification", action: "approve" }); setVerificationDetail(null); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* Review details and moderation */}
      {reviewDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="review-detail-title">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--muted)] px-5 py-4">
              <div>
                <h3 id="review-detail-title" className="font-display text-lg font-semibold">Review details</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{reviewDetail.studentName} · {reviewDetail.propertyTitle} · {reviewDetail.date}</p>
              </div>
              <button type="button" onClick={() => setReviewDetail(null)} aria-label="Close review details" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--border)]">✕</button>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <span className="text-lg text-amber-500">{"★".repeat(Math.max(0, Math.min(5, reviewDetail.rating)))}{"☆".repeat(Math.max(0, 5 - Math.min(5, reviewDetail.rating)))}</span>
                <span className="text-sm font-semibold">{Number(reviewDetail.rating).toFixed(1)} / 5</span>
                <span className={`ml-auto rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${reviewDetail.status === "hidden" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{reviewDetail.status === "hidden" ? "Hidden" : "Visible"}</span>
              </div>
              <blockquote className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm leading-relaxed">{reviewDetail.comment || "No written comment was submitted."}</blockquote>
              <p className="text-xs text-[var(--muted-foreground)]">Moderation actions are recorded in the audit log. Removing a review hides it from public display; it is not deleted.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--muted)] px-5 py-3">
              <button type="button" onClick={() => setReviewDetail(null)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold">Close</button>
              {reviewDetail.status === "hidden"
                ? <button type="button" onClick={() => { updateReviewStatus(reviewDetail.id, "flagged"); setReviewDetail(null); }} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white">Restore review</button>
                : <>
                    <button type="button" onClick={() => { updateReviewStatus(reviewDetail.id, "hidden"); setReviewDetail(null); }} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold">Hide review</button>
                    <button type="button" onClick={() => { setReviewToRemove(reviewDetail); setReviewDetail(null); }} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white">Remove review</button>
                  </>
              }
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
              Are you sure you want to remove this review? This action hides it from the public property page; the record remains available to administrators.
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
            <p className="text-xs text-[var(--muted-foreground)] mb-4">A reason is required and will be recorded in the audit trail.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={modalItem.action === "reject" ? "Reason for rejection..." : "Reason for approval..."}
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
                  const note = reason.trim();
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
                disabled={!reason.trim()}
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
