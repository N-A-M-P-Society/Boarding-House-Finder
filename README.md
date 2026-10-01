# 🏡 UniRent | Boarding-House-Finder | Map-Centric University Housing Marketplace

**UniRent** is a map-centric boarding house and lodging marketplace designed specifically for university students. It helps students find safe, verified local housing near campus through walking-distance mapping, safety score breakdowns, lifestyle roommate matching, and real-time landlord communication.

---

## ✨ Features

* **🗺️ Smart Mapping (Leaflet Integration):** Visual map pinpoints filtered by a 10-minute (800m) walking radius to campus, featuring custom markers and route calculations.
* **🛡️ Property Verification System:** Verified badges awarded through administrative document proof checks.
* **📊 Multi-Factor Safety Score Engine:** Calculates a transparent score (0–10) based on proximity to police stations, street lighting quality, gated access, and CCTV.
* **🤝 Roommate Compatibility Matching:** Algorithmic matching system based on student sleep schedules, study habits, and cleanliness preferences.
* **💬 Real-Time Chat & Landlord Connect:** Instant messaging powered by Supabase Realtime with pre-built inquiry templates.
* **📅 Room Availability Calendar:** Live calendar tracking room status (`Available`, `Reserved`, `Occupied`).
* **⚖️ Side-by-Side Room Comparison:** Compare rent, safety scores, amenities, and verification parameters across multiple listings in a matrix table.
* **⭐ Verified Student Reviews:** Ratings and written feedback submitted by verified student tenants.

---

## 🛠️ Tech Stack

* **Framework:** [Next.js](https://nextjs.org/) (App Router, Server Components & Server Actions)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/)
* **Database & Backend:** [Supabase](https://supabase.com/)
  * **Database:** PostgreSQL with Row-Level Security (RLS)
  * **Realtime:** WebSocket subscriptions for instant messaging
  * **Storage:** Storage Buckets for property images and verification documents
  * **Auth:** Supabase Auth with Role-Based Access (`Owner` vs `Renter`)
* **Maps & Geolocation:** [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles

---

Markdown
## 🚀 Getting Started

### 1. Prerequisites

Ensure you have the following installed on your local machine:
* [Node.js](https://nodejs.org/) (v18.0.0 or higher)
* [Git](https://git-scm.com/)

---

### 2. Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/unirent.git](https://github.com/your-username/unirent.git)
   cd unirent
   
Install project dependencies:
Bash
npm install
# or
yarn install
# or
pnpm install

Configure environment variables:
Create a .env.local file in the root directory and add your Supabase credentials:

Code snippet
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

Run the development server:
Bash
npm run dev
# or
yarn dev
# or
pnpm dev

Open the application:
Navigate to http://localhost:3000 in your browser to view the application.
pnpm dev

Open the Application:
Navigate to http://localhost:3000 in your browser to view the application.
