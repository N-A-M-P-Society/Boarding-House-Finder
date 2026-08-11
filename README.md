🏡 Boarding-House-Finder | Map-Centric University Housing Marketplace

Boarding-House-Finder is a map-centric boarding house and lodging marketplace designed specifically for university students. It helps students find safe, verified local housing near campus through walking-distance mapping, safety score breakdowns, lifestyle roommate matching, and real-time landlord communication.
✨ Features

    🗺️ Smart Mapping (Leaflet Integration): Visual map pinpoints filtered by a 10-minute (800m) walking radius to campus, featuring custom markers and route calculations.
    🛡️ Property Verification System: Verified badges (⚡ Fast Wi-Fi, 💧 24/7 Water Supply, 🛡️ Vetted Safe) awarded through administrative document proof checks.
    📊 Multi-Factor Safety Score Engine: Calculates a transparent score (0–10) based on proximity to police stations, street lighting quality, gated access, and CCTV.
    🤝 Roommate Compatibility Matching: Algorithmic matching system based on student sleep schedules, study habits, and cleanliness preferences.
    💬 Real-Time Chat & Landlord Connect: Instant messaging powered by Supabase Realtime with pre-built inquiry templates (pricing, deposits, house rules).
    📅 Room Availability Calendar: Live calendar tracking room status (available, reserved, occupied).
    ⚖️ Side-by-Side Room Comparison: Compare rent, safety scores, amenities, and verification parameters across multiple listings in a matrix table.
    ⭐ Verified Student Reviews: Ratings and written feedback submitted by verified student tenants.

🛠️ Tech Stack

    Framework: Next.js (App Router, Server Components & Server Actions)
    Styling: Tailwind CSS
    Database & Backend: Supabase
        Database: PostgreSQL with Row-Level Security (RLS)
        Realtime: WebSocket subscriptions for instant messaging
        Storage: Storage Buckets for property images and verification documents
        Auth: @supabase/ssr Authentication with Role-Based Access (Student vs. Landlord)
    Maps & Geolocation: Leaflet.js with OpenStreetMap tiles
