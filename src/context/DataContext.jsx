"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchGates, fetchHouses } from "../lib/api";
import { isSupabaseConfigured } from "../lib/supabase";
import { DEFAULT_CAMPUS } from "../lib/geo";

const DataContext = createContext(null);

export function DataProvider({ session, children }) {
  const [gates, setGates] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
      setLoading(false);
      return;
    }
    try {
      setError("");
      const g = await fetchGates();
      setGates(g);
      setProperties(await fetchHouses(g));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch whenever the signed-in user changes (RLS returns different rows per role)
  useEffect(() => {
    reload();
  }, [reload, session?.accountId]);

  const campus = useMemo(() => {
    const main = gates.find((g) => g.isMain) || gates[0];
    return main ? { lat: main.lat, lng: main.lng } : DEFAULT_CAMPUS;
  }, [gates]);

  const value = useMemo(() => ({ gates, campus, properties, loading, error, reload }), [gates, campus, properties, loading, error, reload]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
