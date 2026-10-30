"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

const safetyColor = (s) => (s >= 8.5 ? "#10b981" : s >= 7 ? "#f59e0b" : "#ef4444");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Leaflet map of properties + campus gates.
 * props: properties, campus {lat,lng}, gates, radiusMeters, activeId, onSelect(id), onViewDetails(id), height
 */
export default function LeafletMap({
  properties = [],
  campus,
  gates = [],
  radiusMeters = 800,
  activeId = null,
  onSelect,
  onViewDetails,
  singleZoom = null, // when set, fit to the properties at this fixed zoom (detail page)
  className = "",
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const LRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { onSelect, onViewDetails };

  // Create the map once (Leaflet touches window, so import it client-side only)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([campus.lat, campus.lng], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      map.on("popupopen", (e) => {
        const btn = e.popup.getElement()?.querySelector("[data-view]");
        if (btn) btn.onclick = () => cbRef.current.onViewDetails?.(btn.getAttribute("data-view"));
      });
      // Container may have been sized by flexbox after mount
      setTimeout(() => map.invalidateSize(), 50);
      map.fire("unirent:ready");
      draw();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();

    // Walk radius around campus
    L.circle([campus.lat, campus.lng], {
      radius: radiusMeters,
      color: "#F4623A",
      weight: 2,
      dashArray: "8 4",
      fillColor: "#F4623A",
      fillOpacity: 0.07,
      interactive: false,
    }).addTo(layer);

    // Campus + gates
    const campusIcon = L.divIcon({
      className: "",
      html: `<div style="width:34px;height:34px;border-radius:50%;background:#0B5E6F;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px sans-serif">A</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    L.marker([campus.lat, campus.lng], { icon: campusIcon, zIndexOffset: 500 }).bindTooltip("ADDU Campus", { direction: "top" }).addTo(layer);
    gates.forEach((g) => {
      L.circleMarker([g.lat, g.lng], { radius: 6, color: "#fff", weight: 2, fillColor: "#0B5E6F", fillOpacity: 1 })
        .bindTooltip(esc(g.name), { direction: "top" })
        .addTo(layer);
    });

    // Property pins
    const bounds = [[campus.lat, campus.lng]];
    properties.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      bounds.push([p.lat, p.lng]);
      const active = String(p.id) === String(activeId);
      const price = `₱${(p.monthlyRent / 1000).toFixed(1)}k`;
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${safetyColor(p.safetyScore)};color:#fff;font:700 12px sans-serif;padding:4px 8px;border-radius:10px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);white-space:nowrap;transform:translate(-50%,-100%) ${active ? "scale(1.15)" : ""}">${price}</div>`,
        iconSize: [0, 0],
      });
      const m = L.marker([p.lat, p.lng], { icon, zIndexOffset: active ? 1000 : 0 }).addTo(layer);
      m.bindPopup(
        `<div style="font-family:inherit;min-width:160px">
           <div style="font-weight:600;font-size:12px;line-height:1.3;margin-bottom:4px">${esc(p.title)}</div>
           <div style="font-size:11px;color:#6b7280;margin-bottom:8px">🚶 ${esc(p.walkingMinutes)} min · ⚡ ${esc(p.safetyScore)}</div>
           <button data-view="${esc(p.id)}" style="width:100%;background:#0B5E6F;color:#fff;border:0;border-radius:8px;padding:6px;font-size:12px;font-weight:600;cursor:pointer">View Details</button>
         </div>`,
        { offset: [0, -28] },
      );
      m.on("click", () => cbRef.current.onSelect?.(String(p.id)));
    });

    if (singleZoom && bounds.length > 1) map.setView(bounds[1], singleZoom);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
  }

  // Redraw whenever data/selection changes
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, campus.lat, campus.lng, gates, radiusMeters, activeId]);

  // Pan to the active property
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeId) return;
    const p = properties.find((x) => String(x.id) === String(activeId));
    if (p?.lat != null) map.panTo([p.lat, p.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return <div ref={elRef} className={`w-full h-full min-h-64 ${className}`} style={{ zIndex: 0 }} />;
}
