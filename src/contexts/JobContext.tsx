// src/contexts/JobContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { MasterBooking, Worker, ConsoleProfile } from '../types'; // Added ConsoleProfile
import { bookingStore } from '../stores/AdminBookingStore'; // Uses the updated store
import {
  getStorageItem,
  STORAGE_KEYS,
  getSeasonConfigById,
} from '../lib/localStorage'; // Import getSeasonConfigById
import { HardcodedSeason } from '../lib/hardcodedData'; // Import HardcodedSeason

// Filter interface
interface Filter {
  status?: 'pending' | 'completed' | 'contracts' | undefined;
}

interface JobContextType {
  bookings: MasterBooking[]; // Filtered bookings for the current view
  allBookings: MasterBooking[]; // All relevant bookings for the user
  loading: boolean;
  error: string | null;
  addJob: (jobData: Partial<MasterBooking>) => void;
  getJob: (id: string) => MasterBooking | undefined;
  updateJob: (id: string, updates: Partial<MasterBooking>) => void;
  completeJob: (id: string, paymentMethod: string, isPaid: boolean) => void;
  cancelJob: (id: string) => void;
  completedSteps: number;
  filter: Filter;
  setFilter: React.Dispatch<React.SetStateAction<Filter>>;
  syncJobs: () => Promise<void>; // Kept for potential manual trigger, though less critical now
  isAddContractOpen: boolean;
  openAddContract: () => void;
  closeAddContract: () => void;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

export const JobProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ status: undefined });
  // This state holds ALL relevant bookings for the logged-in worker for the active season
  const [allBookings, setAllBookings] = useState<MasterBooking[]>([]);
  const [isAddContractOpen, setIsAddContractOpen] = useState(false);

  const openAddContract = () => setIsAddContractOpen(true);
  const closeAddContract = () => setIsAddContractOpen(false);

  // Function to load and filter bookings based on user type
  const loadAndFilterBookings = useCallback(() => {
    setLoading(true);
    setError(null);
    console.log('JobContext: Reloading and filtering bookings for worker...');

    try {
      // Identify logged-in worker (Contractor or via Active Cart)
      const activeCart = getStorageItem(STORAGE_KEYS.ACTIVE_CART, null);
      const contractor = getStorageItem(STORAGE_KEYS.CONTRACTOR, null);
      const loggedInWorkerId =
        activeCart?.loggedInWorker.number || contractor?.number;

      let relevantBookings: MasterBooking[] = [];

      if (loggedInWorkerId) {
        // Use the store's method which gets *territory-filtered* bookings
        // and then further filters by contractor/route assignments for the *active season*.
        relevantBookings =
          bookingStore.getBookingsForContractor(loggedInWorkerId);
        console.log(
          `JobContext: Filtered down to ${relevantBookings.length} relevant bookings for worker ${loggedInWorkerId}.`
        );
      } else {
        console.log('JobContext: No logged-in worker found.');
        // Optionally set an error or just show empty list
        // setError("Could not identify logged-in worker.");
      }

      setAllBookings(relevantBookings);
    } catch (err) {
      console.error('Error loading/filtering bookings in JobContext:', err);
      setError(
        `Failed to load bookings for your session: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
      setAllBookings([]); // Clear bookings on error
    } finally {
      setLoading(false);
    }
  }, []); // Empty dependency array, relies on event listeners

  // Effect to load initially and listen for store refreshes or auth changes
  useEffect(() => {
    loadAndFilterBookings(); // Initial load

    // Listen for the specific event dispatched by the AdminBookingStore
    const handleStoreRefresh = () => {
      console.log('JobContext detected bookingStoreRefreshed event.');
      loadAndFilterBookings();
    };
    window.addEventListener('bookingStoreRefreshed', handleStoreRefresh);

    // Also listen for login/logout changes or route assignment updates
    const handleStorageUpdate = (event: any) => {
      const changedKey = event?.detail?.key;
      if (
        changedKey === STORAGE_KEYS.CONTRACTOR ||
        changedKey === STORAGE_KEYS.ACTIVE_CART ||
        changedKey === STORAGE_KEYS.ROUTE_ASSIGNMENTS ||
        changedKey === STORAGE_KEYS.ACTIVE_SEASON_ID || // Reload if active season changes
        changedKey === STORAGE_KEYS.ADMIN // Reload if console user changes (affects territory filter)
      ) {
        console.log(
          `JobContext detected relevant storage update (${changedKey}), reloading.`
        );
        loadAndFilterBookings();
      }
    };
    window.addEventListener('storageUpdated', handleStorageUpdate);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('bookingStoreRefreshed', handleStoreRefresh);
      window.removeEventListener('storageUpdated', handleStorageUpdate);
    };
  }, [loadAndFilterBookings]); // Depend on the callback

  // Filter the `allBookings` based on the UI filter state
  const filteredBookings = useMemo(() => {
    console.log('JobContext: Applying UI filter:', filter);
    return allBookings.filter((booking) => {
      // Apply status filter
      if (filter.status === 'completed' && booking['Completed'] !== 'x')
        return false;
      if (filter.status === 'contracts' && !booking.isContract) return false;
      if (
        filter.status === 'pending' &&
        // Pending should EXCLUDE completed, any with a status (cancelled, redo etc.), and contracts
        (booking['Completed'] === 'x' ||
          !!booking['Status'] || // Check if Status has any value other than empty/null/undefined
          booking.isContract)
      )
        return false;

      // Add more filter logic here if needed (e.g., date filtering)

      return true; // Passed all filters
    });
  }, [allBookings, filter]);

  // Calculate completed steps based on the worker's relevant bookings
  const completedSteps = useMemo(
    () => allBookings.filter((booking) => booking['Completed'] === 'x').length,
    [allBookings]
  );

  // --- Store Interaction Methods ---
  // These methods now just pass calls through to the bookingStore instance.
  // The store handles saving and triggering the 'bookingStoreRefreshed' event.

  const addJob = useCallback((jobData: Partial<MasterBooking>) => {
    setError(null); // Clear previous errors
    const activeCart = getStorageItem(STORAGE_KEYS.ACTIVE_CART, null);
    const contractor = getStorageItem(STORAGE_KEYS.CONTRACTOR, null);
    const loggedInWorkerId =
      activeCart?.loggedInWorker.number || contractor?.number;

    if (!loggedInWorkerId) {
      const msg = 'Cannot add job: No logged-in worker identified.';
      setError(msg);
      console.error(msg);
      alert(msg); // Alert user
      return;
    }

    // Attempt to find Group and Master Map based on Route Number using territory structure
    // This assumes the structure is available; ideally fetched/cached elsewhere
    let group = 'Unknown';
    let masterMap = 'Unknown';
    if (jobData['Route Number']) {
      const territoryStructure = getStorageItem(
        STORAGE_KEYS.EAST_TERRITORY_STRUCTURE,
        {}
      );
      let found = false;
      for (const grp in territoryStructure) {
        for (const map in territoryStructure[grp]) {
          if (territoryStructure[grp][map].includes(jobData['Route Number'])) {
            group = grp;
            masterMap = map;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        console.warn(
          `Route Number ${jobData['Route Number']} not found in East Territory Structure.`
        );
      }
    }

    const bookingToAdd: Partial<MasterBooking> = {
      ...jobData,
      'Contractor Number': loggedInWorkerId, // Assign to current worker
      isPrebooked: false, // It's a same-day sale
      Completed: jobData.Completed || 'x', // Default to completed
      Status: jobData.Status || '', // Default to empty status (not cancelled etc.)
      'Date Completed': jobData['Date Completed'] || new Date().toISOString(),
      'Is Paid': jobData['Is Paid'] ?? jobData['Payment Method'] !== 'Billed', // Default based on payment method
      Price: jobData.Price?.toString() || '0.00',
      'First Name': jobData['First Name'] || '',
      'Last Name': jobData['Last Name'] || '',
      'Full Address': jobData['Full Address'] || '',
      // >>> Add Group/Master Map needed for territory filtering <<<
      Group: group,
      'Master Map': masterMap,
    };

    try {
      bookingStore.addBooking(bookingToAdd); // Pass the prepared object
      // No need to manually update state here, the event listener will handle it
    } catch (err) {
      const errorMsg = `Failed to add job: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      console.error('Error in JobContext addJob:', err);
      setError(errorMsg);
      alert(errorMsg); // Alert user
    }
  }, []); // No dependencies needed as it gets fresh data each time

  const getJob = useCallback(
    (id: string): MasterBooking | undefined => {
      // This gets from the worker's *currently loaded* filtered list
      return allBookings.find((b) => b['Booking ID'] === id);
    },
    [allBookings]
  ); // Recreate if allBookings changes

  const updateJob = useCallback(
    (id: string, updates: Partial<MasterBooking>) => {
      setError(null);
      // Ensure Price is string if provided as number
      if (updates.Price && typeof updates.Price === 'number') {
        updates.Price = updates.Price.toFixed(2);
      }
      try {
        bookingStore.updateBooking(id, updates);
        // State update handled by event listener
      } catch (err) {
        const errorMsg = `Failed to update job ${id}: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`;
        console.error('Error in JobContext updateJob:', err);
        setError(errorMsg);
      }
    },
    []
  );

  const completeJob = useCallback(
    (id: string, paymentMethod: string, isPaid: boolean) => {
      setError(null);
      try {
        bookingStore.completeBooking(id, paymentMethod, isPaid);
        // State update handled by event listener
      } catch (err) {
        const errorMsg = `Failed to complete job ${id}: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`;
        console.error('Error in JobContext completeJob:', err);
        setError(errorMsg);
      }
    },
    []
  );

  const cancelJob = useCallback((id: string) => {
    setError(null);
    try {
      bookingStore.cancelJob(id);
      // State update handled by event listener
    } catch (err) {
      const errorMsg = `Failed to cancel job ${id}: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      console.error('Error in JobContext cancelJob:', err);
      setError(errorMsg);
    }
  }, []);

  // Sync function might be less critical if store events work reliably,
  // but can be kept as a manual refresh trigger.
  const syncJobs = useCallback(async (): Promise<void> => {
    console.log('Manual sync triggered in JobContext...');
    loadAndFilterBookings(); // Manually trigger a reload from the store
  }, [loadAndFilterBookings]);

  // Memoize the context value
  const contextValue = useMemo(
    () => ({
      bookings: filteredBookings,
      allBookings: allBookings,
      loading,
      error,
      addJob,
      getJob,
      updateJob,
      completeJob,
      cancelJob,
      completedSteps,
      filter,
      setFilter,
      syncJobs,
      isAddContractOpen,
      openAddContract,
      closeAddContract,
    }),
    [
      filteredBookings,
      allBookings,
      loading,
      error,
      addJob,
      getJob,
      updateJob,
      completeJob,
      cancelJob,
      completedSteps,
      filter,
      syncJobs,
      isAddContractOpen,
    ]
  );

  return (
    <JobContext.Provider value={contextValue}>{children}</JobContext.Provider>
  );
};

// useJobs hook remains the same
export const useJobs = () => {
  const context = useContext(JobContext);
  if (context === undefined) {
    throw new Error('useJobs must be used within a JobProvider');
  }
  return context;
};
