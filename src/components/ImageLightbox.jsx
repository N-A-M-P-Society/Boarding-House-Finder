import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function ImageLightbox({
  images,
  initialIndex = 0,
  title,
  onClose,
  onIndexChange,
  keyboardNavigation = false,
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [portalRoot, setPortalRoot] = useState(null);
  const closeButtonRef = useRef(null);
  const returnFocusRef = useRef(null);
  const imageCount = images.length;

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  function selectImage(nextIndex) {
    const index = (nextIndex + imageCount) % imageCount;
    setActiveIndex(index);
    onIndexChange?.(index);
  }

  useEffect(() => {
    if (!portalRoot) return;
    const previousOverflow = document.body.style.overflow;
    returnFocusRef.current = document.activeElement;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (returnFocusRef.current instanceof HTMLElement && returnFocusRef.current.isConnected) {
        returnFocusRef.current.focus();
      }
    };
  }, [portalRoot]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (keyboardNavigation && imageCount > 1 && event.key === "ArrowLeft") {
        event.preventDefault();
        selectImage(activeIndex - 1);
      } else if (keyboardNavigation && imageCount > 1 && event.key === "ArrowRight") {
        event.preventDefault();
        selectImage(activeIndex + 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, imageCount, keyboardNavigation, onClose]);

  if (!imageCount || !portalRoot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4"
      role="presentation"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-full w-full max-w-7xl items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} photos`}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close photo viewer"
          className="absolute right-0 top-0 z-10 rounded-full bg-white/15 px-3 py-2 text-xl text-white hover:bg-white/25"
        >
          ×
        </button>
        <img
          src={images[activeIndex]}
          alt={`${title}, photo ${activeIndex + 1} of ${imageCount}`}
          className="h-auto w-auto max-w-full object-contain"
          style={{ maxHeight: "calc(100dvh - 2rem)" }}
        />
        {imageCount > 1 && (
          <>
            <button
              type="button"
              onClick={() => selectImage(activeIndex - 1)}
              aria-label="Previous photo"
              className="absolute left-0 rounded-full bg-white/15 px-4 py-2 text-3xl text-white hover:bg-white/25"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => selectImage(activeIndex + 1)}
              aria-label="Next photo"
              className="absolute right-0 rounded-full bg-white/15 px-4 py-2 text-3xl text-white hover:bg-white/25"
            >
              ›
            </button>
            <span className="absolute bottom-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              {activeIndex + 1} / {imageCount}
            </span>
          </>
        )}
      </div>
    </div>,
    portalRoot,
  );
}
