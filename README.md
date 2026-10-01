<<<<<<< HEAD
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
=======
# 🏡 UniRent | Boarding-House-Finder | Map-Centric University Housing Marketplace

**UnitRent** is a map-centric boarding house and lodging marketplace designed specifically for university students. It helps students find safe, verified local housing near campus through walking-distance mapping, safety score breakdowns, lifestyle roommate matching, and real-time landlord communication.

---

## ✨ Features

* **🗺️ Smart Mapping (Leaflet Integration):** Visual map pinpoints filtered by a 10-minute (800m) walking radius to campus, featuring custom markers and route calculations.
* **🛡️ Property Verification System:** Verified badges (⚡ Fast Wi-Fi, 💧 24/7 Water Supply, 🛡️ Vetted Safe) awarded through administrative document proof checks.
* **📊 Multi-Factor Safety Score Engine:** Calculates a transparent score (0–10) based on proximity to police stations, street lighting quality, gated access, and CCTV.
* **🤝 Roommate Compatibility Matching:** Algorithmic matching system based on student sleep schedules, study habits, and cleanliness preferences.
* **💬 Real-Time Chat & Landlord Connect:** Instant messaging powered by Supabase Realtime with pre-built inquiry templates (pricing, deposits, house rules).
* **📅 Room Availability Calendar:** Live calendar tracking room status (`available`, `reserved`, `occupied`).
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
  * **Auth:** `@supabase/ssr` Authentication with Role-Based Access (Student vs. Landlord)
* **Maps & Geolocation:** [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles

---
>>>>>>> a185c74796f0ef299e41118bd7ecba1524b94dd7
