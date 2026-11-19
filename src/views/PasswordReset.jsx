import { useState } from "react";
import Logo from "../components/Logo.jsx";
import { GENERIC_ERROR_MESSAGE, updatePassword } from "../lib/api.js";

export default function PasswordReset({ onBack, onComplete }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await updatePassword(password);
      setUpdated(true);
    } catch (err) {
      setError(err.message || GENERIC_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  async function continueToApp() {
    setError("");
    setLoading(true);
    try {
      await onComplete();
    } catch (err) {
      setError(err.message || GENERIC_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo variant="dark" height={48} />
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm sm:p-8">
          {updated ? (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-semibold">Password updated</h1>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  Your password has been changed. Sign in with the new password to continue.
                </p>
              </div>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                  {error}
                </div>
              )}
              <button
                type="button"
                onClick={continueToApp}
                disabled={loading}
                className="w-full rounded-xl bg-[var(--primary)] py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Preparing sign in…" : "Continue to sign in"}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl font-semibold">Choose a new password</h1>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  Use at least 8 characters for your new password.
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-new-password" className="mb-1.5 block text-sm font-semibold">Confirm new password</label>
                  <input
                    id="confirm-new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-[var(--primary)] py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? "Updating password…" : "Update password"}
                </button>
              </form>
            </>
          )}
          <button
            type="button"
            onClick={onBack}
            className="mt-4 w-full py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            ← Back to role selection
          </button>
        </div>
      </div>
    </div>
  );
}
