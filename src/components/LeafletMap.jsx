
"use client";

// Import React hooks:
// useEffect runs code after the component renders.
// useRef stores values or references without causing re-renders.
import { useEffect, useRef } from "react";

// Import Leaflet's CSS so the map, markers, popups, and controls display correctly.
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

// Choose a marker color based on the property's safety score.
// 8.5 and above = green (higher safety score).
// 7 and above = orange (moderate safety score).
// Below 7 = red (lower safety score).
const safetyColor = (s) => (s >= 8.5 ? "#10b981" : s >= 7 ? "#f59e0b" : "#ef4444");
const ADDU_CAMPUS_PIN = { lat: 7.07218, lng: 125.61340 };

// Escape special HTML characters to prevent unsafe text from being inserted into
// the HTML used by Leaflet popups, tooltips, and custom markers.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

/**
 * Leaflet map of properties + campus gates.
 *
 * This component displays:
 * - The ADDU campus location.
 * - Campus gates around the campus.
 * - Rental properties with their monthly rental prices.
 * - A circle showing the search/walking radius around campus.
 * - Popups that allow users to view property details.
 *
 * PROPS:
 * properties      - Array containing rental property information.
 * gates           - Array containing campus gate coordinates and names.
 * campus          - Optional campus coordinate object; defaults to ADDU Jacinto.
 * radiusMeters    - Radius of the circle around campus, in meters.
 * routeCoordinates - Optional [[startLat, startLng], [endLat, endLng]] route.
 * activeId        - ID of the currently selected property.
 * onSelect(id)    - Callback called when a property marker is clicked.
 * onViewDetails(id) - Callback called when the popup's View Details button is clicked.
 * onLocationSelect(lat, lng) - Callback called when the map is clicked to select a location.
 * fitRadius       - Fits the map to the radius around campus when the radius changes.
 * scrollWheelZoom - Enables mouse-wheel zooming; "center" keeps zoom centered on the map.
 * singleZoom      - Fixed zoom level used on a property detail page.
 * className       - Additional CSS classes for the map container.
 */
