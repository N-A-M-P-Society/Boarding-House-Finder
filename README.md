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
| 📊 **Safety score engine (0–10)** – weighted from police distance, lighting, gated access, and CCTV; non-gated listings receive partial credit, non-required CCTV is neutral, and admins can recalculate scores from the latest inspection | ✅ Live |
| 💬 **Real-time chat** between students and landlords or roommate-request students, with unread counts that clear when a conversation is opened | ✅ Live |
| 🔔 **Landlord inbox** for durable document approval/rejection notices, with unread counts and read status | ✅ Live |
| 📅 **Open-ended monthly stays** – move-in-only booking, monthly renewals, student move-out confirmation, and database-backed room release | ✅ Live |
| 🧭 **Landlord calendar** – filter by property and room; click bookings to see the student and booking dates | ✅ Live |
| 💸 **Manual payments** – students submit monthly rent or security-deposit details with private proof; landlords accept or reject with a reason | ✅ Live (no online payment gateway) |
| ❤️ **Saved listings** and roommate-preference quiz (stored on the student profile) | ✅ Live |
| ⭐ **Verified student reviews** – only students with a confirmed/completed booking can review; admins can hide abusive reviews | ✅ Live |
| 🧾 **Admin audit log** of every moderation action | ✅ Live |
| ⚖️ **Side-by-side comparison** of up to 4 listings | ✅ Live (kept in memory per session) |
| 🖼️ **Listing and room photos** open in a keyboard-navigable lightbox; arrow keys are scoped to property views and the lightbox | ✅ Live |
| 📎 **Landlord verification documents** (private Supabase Storage) | ✅ Live |
| 🤝 **Quiz-based roommate matching** with same-gender candidates selected by the student | ✅ Live |
| 🏠 **Female-only and male-only boarding-house filters** with map-pin listing locations | ✅ Live |

---

