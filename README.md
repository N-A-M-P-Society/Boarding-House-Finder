# 🏡 UniRent | Boarding House Finder

**A map-centric university housing marketplace for students of Ateneo de Davao University (ADDU).**

UniRent helps students find safe, verified boarding houses near campus through walking-distance mapping, transparent safety scores, and direct landlord communication. Landlords list and manage properties, and admins verify listings and keep the platform trustworthy.

---

## 📖 Why UniRent?

Finding off-campus housing is stressful: listings are scattered across social media, there is no way to check whether a place is really safe, and scams are common. UniRent addresses this by:

- **Showing distance that matters** – every listing is placed on a map with its real walking time to campus.
- **Making safety measurable** – a 0–10 safety score built from police proximity, street lighting, gated access, and CCTV, all checked by an admin inspection.
- **Verifying landlords and listings** – nothing is public until an admin approves it, and every admin action is written to an audit log.
- **Keeping everything in one place** – browse, compare, book, and chat without leaving the app.

---

## ✨ Features

| Feature | Status |
|---|---|
| 🗺️ **Leaflet map** with OpenStreetMap tiles, safety-colored price pins, campus + gate markers, and an 800 m (≈10 min) walk radius | ✅ Live |
| 🛡️ **Property verification** – admins approve/reject listings and landlord documents; badges (WiFi, Water 24/7, Vetted Safe) are granted by admins | ✅ Live |
| 📊 **Safety score engine (0–10)** – weighted from police distance, lighting, gated access, CCTV; weights editable by SuperAdmin | ✅ Live |
| 💬 **Real-time chat** between students and landlords (Supabase Realtime) with quick-reply templates | ✅ Live |
| 📅 **Bookings** – students request, landlords confirm/decline; the database blocks overlapping bookings | ✅ Live |
| ❤️ **Saved listings** and roommate-preference quiz (stored on the student profile) | ✅ Live |
| ⭐ **Verified student reviews** – only students with a confirmed/completed booking can review; admins can hide abusive reviews | ✅ Live |
| 🧾 **Admin audit log** of every moderation action | ✅ Live |
| ⚖️ **Side-by-side comparison** of up to 4 listings | ✅ Live (kept in memory per session) |
| 🤝 **Roommate matching, requests & vouching** | 🧪 UI prototype (demo data, no table yet) |
| 📆 **Room availability calendar** | 🧪 UI prototype (demo data) |
| 📎 **Document & photo uploads** (Supabase Storage) | 🚧 Not wired yet – only file names are stored |

---

## 🛠️ Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 15 (App Router) with React 19. The app is a client-side single-page shell mounted from `src/app/page.jsx`.
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) v4
- **Backend:** [Supabase](https://supabase.com/)
  - **Database:** PostgreSQL with Row-Level Security (RLS) and triggers for business rules
  - **Auth:** Supabase Auth (email/password) with roles `Student`, `Landlord`, `Admin`, `SuperAdmin`
  - **Realtime:** WebSocket subscription on the `messages` table
- **Maps:** [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles (no API key needed)

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18.18 or higher
- [Git](https://git-scm.com/)
- A free [Supabase](https://supabase.com/) project

### 2. Clone and install

```bash
git clone https://github.com/your-username/unirent.git
cd unirent
npm install        # or: yarn install / pnpm install
```

### 3. Set up the database

Open your Supabase project → **SQL Editor** and run these two files **in order**:

1. `supabase_schema.sql` – creates all tables, enums, triggers, helper functions and RLS policies.
   > ⚠️ This script **deletes existing data** (including `auth.users`). Use a development project only.
2. `supabase_additions.sql` – adds the pieces the app needs on top of the schema:
   - `landlord_public` and `message_peers` views (so students can see landlord names without exposing private documents)
   - a read policy so safety breakdowns of published houses are public
   - an optional `image_urls` column for photos
   - a starter ADDU campus gate (**replace with your real gate coordinates**)
   - Realtime enabled for `messages`

### 4. Configure environment variables

Copy the example file and fill in your values (Supabase → Project Settings → API):

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

### 5. Auth settings (development)

In Supabase → **Authentication → Providers → Email**, turn off **Confirm email** while developing. Otherwise new users must confirm their email before they can sign in.

### 6. Create an admin account

Admins cannot self-register. Create one in the SQL Editor:

```sql
select create_staff_user('admin@unirents.ph', 'StrongPass123', 'Admin Rey', 'Admin');
-- Use 'SuperAdmin' as the last argument for someone who can edit safety weights and campus gates.
```

### 7. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For a production build: `npm run build && npm start`.

---

## 👥 Roles

| Role | How they sign up | What they can do |
|---|---|---|
| **Student** | Self-register with an `@addu.edu.ph` email | Browse the map, save and compare listings, request bookings, chat, review stayed-at houses |
| **Landlord** | Self-register with any email | Add listings and rooms (start as *Pending*), confirm/decline bookings, chat |
| **Admin** | Created via `create_staff_user` | Approve/reject/suspend listings, verify landlords, moderate reviews, grant badges, record safety inspections, read the audit log |
| **SuperAdmin** | Created via `create_staff_user` | Everything an Admin can do, plus edit safety-score weights and campus gates |

Security is enforced in the database through RLS and triggers (`supabase_schema.sql`), not just in the UI.

---

## 🗺️ How the map and safety score work

- **Walking distance:** each property's coordinates are compared with the nearest row in `campus_gates` (haversine distance ÷ 80 m/min).
- **Map:** `src/components/LeafletMap.jsx` draws the pins, gates, walk radius and popups. Pin color reflects the safety score (green ≥ 8.5, amber ≥ 7, red below).
- **Safety score:** an admin records an inspection (police distance, lighting 1–5, gated access, CCTV active/required). Each factor is converted to 0–10 and combined using the weights in `system_settings` (default 25% each).

---

## 📁 Project Structure

```
src/
├── app/            Next.js layout, global styles, entry page
├── App.jsx         App shell: session, navigation, theme
├── components/     Nav, PropertyCard, LeafletMap, AddListingModal
├── context/        DataContext (loads gates + properties)
├── lib/
│   ├── supabase.js Supabase client
│   ├── api.js      All database/auth calls
│   ├── mappers.js  DB rows → UI objects
│   └── geo.js      Distance helpers
└── views/          Landing, Listings, PropertyDetail, dashboards, Admin, Chat, Comparison
supabase_schema.sql       Original database script
supabase_additions.sql    Required add-ons (run second)
```

---

## 🧯 Troubleshooting

- **"Supabase is not configured"** – check `.env.local` and restart `npm run dev`.
- **No listings appear** – only listings with status *Published* are public. Sign in as an admin and approve pending ones.
- **Map pins missing** – the property needs `latitude` and `longitude`. Add them in the Add Listing form.
- **Can't sign in after sign-up** – email confirmation is on; turn it off (step 5) or confirm via email.
- **Student sign-up rejected** – students must use an `@addu.edu.ph` email.
- **Chat doesn't update live** – make sure `supabase_additions.sql` ran (it enables Realtime on `messages`).

---

## 🗓️ Roadmap

- Supabase Storage for property photos and verification documents
- Database tables for roommate requests, matching and vouching
- Booking-driven availability calendar
- Persisted room comparisons

---