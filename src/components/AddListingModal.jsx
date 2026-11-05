
"use client";

// Import React's useState Hook to manage changing form data,
// selected amenities, error messages, and submission status.
import { useState } from "react";

// Import API functions from api.js.
// createHouse() creates a new property in the Supabase database.
// createRoom() creates a room connected to the newly created property.
import { createHouse, createRoom } from "../lib/api.js";

// Import amenity constants from mappers.js.
// AMENITY_ENUM contains the allowed amenity values.
// AMENITY_LABELS contains the readable names displayed to users.
import { AMENITY_ENUM, AMENITY_LABELS } from "../lib/mappers.js";

// Import the LeafletMap component to display a map preview
// of the rental property's geographical location.
import LeafletMap from "./LeafletMap.jsx";

// Import useData() to access shared UniRent information,
// particularly the campus location and campus gate coordinates.
import { useData } from "../context/DataContext.jsx";


// Reusable Tailwind CSS classes for styling input fields.
// This keeps all form inputs consistent with UniRent's design.
const input = "w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]";


// Main AddListingModal component.
// onClose closes the modal.
// onCreated notifies the parent component that a listing was created.
export default function AddListingModal({ onClose, onCreated }) {

  // Retrieve shared campus and campus gate information
  // from UniRent's DataContext for the map preview.
  const { campus, gates } = useData();


  // Store all property and initial room information entered by the landlord.
  // These are the initial values before the landlord fills out the form.
  const [f, setF] = useState({
    title: "",             // Name of the rental property.
    address: "",           // Complete property address.
    description: "",       // Description of the property.
    lat: "",               // Latitude coordinate of the property.
    lng: "",               // Longitude coordinate of the property.
    roomNumber: "Room 1",  // Default name of the initial room.
    rate: "",              // Monthly rental price.
    deposit: "",           // Required security deposit.
    capacity: 1            // Maximum number of room occupants.
  });


  // Store the amenities selected by the landlord.
  // An empty array means no amenities have been selected yet.
  const [amenities, setAmenities] = useState([]);


  // Store error messages that may occur during validation
  // or when saving property and room information to Supabase.
  const [error, setError] = useState("");


  // Track whether the form is currently being submitted.
  // This helps prevent repeated submissions while saving.
  const [busy, setBusy] = useState(false);


  // Reusable function for updating individual form fields.
  // The parameter k identifies which field should be updated.
  const set = (k) => (e) =>
    setF((p) => ({
      ...p,                 // Preserve all previously entered form values.
      [k]: e.target.value   // Update only the field identified by k.
    }));


  // Toggle an amenity when the landlord clicks its button.
  // If the amenity is already selected, remove it.
  // Otherwise, add it to the selected amenities array.
  const toggle = (a) =>
    setAmenities((p) =>
      p.includes(a)
        ? p.filter((x) => x !== a)  // Remove the selected amenity.
        : [...p, a]                 // Add the new amenity.
    );


  // Prepare the property marker used by LeafletMap.
  // Only create a marker when both latitude and longitude are provided.
  const pin = f.lat && f.lng
    ? [{
        id: "new",                                  // Identifier for the new property marker.
        title: f.title || "New listing",            // Use the property name or a default title.
        lat: Number(f.lat),                         // Convert latitude from string to number.
        lng: Number(f.lng),                         // Convert longitude from string to number.
        monthlyRent: Number(f.rate) || 0,            // Convert the rental rate into a number.
        safetyScore: 0,                             // Initial placeholder safety score.
        walkingMinutes: "–"                         // Placeholder because walking time is not calculated here.
      }]
    : [];                                           // No marker if coordinates are missing.


  // Handle the landlord's submission of the Add Listing form.
  // async allows this function to wait for database operations.
  async function submit(e) {

    // Prevent the browser's default form submission,
    // which would otherwise reload the entire page.
    e.preventDefault();


    // Validate the required property information.
    // Stop submission and display an error if any required field is empty.
    if (!f.title || !f.address || !f.rate)
      return setError("Name, address and monthly rate are required.");


    // Indicate that the form is currently being submitted.
    setBusy(true);

    // Clear any previous error message before starting.
    setError("");


    // try handles the database operations.
    // catch handles errors if any operation fails.
    try {

      // STEP 1: Create the main property record in Supabase.
      // createHouse() receives the landlord's property information.
      // await waits until the property has been successfully created.
      const houseId = await createHouse({
        title: f.title,                         // Property name.
        address: f.address,                     // Property address.
        description: f.description,             // Property description.
        lat: f.lat ? Number(f.lat) : null,       // Latitude or null if not provided.
        lng: f.lng ? Number(f.lng) : null,       // Longitude or null if not provided.
      });


      // STEP 2: Create the initial room associated with the property.
      // houseId links this room to the property created in STEP 1.
      await createRoom(houseId, {
        roomNumber: f.roomNumber || "Room 1",    // Room name or default room name.
        monthlyRate: Number(f.rate),             // Monthly rental rate in pesos.
        securityDeposit: Number(f.deposit) || 0, // Deposit amount, defaulting to zero.
        capacity: Number(f.capacity) || 1,       // Room capacity, defaulting to one.
        amenities,                              // Array of selected room amenities.
      });


      // STEP 3: Notify the parent component that the listing
      // has been created successfully.
      // The optional chaining operator prevents errors
      // if the parent did not provide this callback.
      onCreated?.();


      // STEP 4: Close the Add Listing modal after successful saving.
      onClose();


    } catch (err) {

      // Display the error message if property or room creation fails.
      setError(err.message);


    } finally {

      // Reset the loading state whether the submission succeeds or fails.
      // This allows the form to become usable again.
      setBusy(false);
    }
  }


  // Render the Add Listing modal interface.
  return (

    // Full-screen modal overlay.
    // fixed and inset-0 cover the screen.
    // z-[1000] places the modal above other interface elements.
    // The semi-transparent background separates the modal from the page.
    <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4 overflow-y-auto">


      // Main form container.
      // onSubmit connects the form submission to the submit() function.
      // max-w-xl limits the form width.
      // max-h-[90vh] and overflow-y-auto allow scrolling when necessary.
      <form
        onSubmit={submit}
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto"
      >


        {/* Modal heading and close button. */}
        <div className="flex items-center justify-between">

          {/* Title displayed at the top of the modal. */}
          <h2 className="font-display text-xl font-semibold">
            Add Listing
          </h2>

          {/* Close the modal without submitting the form. */}
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted-foreground)] text-xl leading-none"
          >
            ×
          </button>
        </div>


        {/* PROPERTY INFORMATION */}

        {/* Input field for the rental property's name. */}
        <input
          className={input}
          placeholder="Property name"
          value={f.title}
          onChange={set("title")}
        />

        {/* Input field for the property's complete address. */}
        <input
          className={input}
          placeholder="Address"
          value={f.address}
          onChange={set("address")}
        />

        {/* Text area for the property description. */}
        <textarea
          className={input}
          rows={3}
          placeholder="Description"
          value={f.description}
          onChange={set("description")}
        />


        {/* PROPERTY LOCATION COORDINATES */}

        {/* Two-column layout for latitude and longitude inputs. */}
        <div className="grid grid-cols-2 gap-2">

          {/* Latitude identifies the property's north-south position. */}
          <input
            className={input}
            placeholder="Latitude (e.g. 7.0742)"
            value={f.lat}
            onChange={set("lat")}
          />

          {/* Longitude identifies the property's east-west position. */}
          <input
            className={input}
            placeholder="Longitude (e.g. 125.6118)"
            value={f.lng}
            onChange={set("lng")}
          />
        </div>


        {/* MAP PREVIEW */}

        {/* Display the Leaflet map inside the Add Listing modal.
            pin supplies the new property's marker.
            campus and gates provide geographical reference information.
            activeId identifies the new property as the active marker. */}
        <div className="h-48 rounded-xl overflow-hidden border border-[var(--border)] relative">
          <LeafletMap
            properties={pin}
            campus={campus}
            gates={gates}
            activeId="new"
          />
        </div>


        {/* Instructions for obtaining property coordinates from OpenStreetMap. */}
        <p className="text-xs text-[var(--muted-foreground)]">
          Right-click a spot on openstreetmap.org → "Show address" to copy coordinates. The pin previews here.
        </p>


        {/* ROOM INFORMATION AND RENTAL PRICES */}

        {/* Two-column layout for room and rental information. */}
        <div className="grid grid-cols-2 gap-2">

          {/* Input for the room name or room number. */}
          <input
            className={input}
            placeholder="Room name/number"
            value={f.roomNumber}
            onChange={set("roomNumber")}
          />

          {/* Input for the maximum number of occupants allowed. */}
          <input
            className={input}
            type="number"
            min="1"
            placeholder="Capacity"
            value={f.capacity}
            onChange={set("capacity")}
          />

          {/* Input for the monthly rental price in Philippine pesos. */}
          <input
            className={input}
            type="number"
            min="0"
            placeholder="Monthly rate ₱"
            value={f.rate}
            onChange={set("rate")}
          />

          {/* Input for the required security deposit in Philippine pesos. */}
          <input
            className={input}
            type="number"
            min="0"
            placeholder="Security deposit ₱"
            value={f.deposit}
            onChange={set("deposit")}
          />
        </div>


        {/* AMENITY SELECTION */}

        {/* Generate an amenity selection button for every available amenity.
            AMENITY_ENUM supplies the values.
            AMENITY_LABELS supplies the readable button labels. */}
        <div className="flex flex-wrap gap-2">
          {AMENITY_ENUM.map((a) => (
            <button
              type="button"
              key={a}

              // Add or remove the amenity when clicked.
              onClick={() => toggle(a)}

              // Change the button's appearance depending on selection status.
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                amenities.includes(a)
                  ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                  : "bg-[var(--muted)] border-[var(--border)]"
              }`}
            >

              {/* Display the user-friendly amenity name. */}
              {AMENITY_LABELS[a]}
            </button>
          ))}
        </div>


        {/* ERROR MESSAGE */}

        {/* Display an error only when an error message exists. */}
        {error && (
          <p className="text-xs text-red-600">
            {error}
          </p>
        )}


        {/* LISTING VERIFICATION NOTICE */}

        {/* Inform the landlord that new properties require
            administrator verification before publication. */}
        <p className="text-xs text-[var(--muted-foreground)]">
          New listings start as Pending until an admin verifies and publishes them.
        </p>


        {/* FORM SUBMISSION BUTTON */}

        {/* Disable the button while the form is being submitted.
            Display "Saving..." during submission.
            Otherwise, display "Submit for review". */}
        <button
          disabled={busy}
          className="w-full py-3 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm disabled:opacity-60"
        >
          {busy ? "Saving…" : "Submit for review"}
        </button>


      </form>
    </div>
  );
}
