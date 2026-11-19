
"use client";

// Import React's useState Hook to manage changing form data,
// selected amenities, error messages, and submission status.
import { useEffect, useRef, useState } from "react";

// Import API functions from api.js.
// createHouse() creates a new property in the Supabase database.
// createRooms() creates rooms connected to the newly created property.
import { createHouse, createRooms, uploadPublicImages } from "../lib/api.js";

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

function createRoomDraft(id, roomNumber = `Room ${id}`) {
  return {
    id,
    roomNumber,
    capacity: "1",
    rate: "",
    deposit: "",
    amenities: [],
    photoFiles: [],
  };
}

function RoomEditor({ room, index, canRemove, onUpdate, onRemove, onChoosePhotos }) {
  const [photoPreviews, setPhotoPreviews] = useState([]);

  useEffect(() => {
    const previews = room.photoFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotoPreviews(previews);
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [room.photoFiles]);

  const setField = (field) => (event) => onUpdate(room.id, field, event.target.value);

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Room {index + 1}</h3>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(room.id)}
            className="text-xs font-medium text-red-600 hover:underline"
            aria-label={`Remove ${room.roomNumber}`}
          >
            Remove room
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          className={input}
          placeholder="Room name/number"
          value={room.roomNumber}
          onChange={setField("roomNumber")}
        />
        <input
          className={input}
          type="number"
          min="1"
          placeholder="Capacity"
          value={room.capacity}
          onChange={setField("capacity")}
        />
        <input
          className={input}
          type="number"
          min="0"
          placeholder="Monthly rate ₱"
          value={room.rate}
          onChange={setField("rate")}
        />
        <input
          className={input}
          type="number"
          min="0"
          placeholder="Security deposit ₱"
          value={room.deposit}
          onChange={setField("deposit")}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold">
          Room photos <span className="font-normal text-[var(--muted-foreground)]">(optional · up to 8)</span>
        </label>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => onChoosePhotos(event, room.id)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          JPG, PNG, or WebP · maximum 8 MB each.
        </p>
        {photoPreviews.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photoPreviews.map(({ file, url }, photoIndex) => (
              <div key={`${file.name}-${photoIndex}`} className="relative overflow-hidden rounded-lg border border-[var(--border)]">
                <img src={url} alt={file.name} className="h-24 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onUpdate(room.id, "photoFiles", room.photoFiles.filter((_, i) => i !== photoIndex))}
                  aria-label={`Remove ${file.name}`}
                  className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Room amenities</p>
        <div className="flex flex-wrap gap-2">
          {AMENITY_ENUM.map((amenity) => (
            <button
              type="button"
              key={amenity}
              onClick={() => onUpdate(
                room.id,
                "amenities",
                room.amenities.includes(amenity)
                  ? room.amenities.filter((item) => item !== amenity)
                  : [...room.amenities, amenity],
              )}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                room.amenities.includes(amenity)
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-[var(--muted)]"
              }`}
            >
              {AMENITY_LABELS[amenity]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}


// Main AddListingModal component.
// onClose closes the modal.
// onCreated notifies the parent component that a listing was created.
export default function AddListingModal({ onClose, onCreated }) {

  // Retrieve shared campus and campus gate information
  // from UniRent's DataContext for the map preview.
  const { campus, gates } = useData();


  // Store property information entered by the landlord.
  // These are the initial values before the landlord fills out the form.
  const [f, setF] = useState({
    title: "",             // Name of the rental property.
    address: "",           // Complete property address.
    description: "",       // Description of the property.
    lat: "",               // Latitude selected from the map.
    lng: "",               // Longitude selected from the map.
    genderPolicy: "Any"
  });
  const [rooms, setRooms] = useState([createRoomDraft(1)]);
  const nextRoomId = useRef(2);


  const [propertyPhotoFiles, setPropertyPhotoFiles] = useState([]);
  const [propertyPhotoPreviews, setPropertyPhotoPreviews] = useState([]);


  // Store error messages that may occur during validation
  // or when saving property and room information to Supabase.
  const [error, setError] = useState("");


  // Track whether the form is currently being submitted.
  // This helps prevent repeated submissions while saving.
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const previews = propertyPhotoFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPropertyPhotoPreviews(previews);
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [propertyPhotoFiles]);

  function choosePhotos(event, setFiles) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length > 8) return setError("Choose no more than 8 photos per section.");
    const invalidFile = files.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024);
    if (invalidFile) return setError(`${invalidFile.name} must be a JPG, PNG, or WebP image no larger than 8 MB.`);
    setError("");
    setFiles(files);
  }


  // Reusable function for updating individual form fields.
  // The parameter k identifies which field should be updated.
  const set = (k) => (e) =>
    setF((p) => ({
      ...p,                 // Preserve all previously entered form values.
      [k]: e.target.value   // Update only the field identified by k.
    }));

  function updateRoom(roomId, field, value) {
    setRooms((current) => current.map((room) =>
      room.id === roomId ? { ...room, [field]: value } : room
    ));
  }

  function addRoom() {
    const id = nextRoomId.current++;
    setRooms((current) => [...current, createRoomDraft(id, `Room ${current.length + 1}`)]);
  }

  function removeRoom(roomId) {
    setRooms((current) => current.filter((room) => room.id !== roomId));
  }

  function chooseRoomPhotos(event, roomId) {
    choosePhotos(event, (files) => updateRoom(roomId, "photoFiles", files));
  }


  // Prepare the property marker used by LeafletMap.
  // Only create a marker when both latitude and longitude are provided.
  const pin = f.lat && f.lng
    ? [{
        id: "new",                                  // Identifier for the new property marker.
        title: f.title || "New listing",            // Use the property name or a default title.
        lat: Number(f.lat),                         // Convert latitude from string to number.
        lng: Number(f.lng),                         // Convert longitude from string to number.
        monthlyRent: Number(rooms[0]?.rate) || 0,     // Convert the first room's rate into a number.
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
    if (!f.title.trim() || !f.address.trim())
      return setError("Property name and address are required.");
    if (f.lat === "" || f.lng === "")
      return setError("Click the map to pin the boarding-house location.");
    if (rooms.length === 0)
      return setError("Add at least one room to this listing.");
    const invalidRoom = rooms.some((room) =>
      !room.roomNumber.trim()
      || room.rate === ""
      || !Number.isFinite(Number(room.rate))
      || Number(room.rate) < 0
      || !Number.isInteger(Number(room.capacity))
      || Number(room.capacity) < 1
      || (room.deposit !== "" && (!Number.isFinite(Number(room.deposit)) || Number(room.deposit) < 0))
    );
    if (invalidRoom)
      return setError("Enter a room name, valid monthly rate, and capacity of at least one for every room.");


    // Indicate that the form is currently being submitted.
    setBusy(true);

    // Clear any previous error message before starting.
    setError("");


    // try handles the database operations.
    // catch handles errors if any operation fails.
    try {
      const roomPhotoFiles = rooms.flatMap((room) => room.photoFiles);
      const uploadedImages = await uploadPublicImages([...propertyPhotoFiles, ...roomPhotoFiles], "listings");
      const propertyImages = uploadedImages.slice(0, propertyPhotoFiles.length);
      let roomPhotoOffset = propertyPhotoFiles.length;
      const roomsToCreate = rooms.map((room) => {
        const images = uploadedImages.slice(roomPhotoOffset, roomPhotoOffset + room.photoFiles.length);
        roomPhotoOffset += room.photoFiles.length;
        return {
          roomNumber: room.roomNumber.trim(),
          monthlyRate: Number(room.rate),
          securityDeposit: Number(room.deposit) || 0,
          capacity: Number(room.capacity),
          amenities: room.amenities,
          images,
        };
      });

      // STEP 1: Create the main property record in Supabase.
      // createHouse() receives the landlord's property information.
      // await waits until the property has been successfully created.
      const houseId = await createHouse({
        title: f.title,                         // Property name.
        address: f.address,                     // Property address.
        description: f.description,             // Property description.
        lat: f.lat ? Number(f.lat) : null,       // Latitude or null if not provided.
        lng: f.lng ? Number(f.lng) : null,
        genderPolicy: f.genderPolicy,
        images: propertyImages,       // Longitude or null if not provided.
      });


      // STEP 2: Create all rooms associated with the property.
      await createRooms(houseId, roomsToCreate);


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

        <div>
          <label htmlFor="gender-policy" className="mb-1.5 block text-sm font-semibold">Boarding-house gender policy</label>
          <select
            id="gender-policy"
            className={input}
            value={f.genderPolicy}
            onChange={set("genderPolicy")}
          >
            <option value="Any">Open to all genders</option>
            <option value="Female">Female only</option>
            <option value="Male">Male only</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold">Property photos <span className="font-normal text-[var(--muted-foreground)]">(optional · up to 8)</span></label>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhotos(event, setPropertyPhotoFiles)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">JPG, PNG, or WebP · maximum 8 MB each. Photos are uploaded to UniRent storage.</p>
          {propertyPhotoPreviews.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {propertyPhotoPreviews.map(({ file, url }, index) => (
                <div key={`${file.name}-${index}`} className="relative overflow-hidden rounded-lg border border-[var(--border)]">
                  <img src={url} alt={file.name} className="h-24 w-full object-cover" />
                  <button type="button" onClick={() => setPropertyPhotoFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>


        <div>
          <label className="mb-1.5 block text-sm font-semibold">Boarding-house location</label>
          <p className="mb-2 text-xs text-[var(--muted-foreground)]">Click the map to place the pin. Click again to move it.</p>
          <div className="h-64 rounded-xl overflow-hidden border border-[var(--border)] relative">
            <LeafletMap
              properties={pin}
              campus={campus}
              gates={gates}
              activeId="new"
              onLocationSelect={(lat, lng) => {
                setF((previous) => ({
                  ...previous,
                  lat: String(lat),
                  lng: String(lng),
                }));
              }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]" aria-live="polite">
            {f.lat !== "" && f.lng !== "" ? "Location pin selected." : "No location selected yet."}
          </p>
        </div>


        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Rooms</h3>
              <p className="text-xs text-[var(--muted-foreground)]">Add each room with its own price, capacity, photos, and amenities.</p>
            </div>
            <button
              type="button"
              onClick={addRoom}
              disabled={busy}
              className="shrink-0 rounded-xl border border-[var(--primary)] px-3 py-2 text-xs font-semibold text-[var(--primary)] disabled:opacity-50"
            >
              + Add room
            </button>
          </div>
          {rooms.map((room, index) => (
            <RoomEditor
              key={room.id}
              room={room}
              index={index}
              canRemove={rooms.length > 1 && !busy}
              onUpdate={updateRoom}
              onRemove={removeRoom}
              onChoosePhotos={chooseRoomPhotos}
            />
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