export default function LeafletMap({
  properties = [],
  gates = [],
  campus = null,
  routeCoordinates = null,
  radiusMeters = 800,
  activeId = null,
  onSelect,
  onViewDetails,
  onLocationSelect,
  fitRadius = false,
  scrollWheelZoom = true,
  singleZoom = null, // When set, zoom to the selected property at this fixed zoom level.
  className = "",
}) {

  // Reference to the HTML div where the Leaflet map will be displayed.
  const elRef = useRef(null);

  // Stores the actual Leaflet map instance after it has been created.
  const mapRef = useRef(null);

  // Stores the Leaflet layer group containing the map's markers and circles.
  const layerRef = useRef(null);
  const routingControlRef = useRef(null);
  const routingCoordinatesKeyRef = useRef("");
  const radiusFitRef = useRef({ enabled: false, radius: null });
  const hasInitialFitRef = useRef(false);

  // Stores the Leaflet library after it has been imported.
  const LRef = useRef(null);

  // Stores the latest callback functions passed through the component props.
  // This allows Leaflet event handlers to access updated callbacks without
  // needing to recreate the entire map.
  const cbRef = useRef({});
  cbRef.current = { onSelect, onViewDetails, onLocationSelect };

  const campusLat = campus?.lat != null && Number.isFinite(Number(campus.lat))
    ? Number(campus.lat)
    : ADDU_CAMPUS_PIN.lat;
  const campusLng = campus?.lng != null && Number.isFinite(Number(campus.lng))
    ? Number(campus.lng)
    : ADDU_CAMPUS_PIN.lng;

  // CREATE THE MAP
  // This effect runs once when the component is first mounted.
  useEffect(() => {

    // This flag prevents the map from being created if the component
    // is removed before Leaflet finishes loading.
    let cancelled = false;

    // Use an asynchronous function because Leaflet is imported dynamically.
    (async () => {

      // Dynamically import Leaflet on the client side.
      // This is necessary because Leaflet accesses the browser's window object,
      // which is not available during server-side rendering.
      const L = (await import("leaflet")).default;
      await import("leaflet-routing-machine");

      // Stop if:
      // 1. The component has already been unmounted.
      // 2. The map's HTML container does not exist.
      // 3. A map instance has already been created.
      if (cancelled || !elRef.current || mapRef.current) return;

      // Save the Leaflet library so other functions can use it.
      LRef.current = L;

      // Create the map inside the referenced HTML div.
      // setView() sets the initial center coordinates and zoom level.
      const map = L.map(elRef.current, {
        zoomControl: true,
        scrollWheelZoom
      }).setView([campusLat, campusLng], 16);

      // Add OpenStreetMap tiles as the map's background.
      // The {s}, {z}, {x}, and {y} values are automatically replaced
      // by Leaflet when requesting the correct map tiles.
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,

        // Required attribution to OpenStreetMap contributors.
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Create a layer group.
      // All property markers, campus markers, gate markers, and circles
      // will be placed inside this group.
      layerRef.current = L.layerGroup().addTo(map);

      // Save the map instance so other functions and effects can access it.
      mapRef.current = map;

      if (onLocationSelect) {
        map.on("click", (event) => {
          cbRef.current.onLocationSelect?.(event.latlng.lat, event.latlng.lng);
        });
      }

      // Listen for the event that occurs when a map popup opens.
      map.on("popupopen", (e) => {

        // Find the View Details button inside the opened popup.
        // The data-view attribute contains the property's ID.
        const btn = e.popup.getElement()?.querySelector("[data-view]");

        // If the button exists, assign a click handler.
        // When clicked, call the latest onViewDetails callback
        // and pass the property's ID.
        if (btn) btn.onclick = () =>
          cbRef.current.onViewDetails?.(btn.getAttribute("data-view"));
      });

      // Leaflet sometimes calculates the map dimensions before its container
      // has finished resizing. invalidateSize() makes Leaflet recalculate them.
      // The short delay gives the page layout time to settle.
      setTimeout(() => map.invalidateSize(), 50);

      // Fire a custom event indicating that the UniRent map is ready.
      map.fire("unirent:ready");

      // Draw the campus, gates, properties, and walking-radius circle.
      draw();
    })();

    // CLEANUP FUNCTION
    // Runs when the component is removed from the page.
    return () => {

      // Mark the initialization process as cancelled.
      cancelled = true;

      // Remove the Leaflet map and its event listeners.
      // This prevents duplicate maps and memory leaks.
      if (routingControlRef.current && mapRef.current) {
        mapRef.current.removeControl(routingControlRef.current);
      }
      routingControlRef.current = null;
      routingCoordinatesKeyRef.current = "";
      mapRef.current?.remove();

      // Clear the stored map reference.
      mapRef.current = null;
    };

    // The empty dependency array means this effect runs only on mount
    // and its cleanup runs when the component unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DRAW MAP CONTENTS
  // This function creates or redraws all map markers, circles, and popups.
  function draw() {

    // Retrieve the saved Leaflet library, map instance, and marker layer.
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;

    // Stop if the map has not been initialized yet.
    if (!L || !map || !layer) return;

    // Remove all existing markers and circles from the layer.
    // They will be recreated using the latest properties and gate data.
    layer.clearLayers();

    const validRouteCoordinates =
      Array.isArray(routeCoordinates)
      && routeCoordinates.length === 2
      && routeCoordinates.every((coordinate) =>
        Array.isArray(coordinate)
        && coordinate.length === 2
        && Number.isFinite(coordinate[0])
        && Number.isFinite(coordinate[1])
        && Math.abs(coordinate[0]) <= 90
        && Math.abs(coordinate[1]) <= 180
      )
      ? routeCoordinates
      : null;
    const routeKey = validRouteCoordinates ? JSON.stringify(validRouteCoordinates) : "";

    if (routingControlRef.current && routingCoordinatesKeyRef.current !== routeKey) {
      map.removeControl(routingControlRef.current);
      routingControlRef.current = null;
      routingCoordinatesKeyRef.current = "";
    }

    if (validRouteCoordinates && !routingControlRef.current) {
      const waypoints = validRouteCoordinates.map(([lat, lng]) => L.latLng(lat, lng));
      const plan = L.Routing.plan(waypoints, {
        draggableWaypoints: true,
        addWaypoints: false,
        createMarker: (index, waypoint) => {
          const label = index === 0 ? "A" : "B";
          const color = index === 0 ? "#0B5E6F" : "#2563eb";
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);color:#fff;font:700 12px sans-serif">${label}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          return L.marker(waypoint.latLng, { draggable: true, icon });
        },
      });
      const routingControl = L.Routing.control({
        plan,
        routeWhileDragging: false,
        fitSelectedRoutes: true,
        lineOptions: {
          styles: [{ color: "#2563eb", opacity: 0.9, weight: 6 }],
        },
      }).addTo(map);

      routingControlRef.current = routingControl;
      routingCoordinatesKeyRef.current = routeKey;
    }

    // WALKING RADIUS AROUND CAMPUS
    // Draw a circle around the ADDU campus to show the selected radius.
    const radiusCircle = L.circle([campusLat, campusLng], {
      radius: radiusMeters, // Circle radius in meters.
      color: "#F4623A",     // Circle outline color.
      weight: 2,            // Outline thickness.
      dashArray: "8 4",     // Dashed outline pattern.
      fillColor: "#F4623A", // Circle interior color.
      fillOpacity: 0.07,    // Make the circle transparent.
      interactive: false,   // Prevent the circle from blocking marker clicks.
    }).addTo(layer);

    // CAMPUS MARKER
    // Create a custom circular marker representing the ADDU campus.
    const campusIcon = L.divIcon({
      className: "",

      // HTML used to design the campus marker.
      // The letter "A" represents the campus.
      html: `<div style="width:34px;height:34px;border-radius:50%;background:#0B5E6F;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px sans-serif">A</div>`,

      // Width and height of the custom marker.
      iconSize: [34, 34],

      // Position the center of the marker on the actual coordinates.
      iconAnchor: [17, 17],
    });

    // Place the campus marker on the map.
    // A higher zIndexOffset makes it appear above other markers.
    // A tooltip displays "ADDU Campus" when the user hovers over it.
    // Keep the ADDU pin at its original location, independent of gate-based routing.
    L.marker([ADDU_CAMPUS_PIN.lat, ADDU_CAMPUS_PIN.lng], {
      icon: campusIcon,
      zIndexOffset: 500
    })
      .bindTooltip("ADDU Campus", { direction: "top" })
      .addTo(layer);

    // CAMPUS GATE MARKERS
    // Loop through every gate provided through the gates prop.
    // Each gate is displayed as a small circular marker.
    gates.forEach((g) => {
      L.circleMarker([g.lat, g.lng], {
        radius: 6,
        color: "#fff",
        weight: 2,
        fillColor: "#0B5E6F",
        fillOpacity: 1
      })

        // Display the gate's name when the user hovers over its marker.
        // esc() protects the name before inserting it into the tooltip HTML.
        .bindTooltip(esc(g.name), { direction: "top" })

        // Add the gate marker to the map's layer group.
        .addTo(layer);
    });

    // PROPERTY MARKERS
    // Start the map bounds with the campus coordinates.
    // These bounds will later help Leaflet decide what area to display.
    const bounds = [[campusLat, campusLng]];

    // Loop through all rental properties passed into the component.
    properties.forEach((p) => {

      // Skip properties without latitude or longitude.
      // A property needs both coordinates to appear on the map.
      if (p.lat == null || p.lng == null) return;

      // Add the property's coordinates to the map bounds.
      bounds.push([p.lat, p.lng]);

      // Check whether this property is currently selected.
      // String() ensures IDs can be compared even if one is a number
      // and the other is a string.
      const active = String(p.id) === String(activeId);

      // Format the property's monthly rent into a shorter price label.
      // Example: 12500 becomes ₱12.5k.
      const price = `₱${(p.monthlyRent / 1000).toFixed(1)}k`;

      // Create a custom marker displaying the monthly rental price.
      const icon = L.divIcon({
        className: "",

        // The marker's background color depends on its safety score.
        // The selected property is also slightly enlarged.
        html: `<div style="background:${safetyColor(p.safetyScore)};color:#fff;font:700 12px sans-serif;padding:4px 8px;border-radius:10px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);white-space:nowrap;transform:translate(-50%,-100%) ${active ? "scale(1.15)" : ""}">${price}</div>`,

        // A zero-sized icon allows the custom HTML to control its appearance.
        iconSize: [0, 0],
      });

      // Create the property marker using its latitude and longitude.
      const m = L.marker([p.lat, p.lng], {
        icon,

        // Bring the active property's marker above the other property markers.
        zIndexOffset: active ? 1000 : 0
      }).addTo(layer);

      // PROPERTY POPUP
      // Display a popup when the user clicks the property marker.
      // It shows the property title, walking time, safety score,
      // and a View Details button.
      m.bindPopup(
        `<div style="font-family:inherit;min-width:160px">
           <div style="font-weight:600;font-size:12px;line-height:1.3;margin-bottom:4px">${esc(p.title)}</div>
           <div style="font-size:11px;color:#6b7280;margin-bottom:8px">🚶 ${esc(p.walkingMinutes)} min · Safety ${esc(Number(p.safetyScore).toFixed(1))}/10</div>
           <button data-view="${esc(p.id)}" style="width:100%;background:#0B5E6F;color:#fff;border:0;border-radius:8px;padding:6px;font-size:12px;font-weight:600;cursor:pointer">View Details</button>
         </div>`,
        {
          // Position the popup slightly above the marker.
          offset: [0, -28]
        },
      );

      // PROPERTY MARKER CLICK EVENT
      // When the marker is clicked, call the onSelect callback.
      // The property's ID is converted to a string before being passed.
      // This allows the parent component to know which property was selected.
      m.on("click", () => cbRef.current.onSelect?.(String(p.id)));
    });

    // MAP ZOOM AND POSITION
    // If singleZoom is provided and at least one property exists,
    // center the map on the first property's coordinates at that zoom level.
    if (singleZoom && bounds.length > 1) {
      map.setView(bounds[1], singleZoom);
    }

    else if (fitRadius) {
      if (!radiusFitRef.current.enabled || radiusFitRef.current.radius !== radiusMeters) {
        map.fitBounds(radiusCircle.getBounds(), {
          padding: [32, 32],
          maxZoom: 19,
        });
        radiusFitRef.current = { enabled: true, radius: radiusMeters };
      }
    }

    // Fit initial property bounds once, but preserve user positioning afterward.
    else if (bounds.length > 1 && !cbRef.current.onLocationSelect && !hasInitialFitRef.current) {
      map.fitBounds(bounds, {
        padding: [48, 48], // Add space around the outermost markers.
        maxZoom: 17        // Prevent the map from zooming in too closely.
      });
      hasInitialFitRef.current = true;
    } else if (!fitRadius) {
      radiusFitRef.current.enabled = false;
    }
  }

  // REDRAW WHEN DATA OR SELECTION CHANGES
  // This effect runs when any of these values change:
  // - properties: the rental property list.
  // - campusLat and campusLng: the campus coordinates.
  // - gates: the campus gate list.
  // - radiusMeters: the walking-radius circle size.
  // - activeId: the currently selected property.
  //
  // It calls draw() to update the map using the latest information.
  useEffect(() => {
    draw();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, campusLat, campusLng, gates, radiusMeters, activeId, fitRadius, singleZoom, routeCoordinates]);

  // MAP CONTAINER
  // This div is where Leaflet renders the interactive map.
  // elRef connects the HTML element to Leaflet.
  // w-full makes it fill the available width.
  // h-full makes it fill the available height.
  // min-h-64 ensures the map has a minimum height.
  // className allows the parent component to add extra styling.
  // zIndex: 0 keeps the map at the base stacking level.
  return (
    <div
      ref={elRef}
      className={`w-full h-full min-h-64 ${className}`}
      style={{ zIndex: 0 }}
    />
  );
}
