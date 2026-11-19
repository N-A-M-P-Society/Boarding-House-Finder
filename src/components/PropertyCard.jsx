
import { useRef, useState } from "react";
import ImageLightbox from "./ImageLightbox.jsx";

// PROPERTY CARD COMPONENT
// This component displays a rental property's information in a card format.
//
// It shows:
// - Property image and title.
// - Property address.
// - Property badges.
// - Safety score.
// - Walking distance to campus.
// - Average review rating.
// - Available amenities.
// - Monthly rental price.
// - A button for comparing properties.
//
// PROPS:
// property     - Object containing the rental property's information.
// onClick      - Function called when the property card is clicked.
// isSelected   - Indicates whether this property is currently selected.
// onCompare    - Function called when the user clicks the Compare button.
// inComparison - Indicates whether this property is already in the comparison list.
export default function PropertyCard({
  property,
  onClick,
  isSelected,
  onCompare,
  inComparison,
  imageClickNavigates = false,
  lightboxKeyboardNavigation = false
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef(null);
  const suppressImageClick = useRef(false);
  const images = property.images?.length ? property.images : ["/unirent-logo.png"];
  const showPreviousImage = (event) => {
    event.stopPropagation();
    setImageIndex((index) => (index - 1 + images.length) % images.length);
  };
  const showNextImage = (event) => {
    event.stopPropagation();
    setImageIndex((index) => (index + 1) % images.length);
  };

  // CALCULATE THE AVERAGE REVIEW RATING
  // Check whether the property has any reviews.
  //
  // If reviews exist:
  // 1. reduce() adds together the overallRating of every review.
  // 2. Divide the total rating by the number of reviews.
  // 3. toFixed(1) formats the result to one decimal place.
  //
  // If there are no reviews, avgRating becomes null.
  const avgRating = property.reviews.length
    ? (
        property.reviews.reduce((sum, r) => sum + r.overallRating, 0) /
        property.reviews.length
      ).toFixed(1)
    : null;

  // SAFETY SCORE COLOR
  // Determine the background and text colors of the safety score label.
  //
  // 8.5 and above = Green (higher safety score).
  // 7 and above   = Amber (moderate safety score).
  // Below 7       = Red (lower safety score).
  //
  // The color classes are applied dynamically based on the property's score.
  const safetyColor =
    property.safetyScore >= 8.5
      ? "text-emerald-600 bg-emerald-50"
      : property.safetyScore >= 7
        ? "text-amber-600 bg-amber-50"
        : "text-red-600 bg-red-50";

  // PROPERTY CARD DISPLAY
  // The return statement defines the visual layout of the property card.
  return (
    <div
      // Apply the card's styling.
      //
      // group allows child elements to respond to hover actions.
      // hover:shadow-lg adds a shadow when the user hovers over the card.
      // hover:-translate-y-0.5 slightly moves the card upward.
      //
      // If isSelected is true, highlight the card with the primary color
      // and add a ring around it.
      className={`group bg-[var(--card)] rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${isSelected ? "border-[var(--primary)] shadow-md ring-2 ring-[var(--primary)] ring-opacity-20" : "border-[var(--border)]"}`}

      // When the user clicks anywhere on the card,
      // execute the onClick function provided by the parent component.
      onClick={onClick}
    >

      {/* PROPERTY IMAGE SECTION */}
      {/* This section displays the property's main image,
          badges, safety score, walking time, and review rating. */}
      <div
        className="relative h-48 touch-pan-y overflow-hidden bg-[var(--muted)]"
        onClick={(event) => {
          if (suppressImageClick.current) {
            event.stopPropagation();
            suppressImageClick.current = false;
          }
        }}
        onTouchStart={imageClickNavigates ? undefined : (event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={imageClickNavigates ? undefined : (event) => {
          const startX = touchStartX.current;
          touchStartX.current = null;
          if (startX == null || images.length < 2 || !event.changedTouches[0]) return;
          const delta = event.changedTouches[0].clientX - startX;
          if (Math.abs(delta) > 40) {
            setImageIndex((index) => (index + (delta < 0 ? 1 : -1) + images.length) % images.length);
            suppressImageClick.current = true;
          }
          touchStartX.current = null;
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            if (imageClickNavigates) return;
            event.stopPropagation();
            if (suppressImageClick.current) {
              suppressImageClick.current = false;
              return;
            }
            setLightboxOpen(true);
          }}
          aria-label={imageClickNavigates ? `View ${property.title} details` : `Open ${property.title} photo ${imageIndex + 1} in photo viewer`}
          className="h-full w-full"
        >
          <img
            src={images[imageIndex]}
            alt={`${property.title}, photo ${imageIndex + 1} of ${images.length}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </button>

        {/* Add a dark gradient overlay over the bottom of the image.
            This helps text displayed over the image remain readable. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* PROPERTY BADGES */}
        {/* Display up to two badges assigned to the property.
            Examples might include verified or featured labels,
            depending on the badge data supplied by the application. */}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          {property.badges.slice(0, 1).map((badge) => (
            <span
              // Use the badge text as its unique React key.
              key={badge}
              className="px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-full text-[10px] font-semibold text-[var(--primary)] border border-white/50"
            >
              {/* Display a checkmark beside the badge name. */}
              ✓ {badge}
            </span>
          ))}
        </div>
        {lightboxOpen && !imageClickNavigates && (
          <ImageLightbox
            images={images}
            initialIndex={imageIndex}
            title={property.title}
            onClose={() => setLightboxOpen(false)}
            onIndexChange={setImageIndex}
            keyboardNavigation={lightboxKeyboardNavigation}
          />
        )}

        {/* SAFETY SCORE DISPLAY */}
        {/* Position the safety score at the upper-right corner of the image. */}
        <div className="absolute top-3 right-3">
          <span
            className={`rounded-lg px-2 py-1 text-xs font-bold ${safetyColor}`}
            title="Overall safety score on a 10-point scale"
          >
            Safety {Number(property.safetyScore).toFixed(1)}/10
          </span>
        </div>

        {images.length > 1 && !imageClickNavigates && (
          <>
            <button
              type="button"
              onClick={showPreviousImage}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-lg text-white shadow transition hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:opacity-0 md:group-hover:opacity-100"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={showNextImage}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-lg text-white shadow transition hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:opacity-0 md:group-hover:opacity-100"
            >
              ›
            </button>
            <span className="absolute bottom-12 right-3 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
              {imageIndex + 1} / {images.length}
            </span>
          </>
        )}

        {/* WALKING TIME AND REVIEW RATING */}
        {/* Display these details along the bottom of the property image. */}
        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">

          {/* Show the estimated walking time to campus in minutes. */}
          <span className="text-white text-xs font-medium bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg">
            🚶 {property.walkingMinutes} min walk
          </span>

          {/* Only display the review rating if the property has reviews.
              avgRating is null when there are no reviews. */}
          {avgRating && (
            <span className="text-white text-xs font-medium bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg">
              {/* Show the average rating and total number of reviews. */}
              ★ {avgRating} ({property.reviews.length})
            </span>
          )}
        </div>
      </div>

      {/* PROPERTY INFORMATION SECTION */}
      {/* This section contains the property's title, address,
          amenities, monthly rent, and comparison button. */}
      <div className="p-4">

        {/* PROPERTY TITLE */}
        {/* Display the property's name or title.
            line-clamp-2 limits the title to two lines. */}
        <h3 className="font-semibold text-sm leading-snug mb-1 line-clamp-2">
          {property.title}
        </h3>

        {/* PROPERTY ADDRESS */}
        {/* Display the property's address.
            truncate prevents long addresses from overflowing the card. */}
        <p className="text-xs text-[var(--muted-foreground)] mb-3 truncate">
          {property.address}
        </p>

        {/* PROPERTY AMENITIES */}
        {/* Display up to three amenities available at the property. */}
        <div className="flex gap-1.5 flex-wrap mb-3">

          {/* Loop through the first three amenities in the array. */}
          {property.amenities.slice(0, 3).map((amenity) => (
            <span
              // Use the amenity name as its unique React key.
              key={amenity}
              className="px-2 py-0.5 bg-[var(--secondary)] text-[var(--primary)] rounded-md text-[10px] font-medium"
            >
              {/* Display the amenity name. */}
              {amenity}
            </span>
          ))}

          {/* ADDITIONAL AMENITIES COUNT */}
          {/* If the property has more than three amenities,
              show how many additional amenities are available.
              
              Example:
              If there are 5 amenities, this displays "+2". */}
          {property.amenities.length > 3 && (
            <span className="px-2 py-0.5 bg-[var(--muted)] text-[var(--muted-foreground)] rounded-md text-[10px] font-medium">
              +{property.amenities.length - 3}
            </span>
          )}
        </div>

        {/* PRICE AND COMPARISON SECTION */}
        {/* This row displays the monthly rent on the left
            and the Compare button on the right. */}
        <div className="flex items-center justify-between">

          {/* MONTHLY RENT */}
          <div>

            {/* Display the monthly rental price in Philippine pesos.
                toLocaleString() adds thousands separators.
                Example: 15000 becomes 15,000. */}
            <span className="text-lg font-bold font-display text-[var(--primary)]">
              ₱{property.monthlyRent.toLocaleString()}
            </span>

            {/* Indicate that the displayed price is per month. */}
            <span className="text-xs text-[var(--muted-foreground)]">
              /mo
            </span>
          </div>

          {/* COMPARE BUTTON */}
          {/* Only display this button if the parent component
              provides an onCompare function. */}
          {onCompare && (
            <button

              // Stop the click event from reaching the parent property card.
              // Without this, clicking Compare would also trigger the card's
              // onClick function.
              onClick={(e) => {
                e.stopPropagation();

                // Send the current property object to the parent component.
                // The parent can then add or remove it from the comparison list.
                onCompare(property);
              }}

              // Change the button's appearance depending on whether
              // the property is already in the comparison list.
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                inComparison
                  // Highlight the button when the property is already added.
                  ? "bg-[var(--accent)] text-white"

                  // Use the normal button style when it is not yet added.
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--primary)]"
              }`}
            >

              {/* Change the button label based on comparison status.
                  Already added = "✓ Added"
                  Not yet added = "+ Compare" */}
              {inComparison ? "✓ Added" : "+ Compare"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