## 🛠️ Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 16 (App Router) with React 19. The app is a client-side single-page shell mounted from `src/app/page.jsx`, with an async server-rendered public feed at `/boarding-houses`.
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) v4
- **Backend:** [Supabase](https://supabase.com/)
  - **Database:** PostgreSQL with Row-Level Security (RLS) and triggers for business rules
  - **Auth:** Supabase Auth (email/password) with roles `Student`, `Landlord`, `Admin`, `SuperAdmin`
  - **Realtime:** WebSocket subscriptions on `messages`, `boarding_houses`, and user-scoped `notifications`
- **Maps:** [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles (no API key needed)
- **Edge Functions:** Deno/TypeScript (`notify-payment-verification` triggered by `public.payments` table updates)

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

For a **new development project**, open Supabase → **SQL Editor** and run these files in order:

1. `supabase_schema.sql` – creates all tables, enums, triggers, helper functions and RLS policies.
   > ⚠️ This script **deletes existing data** (including `auth.users`). Use a development project only.
2. `supabase_additions.sql` – adds the pieces the app needs on top of the schema:
   - student profile gender and 12-digit ID validation (cleans old IDs and clears duplicates)
   - restricts landlords to seeing their own listings; students and guests still see published listings
   - `landlord_public` and `message_peers` views (so students can see landlord names without exposing private documents)
   - a read policy so safety breakdowns of published houses are public
   - female-only/male-only boarding-house policies and matching browse filters
   - Supabase Storage buckets and policies for public photos and private verification documents
   - booking vacancy dates and a privacy-safe RPC for published room availability
   - monthly stay renewal/move-out RPCs, open-ended room reservation checks, and availability release
   - compatibility-quiz roommate matching with same-gender rules, landlord nominations, and student choice
   - shared-booking invitations for matched roommates, next-cycle requests to join a room with one resident, deposit credits, split billing invoices, and balance-limited partial payment RPCs
   - payment rejection reasons, student/landlord payment policies, private receipt access, and Realtime payment updates
   - persistent landlord verification notifications with per-account inbox access and Realtime updates
   - a starter ADDU campus gate (**replace with your real gate coordinates**)
   - Realtime enabled for `messages`, `boarding_houses`, `payments`, `bookings`, and `notifications` so conversations, listing scores, payments, bookings, and inbox notices update live

For an **existing project**, do not rerun the destructive schema script; run the updated `supabase_additions.sql` only.

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

In Supabase → **Authentication → Providers → Email**, turn off **Confirm email** while developing. Otherwise new users must confirm their email before they can sign in. Add the app's local and deployed origins to **Authentication → URL Configuration → Redirect URLs** so password recovery links can return to UniRent.

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
| **Student** | Self-register with an `@addu.edu.ph` email | Browse the map, save and compare listings, request bookings, submit payment proof for confirmed bookings, chat, review stayed-at houses |
| **Landlord** | Self-register with any email | Add listings with multiple rooms, add rooms later, and edit room details from **My Listings → Review**; confirm/decline bookings, review and accept/reject submitted payments, chat |
| **Admin** | Created via `create_staff_user` | Approve/reject/suspend listings, verify landlords, moderate reviews, grant badges, record safety inspections, read the audit log |
| **SuperAdmin** | Created via `create_staff_user` | Everything an Admin can do, plus edit safety-score weights and campus gates |

Security is enforced in the database through RLS and triggers (`supabase_schema.sql`), not just in the UI.

---

## 🗺️ How the map and safety score work

- **Walking distance:** each property's coordinates are compared with the nearest row in `campus_gates` (haversine distance ÷ 80 m/min).
- **Map:** `src/components/LeafletMap.jsx` draws the pins, gates, walk radius and popups. Pin color reflects the safety score (green ≥ 8.5, amber ≥ 7, red below).
- **Listing location:** Landlords click the map when adding a boarding house to place or move its location pin; manually entering coordinates is not required.
- **Safety score:** an admin records an inspection (police distance, lighting 1–5, gated access, CCTV active/required). Police proximity scores 10 nearby and bottoms out at 2 from 2 km; lighting is converted from 1–5 to 2–10; no gate receives 4/10; CCTV coverage is 0–10 when cameras are required and neutral 5/10 when they are not. The factors are combined using the saved weights in `system_settings` (default 25% each).
- **Recalculating scores:** new inspections use the current formula and weights. Existing scores are stored values; an admin can recalculate each listing from its latest inspection in **Admin Console → Safety Inspection**. Once `supabase_additions.sql` enables Realtime on `boarding_houses`, open student pages refresh when a score changes.

## 📅 How room bookings work

- Students select a room and one move-in date. A pending request covers the first monthly cycle and must be confirmed by the landlord before payment is available.
- A student with a selected compatibility match can invite that student to share a room with capacity for at least two people. The matched student must accept before the landlord can confirm the shared booking.
- Confirmed shared bookings split monthly rent and security deposit evenly between the two students; solo bookings remain charged at the full room rate.
- A confirmed booking represents an open-ended stay. Its billing-cycle end is extended monthly; renewal is offered during the final seven days. The database prevents another booking from being confirmed after the open-ended stay starts.
- Students can confirm move-out from the renewal prompt or booking details. The completed stay releases the room; landlords can also record a move-out date.
- Public calendars show availability without tenant names and keep confirmed open-ended stays marked occupied until move-out.

## 💸 How manual payments work

- Confirmed bookings create per-student rent and security-deposit balances. Shared bookings use the even split; solo bookings use the full room amount.
- Students choose an outstanding invoice; the form fills the remaining balance automatically and allows partial payments. Submitted payments awaiting review count against the available balance, and rejected payments return to it.
- Students submit a payment method and receipt/proof file (JPG, PNG, WebP, or PDF; up to 10 MB). Renewing a stay creates the next monthly rent balance.
- Proof files are stored in the private `unirent-verification` bucket. The related student and property landlord receive short-lived signed links to view the proof.
- Landlords open **Review** in **Dashboard → Payments** to accept or reject a submission; a rejection reason is requested only when rejecting. The student's payment status updates in real time.
- This is a manual proof-and-review workflow; no online payment gateway is connected.

## 🤝 Roommate board

- Students can submit a roommate request before booking any property, using the four saved compatibility-quiz habits; the quiz must be complete first.
- Landlords can review active requests and nominate exactly three students with the same gender as the requester. Compatibility is the percentage of matching quiz answers.
- The requester can choose one of the three suggestions or close the request. A selected pair can message each other through the existing Messages view.
- After matching, either student can request an empty room and invite the other. If a two-person room has one resident, a matched student can request its open spot; the resident must accept, and sharing starts at the next billing cycle.
- A later roommate is billed half the security deposit; any amount the current resident already paid above their half is credited toward their future rent.
- Matching uses the `roommate_match_requests` and `roommate_match_candidates` tables. The older `roommate_board_requests` table is not used by this flow and is left untouched by the additions migration.

---

## 📁 Project Structure

```
src/
supabase/
└── functions/
    └── notify-payment-verification/   # Supabase Edge Function for payment webhooks
├── app/            Next.js layout, global styles, entry page, and /boarding-houses feed with skeleton loading
├── App.jsx         App shell: session, navigation, theme
├── components/     Nav, PropertyCard, LeafletMap, AddListingModal
├── context/        DataContext (loads gates + properties)
├── lib/
│   ├── supabase.js Supabase client
│   ├── api.js      All database/auth calls
│   ├── mappers.js  DB rows → UI objects
│   └── geo.js      Distance helpers
└── views/          Landing, Listings, PropertyDetail, dashboards, Admin, Chat, Inbox, Comparison
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
- **Chat or inbox unread count doesn't update live** – make sure the updated `supabase_additions.sql` ran (it enables Realtime on `messages` and `notifications`).
- **A safety score is unchanged** – existing scores are not automatically rewritten when the formula changes. In Admin Console → Safety Inspection, click **Recalculate score** beside the listing; make sure the updated additions script ran for live student-page updates.
- **Room availability is missing** – run the updated `supabase_additions.sql` to add booking vacancy dates and the public-safe availability function.

---

## 🗓️ Roadmap

- Structured roommate requests, matching, and vouching (requests currently use direct messages)
- Persisted room comparisons

---