
// "use client" tells Next.js that this file must run on the client side.
// This is necessary because the component uses React hooks and Context,
// which manage interactive application data.
"use client";

// Import the React functions needed to create and manage shared application data.
//
// createContext - Creates a shared data container.
// useCallback  - Prevents a function from being recreated unnecessarily.
// useContext   - Allows components to access shared context data.
// useEffect    - Runs code after the component renders.
// useMemo      - Prevents unnecessary recalculation of values.
// useState     - Stores data that can change over time.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

// Import API functions used to retrieve campus gates and rental properties
// from the application's backend.
import { fetchGates, fetchHouses } from "../lib/api.js";

// Import a variable that checks whether Supabase has been configured correctly.
import { isSupabaseConfigured } from "../lib/supabase.js";

// Import the default campus coordinates.
// These coordinates are used when no campus gate data is available.
import { DEFAULT_CAMPUS } from "../lib/geo.js";

// CREATE DATA CONTEXT
// createContext() creates a shared storage area for application data.
//
// Instead of passing properties, gates, and loading information manually
// through multiple component levels (called prop drilling),
// components can access this information through the useData() hook.
//
// null is the default value when no DataProvider is available.
const DataContext = createContext(null);

// DATA PROVIDER COMPONENT
// DataProvider is responsible for managing and providing shared data
// to all components placed inside it.
//
// PROPS:
// session  - Information about the currently signed-in user.
// children - Other components wrapped inside this provider.
//
// Example:
// <DataProvider session={session}>
//   <App />
// </DataProvider>
//
// All components inside DataProvider can access the shared data.
export function DataProvider({ session, children }) {

  // GATES STATE
  // Stores the campus gate information retrieved from Supabase.
  // Starts as an empty array because no gate data has been loaded yet.
  const [gates, setGates] = useState([]);

  // PROPERTIES STATE
  // Stores the rental property information retrieved from Supabase.
  // Each property may contain information such as its title,
  // address, coordinates, rental price, and other details.
  const [properties, setProperties] = useState([]);

  // LOADING STATE
  // Indicates whether the application is currently loading data.
  // Starts as true because data has not been retrieved yet.
  const [loading, setLoading] = useState(true);

  // ERROR STATE
  // Stores an error message if something goes wrong while loading data.
  // An empty string means there is currently no error.
  const [error, setError] = useState("");

  // RELOAD FUNCTION
  // This function retrieves the latest campus gates and rental properties.
  //
  // useCallback prevents the reload function from being recreated
  // unnecessarily on every render.
  //
  // The empty dependency array means the function keeps the same reference
  // between renders.
  const reload = useCallback(async () => {

    // CHECK SUPABASE CONFIGURATION
    // Before requesting data, check whether Supabase is configured.
    //
    // If Supabase is not configured, display an error explaining
    // which environment variables need to be added.
    if (!isSupabaseConfigured) {
      setError(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
      );

      // Stop showing the loading indicator because the application
      // cannot retrieve data without the Supabase configuration.
      setLoading(false);

      // Exit the function without making any API requests.
      return;
    }

    // TRY TO LOAD DATA
    // try/catch/finally handles errors that may happen during API requests.
    try {

      // Clear any previous error message before starting a new request.
      setError("");

      // FETCH CAMPUS GATES
      // Call fetchGates() to retrieve the campus gate records.
      // await pauses execution until the request finishes.
      const g = await fetchGates();

      // Save the retrieved gate information in the gates state.
      setGates(g);

      // FETCH RENTAL PROPERTIES
      // Call fetchHouses() to retrieve rental properties.
      //
      // The fetched gate data is passed into fetchHouses().
      // This allows the API function to use gate information when preparing
      // property data, depending on how fetchHouses() is implemented.
      //
      // The returned properties are then saved in the properties state.
      setProperties(await fetchHouses(g));

    } catch (e) {

      // ERROR HANDLING
      // If either API request fails, store the error message.
      // This allows other components to display an appropriate error.
      setError(e.message);

    } finally {

      // FINALLY BLOCK
      // This runs whether the requests succeed or fail.
      // Set loading to false because the loading attempt has finished.
      setLoading(false);
    }
  }, []);

  // AUTOMATIC DATA RELOADING
  // This effect automatically retrieves data when:
  // 1. The DataProvider is first displayed.
  // 2. The reload function changes.
  // 3. The signed-in user's accountId changes.
  //
  // The session dependency is important because different user roles
  // may have different access permissions in Supabase.
  //
  // RLS means Row Level Security. It controls which database rows
  // a particular user is allowed to access.
  //
  // For example, a student and an admin may receive different records
  // depending on the permissions configured in Supabase.
  useEffect(() => {

    // Retrieve the latest gates and rental properties.
    reload();

  }, [reload, session?.accountId]);

  // CAMPUS LOCATION
  // Determine the campus coordinates using the available gate information.
  //
  // useMemo prevents this value from being recalculated unless
  // the gates array changes.
  const campus = useMemo(() => {

    // Look for the gate marked as the main campus gate.
    // If there is no main gate, use the first available gate.
    const main = gates.find((g) => g.isMain) || gates[0];

    // If a gate is available, use its latitude and longitude
    // as the campus coordinates.
    //
    // Otherwise, use DEFAULT_CAMPUS from geo.js.
    // This ensures the application still has a campus location
    // even when no gate information has been retrieved.
    return main
      ? { lat: main.lat, lng: main.lng }
      : DEFAULT_CAMPUS;

  }, [gates]);

  // SHARED CONTEXT VALUE
  // Combine all the information and functions that other components
  // are allowed to access through the DataContext.
  //
  // gates      - List of campus gates.
  // campus     - Main campus coordinates.
  // properties - List of rental properties.
  // loading    - Indicates whether data is loading.
  // error      - Contains an error message, if any.
  // reload     - Function for manually retrieving the latest data.
  //
  // useMemo prevents the context value object from being recreated
  // unless one of its dependencies changes.
  const value = useMemo(
    () => ({
      gates,
      campus,
      properties,
      loading,
      error,
      reload
    }),
    [gates, campus, properties, loading, error, reload]
  );

  // PROVIDE SHARED DATA
  // DataContext.Provider makes the value object available
  // to every component inside DataProvider.
  //
  // children represents the components wrapped inside this provider.
  // Those components can access the shared information using useData().
  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

// CUSTOM useData HOOK
// This custom hook makes it easier for other components
// to access the information stored in DataContext.
//
// Instead of writing useContext(DataContext) in every component,
// they can simply import and call useData().
//
// Example:
// const { properties, gates, campus, loading, error, reload } = useData();
//
// This gives the component access to the shared UniRent data.
export const useData = () => useContext(DataContext);
