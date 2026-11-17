import { useEffect, useState } from "react";
import { uploadPublicImages } from "../lib/api.js";

export default function ProfilePhotoUpload({
  name,
  photoUrl,
  onUploaded,
  avatarClassName = "h-20 w-20 text-3xl",
}) {
  const [imageUrl, setImageUrl] = useState(photoUrl || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingSaveUrl, setPendingSaveUrl] = useState("");

  useEffect(() => {
    setImageUrl(photoUrl || "");
  }, [photoUrl]);

  async function handleChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const [url] = await uploadPublicImages([file], "profiles");
      setImageUrl(url);
      setPendingSaveUrl(url);
      try {
        await onUploaded(url);
        setPendingSaveUrl("");
      } catch (saveError) {
        setError(`Photo uploaded, but saving it to your profile failed: ${saveError.message}`);
      }
    } catch (uploadError) {
      setError(`Photo upload failed: ${uploadError.message}`);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function retrySave() {
    if (!pendingSaveUrl) return;
    setBusy(true);
    setError("");
    try {
      await onUploaded(pendingSaveUrl);
      setPendingSaveUrl("");
    } catch (saveError) {
      setError(`Photo uploaded, but saving it to your profile failed: ${saveError.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`flex ${avatarClassName} items-center justify-center overflow-hidden rounded-full bg-[var(--primary)] font-bold text-white`}>
        {imageUrl ? <img src={imageUrl} alt={`${name || "User"} profile`} className="h-full w-full object-cover" /> : (name || "U").charAt(0).toUpperCase()}
      </div>
      <label className={`cursor-pointer text-center text-[10px] font-semibold ${busy ? "text-[var(--muted-foreground)]" : "text-[var(--primary)] hover:underline"}`}>
        {busy ? "Uploading…" : "Change photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={handleChange} className="sr-only" />
      </label>
      {error && <span role="alert" className="w-full max-w-56 break-words text-center text-[10px] text-red-600">{error}</span>}
      {pendingSaveUrl && (
        <button type="button" onClick={retrySave} disabled={busy} className="text-center text-[10px] font-semibold text-[var(--primary)] hover:underline disabled:opacity-50">
          Retry saving photo
        </button>
      )}
    </div>
  );
}
