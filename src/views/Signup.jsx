import { useState } from "react";
import { signUp, loadProfile, updateStudentProfile, updateLandlordProfile } from "../lib/api.js";
import Logo from "../components/Logo.jsx";
const ROLE_OPTIONS = [
  { role: "student", label: "Student", icon: "🎓", desc: "I'm looking for off-campus housing near ADDU" },
  { role: "landlord", label: "Landlord", icon: "🏠", desc: "I want to list my property for ADDU students" },
];
export default function Signup({ onBack, onLogin }) {
  const [selectedRole, setSelectedRole] = useState("student");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  // Step 1 fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Step 2 — student extra
  const [studentId, setStudentId] = useState("");
  const [gender, setGender] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  // Step 2 — landlord extra
  const [govIdFile, setGovIdFile] = useState("");
  const [ownershipFile, setOwnershipFile] = useState("");
  const [error, setError] = useState("");
  function handleStep1(e) {
    e.preventDefault();
    if (!fullName || !email || !password || !confirmPassword) {
      setError("Please fill in all required fields.");
      return;
    }
    if (selectedRole === "student" && !email.trim().toLowerCase().endsWith("@addu.edu.ph")) {
      setError("Students must register with an @addu.edu.ph institutional email.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setStep(2);
  }
  const [notice, setNotice] = useState("");
  async function handleStep2(e) {
    e.preventDefault();
    if (selectedRole === "student" && (!studentId || !gender || !academicYear)) {
      setError("Please complete your student profile.");
      return;
    }
    if (selectedRole === "student" && !/^[0-9]{12}$/.test(studentId)) {
      setError("Student ID Number must contain exactly 12 digits.");
      return;
    }
    if (selectedRole === "landlord" && (!govIdFile || !ownershipFile)) {
      setError("Both documents are required for landlord verification.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      // The DB trigger creates accounts + students/landlords rows from this metadata
      const res = await signUp({
        email,
        password,
        fullName,
        role: selectedRole,
        studentIdNumber: studentId,
        academicYear,
        gender,
        phoneNumber: phone,
      });
      if (!res.session) {
        setNotice("Account created. Check your email to confirm your address, then sign in.");
        return;
      }
      const profile = await loadProfile();
      if (selectedRole === "student" && profile?.studentId) {
        await updateStudentProfile(profile.studentId, {
          phone_number: phone || null,
          student_id_number: studentId,
          academic_year: academicYear,
          gender,
        });
      } else if (selectedRole === "landlord" && profile?.landlordId) {
        // Only the file names are stored here; wire these to Supabase Storage to keep the actual files.
        await updateLandlordProfile(profile.landlordId, {
          phone_number: phone || null,
          government_id: govIdFile,
          proof_of_ownership_url: ownershipFile,
        });
      }
      onLogin(await loadProfile());
    } catch (err) {
      setError(err.message || "Sign up failed.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-2/5 xl:w-1/2 relative flex-col justify-between p-10 bg-[var(--primary)] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img
            src="https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=1200&h=900&fit=crop&auto=format"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/95 to-[#062e3a]/98" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-[var(--accent)]/10" />

        <div className="relative">
          <button onClick={onBack} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-medium">
            ← Back to sign in
          </button>
        </div>

        <div className="relative space-y-4">
          <div className="text-5xl">{selectedRole === "student" ? "🎓" : "🏠"}</div>
          <h2 className="font-display text-3xl xl:text-4xl font-semibold leading-tight">
            {selectedRole === "student"
              ? "Join 2,400+ students who found safe housing near ADDU."
              : "Start connecting with verified ADDU student tenants."}
          </h2>
          <p className="text-white/65 text-sm leading-relaxed max-w-xs">
            {selectedRole === "student"
              ? "Get matched with verified listings, compatible roommates, and direct chat with landlords."
              : "List your property, earn verification badges, and manage bookings — all on one platform."}
          </p>
        </div>

        {/* Steps indicator */}
        <div className="relative flex items-center gap-3">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s ? "bg-white text-[var(--primary)]" : "bg-white/20 text-white/60"}`}
              >
                {s}
              </div>
              <span className={`text-xs font-medium ${step >= s ? "text-white" : "text-white/50"}`}>
                {s === 1 ? "Account info" : selectedRole === "student" ? "Student profile" : "Landlord docs"}
              </span>
              {s < 2 && <span className="text-white/30 mx-1">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-[var(--background)] overflow-y-auto">
        {/* Mobile back */}
        <div className="lg:hidden w-full max-w-md mb-6 flex items-center justify-between">
          <button
            onClick={step === 2 ? () => setStep(1) : onBack}
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] font-medium flex items-center gap-1"
          >
            ← {step === 2 ? "Back" : "Sign in"}
          </button>
          <Logo variant="dark" height={44} />
        </div>

        <div className="w-full max-w-md">
          <h2 className="font-display text-3xl font-semibold mb-1">Create account</h2>
          <p className="text-[var(--muted-foreground)] text-sm mb-6">Step {step} of 2</p>

          {/* Step 1 */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              {/* Role selector */}
              <div>
                <label className="block text-sm font-semibold mb-2">I am a…</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      type="button"
                      key={r.role}
                      onClick={() => setSelectedRole(r.role)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center ${
                        selectedRole === r.role
                          ? "border-[var(--primary)] bg-[var(--secondary)] text-[var(--primary)]"
                          : "border-[var(--border)] hover:border-[var(--primary)]/40"
                      }`}
                    >
                      <span className="text-2xl">{r.icon}</span>
                      <div>
                        <div className="font-semibold text-sm">{r.label}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)] leading-snug mt-0.5">{r.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan dela Cruz"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                  {selectedRole === "student" && <span className="ml-1 text-[10px] font-normal text-amber-600">@addu.edu.ph required</span>}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={selectedRole === "student" ? "yourname@addu.edu.ph" : "yourname@email.com"}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+63 9XX XXX XXXX"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1.5">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">
                    Confirm <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  <span>⚠</span> {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Continue →
              </button>

              <p className="text-center text-xs text-[var(--muted-foreground)]">
                Already have an account?{" "}
                <button type="button" onClick={onBack} className="text-[var(--primary)] hover:underline font-medium">
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* Step 2 */}
          {step === 2 && selectedRole === "student" && (
            <form onSubmit={handleStep2} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                🎓 Complete your student profile to access the platform.
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Gender <span className="text-red-500">*</span>
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                >
                  <option value="">— Select gender —</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Student ID Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
                  placeholder="e.g. 220241234567"
                  inputMode="numeric"
                  maxLength={12}
                  pattern="[0-9]{12}"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                />
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">Enter exactly 12 digits, without spaces or dashes.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Academic Year <span className="text-red-500">*</span>
                </label>
                <select
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                >
                  <option value="">— Select year —</option>
                  {["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "Graduate"].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Emergency Contact Name</label>
                <input
                  type="text"
                  placeholder="Parent or guardian name"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Emergency Contact Number</label>
                <input
                  type="tel"
                  placeholder="+63 9XX XXX XXXX"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
                />
              </div>

              {notice && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs">{notice}</div>
              )}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  <span>⚠</span> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Creating your account…
                  </span>
                ) : (
                  "Create Student Account"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep(1);
                }}
                className="w-full text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] py-2"
              >
                ← Back to account info
              </button>
            </form>
          )}

          {step === 2 && selectedRole === "landlord" && (
            <form onSubmit={handleStep2} className="space-y-4">
              <div className="p-3 bg-[var(--secondary)] border border-[var(--primary)]/20 rounded-xl text-xs text-[var(--primary)]">
                🏠 Upload your verification documents. They will be reviewed by the UniRent admin team before your account is approved.
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Government-issued ID <span className="text-red-500">*</span>
                </label>
                <label
                  className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${govIdFile ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)] hover:border-[var(--primary)]/50"}`}
                >
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={(e) => setGovIdFile(e.target.files?.[0]?.name || "")}
                  />
                  {govIdFile ? (
                    <>
                      <span className="text-2xl">✅</span>
                      <span className="text-xs font-medium text-[var(--primary)]">{govIdFile}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl">📄</span>
                      <span className="text-xs text-[var(--muted-foreground)]">Click to upload — JPG, PNG, or PDF</span>
                    </>
                  )}
                </label>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Property Ownership Proof <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-[var(--muted-foreground)] mb-2">
                  Land title, tax declaration, or authorization letter from the property owner.
                </p>
                <label
                  className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${ownershipFile ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)] hover:border-[var(--primary)]/50"}`}
                >
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={(e) => setOwnershipFile(e.target.files?.[0]?.name || "")}
                  />
                  {ownershipFile ? (
                    <>
                      <span className="text-2xl">✅</span>
                      <span className="text-xs font-medium text-[var(--primary)]">{ownershipFile}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl">🏡</span>
                      <span className="text-xs text-[var(--muted-foreground)]">Click to upload — JPG, PNG, or PDF</span>
                    </>
                  )}
                </label>
              </div>

              {notice && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs">{notice}</div>
              )}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  <span>⚠</span> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-[var(--primary)] hover:opacity-90 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Submitting for review…
                  </span>
                ) : (
                  "Submit & Create Account"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep(1);
                }}
                className="w-full text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] py-2"
              >
                ← Back to account info
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
