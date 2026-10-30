const logoSrc = "/unirent-logo.png";
export default function Logo({ variant = "light", className = "", height = 48, maxWidth }) {
  const tealFilter = "brightness(0) saturate(100%) invert(22%) sepia(55%) saturate(600%) hue-rotate(155deg) brightness(0.9)";
  return (
    <img
      src={logoSrc}
      alt="UniRent"
      style={{
        height: `${height}px`,
        /* The PNG canvas is 1:1 (1024×1024) but the actual mark sits in
               roughly the left 55% of the canvas. Constraining max-width trims
               the invisible right-side padding so the text renders much larger
               relative to the displayed height. */
        width: "auto",
        maxWidth: maxWidth != null ? `${maxWidth}px` : `${Math.round(height * 2.6)}px`,
        objectFit: "cover",
        objectPosition: "left center",
        filter: variant === "dark" ? tealFilter : "none",
      }}
      className={className}
    />
  );
}
