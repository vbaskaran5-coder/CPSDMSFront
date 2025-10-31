// src/App.tsx
import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { getCurrentDate } from './lib/date';

// Core Layouts & Pages
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import JobDetail from './pages/JobDetail';
import ContractDetail from './pages/ContractDetail';
import NewJob from './pages/NewJob';
import NotFound from './pages/NotFound';
import SignIn from './pages/SignIn';
import HomePage from './pages/HomePage';

// Route Manager Section
import RouteManagerLayout from './pages/RouteManager/Layout';
import RouteManagerLoginPage from './pages/RouteManager/LoginPage';
import RouteManagerRoutes from './pages/RouteManager/Routes';
import Team from './pages/RouteManager/Team';
import Bookings from './pages/RouteManager/Bookings'; // Route Manager Bookings view

// Admin Console Section
import ConsoleLayout from './pages/Console/Layout';
import ConsoleLoginPage from './pages/Console/LoginPage';
import Workerbook from './pages/Console/Workerbook';
import WorkerbookNextDay from './pages/Console/WorkerbookNextDay';
import WorkerbookCalendar from './pages/Console/WorkerbookCalendar';
import WorkerbookDay from './pages/Console/WorkerbookDay';
import WorkerbookNoShows from './pages/Console/WorkerbookNoShows';
import WorkerbookWdrTnb from './pages/Console/WorkerbookWdrTnb';
import WorkerbookNotBooked from './pages/Console/WorkerbookNotBooked';
import WorkerbookQuitFired from './pages/Console/WorkerbookQuitFired';
import ContDetail from './pages/Console/ContDetail';
import MasterBookings from './pages/Console/MasterBookings'; // Renamed/Consolidated view
import BookingsDetails from './pages/Console/BookingsDetails';
import CompletedBookings from './pages/Console/CompletedBookings';
import MoveWorkersPage from './pages/Console/MoveWorkersPage';
import PayoutContractor from './pages/Console/PayoutContractor';
import PayoutSummary from './pages/Console/PayoutSummary'; // Console Payout Summary
import PayoutLogic from './pages/Console/PayoutLogic';
import PayoutToday from './pages/Console/PayoutToday'; // Component used within Workerbook

// Business Panel Section
import BusinessPanelLayout from './pages/BusinessPanel/BusinessPanelLayout';
import BusinessPanelLoginPage from './pages/BusinessPanel/BusinessPanelLogin';
// Removed BusinessPanelDashboard import as it wasn't used for routing
import ConsoleProfiles from './pages/BusinessPanel/ConsoleProfiles';
import ConsoleProfileDetail from './pages/BusinessPanel/ConsoleProfileDetail';
import EditSeason from './pages/BusinessPanel/EditSeason';
import RouteManagerProfiles from './pages/BusinessPanel/RouteManagerProfiles';
import BookingManagement from './pages/BusinessPanel/BookingManagement';
import TerritoryManagement from './pages/BusinessPanel/TerritoryManagement';
// Removed AddUpsell, UpsellMenuPage imports as they might not be directly routed or handled differently

import {
  getStorageItem,
  setStorageItem,
  STORAGE_KEYS,
  removeStorageItem,
} from './lib/localStorage';
import { Worker } from './types'; // Import Worker type for daily reset logic

// --- Private Route Components ---
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const contractor = getStorageItem(STORAGE_KEYS.CONTRACTOR, null);
  const activeCart = getStorageItem(STORAGE_KEYS.ACTIVE_CART, null);
  return contractor || activeCart ? (
    <>{children}</>
  ) : (
    <Navigate to="/logsheet/signin" replace /> // Use replace for login redirect
  );
};
const RouteManagerPrivateRoute = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const routeManager = getStorageItem(STORAGE_KEYS.ROUTE_MANAGER, null);
  return routeManager ? (
    <>{children}</>
  ) : (
    <Navigate to="/route-manager/login" replace /> // Use replace
  );
};
const ConsolePrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const admin = getStorageItem(STORAGE_KEYS.ADMIN, null);
  return admin ? <>{children}</> : <Navigate to="/console/login" replace />; // Use replace
};
const BusinessPanelPrivateRoute = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const businessUser = getStorageItem(STORAGE_KEYS.BUSINESS_USER, null);
  return businessUser ? (
    <>{children}</>
  ) : (
    <Navigate to="/business-panel/login" replace /> // Use replace
  );
};

// --- App Component ---
function App() {
  // Daily reset logic effect
  useEffect(() => {
    const todayStr = format(getCurrentDate(), 'yyyy-MM-dd');
    const lastAppDate = getStorageItem(STORAGE_KEYS.LAST_APP_DATE, null);

    if (lastAppDate && lastAppDate !== todayStr) {
      console.log(
        `New day detected (${todayStr}). Resetting daily assignments and statuses from ${lastAppDate}.`
      );

      const yesterdayStr = lastAppDate;

      // Archive previous day's route assignments
      const routeAssignments = getStorageItem(
        STORAGE_KEYS.ROUTE_ASSIGNMENTS,
        null
      );
      if (routeAssignments && Object.keys(routeAssignments).length > 0) {
        // Check if not null/empty
        setStorageItem(`routeAssignments_${yesterdayStr}`, routeAssignments);
      }
      removeStorageItem(STORAGE_KEYS.ROUTE_ASSIGNMENTS); // Clear for the new day

      // Archive previous day's map assignments
      const mapAssignments = getStorageItem(STORAGE_KEYS.MAP_ASSIGNMENTS, null);
      if (mapAssignments && Object.keys(mapAssignments).length > 0) {
        // Check if not null/empty
        setStorageItem(`mapAssignments_${yesterdayStr}`, mapAssignments);
      }
      removeStorageItem(STORAGE_KEYS.MAP_ASSIGNMENTS); // Clear for the new day

      // Archive previous day's attendance finalization status
      const attendanceFinalized = getStorageItem(
        STORAGE_KEYS.ATTENDANCE_FINALIZED,
        null
      );
      if (attendanceFinalized) {
        // Check if not null
        // Store the date string indicating it *was* finalized
        setStorageItem(
          `attendanceFinalized_${yesterdayStr}`, // Store under the specific date
          'true' // Store simple flag
        );
      }
      removeStorageItem(STORAGE_KEYS.ATTENDANCE_FINALIZED); // Clear the general key

      // Reset worker statuses for the new day
      const workers = getStorageItem<Worker[]>(
        STORAGE_KEYS.CONSOLE_WORKERS,
        []
      );
      if (workers.length > 0) {
        const resetWorkers = workers.map((w) => {
          // Keep workers who are Quit/Fired or WDR/TNB as they are
          if (
            w.bookingStatus === 'quit_fired' ||
            w.bookingStatus === 'wdr_tnb'
          ) {
            return w;
          }

          // Create a mutable copy
          const newWorker = { ...w };

          // Clear daily status fields
          delete newWorker.showed;
          delete newWorker.showedDate;
          delete newWorker.confirmationStatus;
          delete newWorker.routeManager;
          delete newWorker.cartId;
          // Keep payoutCompleted, commission, grossSales, equivalent, deductions, bonuses
          // as they relate to the *last completed day*, useful for viewing history.
          // PayoutToday component logic should rely on SHOWED status for the *current* day.

          // Update booking status based on previous day
          if (newWorker.bookingStatus === 'next_day') {
            newWorker.bookingStatus = 'today'; // Booked for today now
            newWorker.bookedDate = todayStr;
          } else if (
            newWorker.bookingStatus === 'calendar' &&
            newWorker.bookedDate === todayStr // Was booked in calendar for today
          ) {
            newWorker.bookingStatus = 'today'; // Now simply 'today'
          } else if (newWorker.bookingStatus === 'today') {
            // Was booked for 'today' (yesterday), now has no specific booking
            delete newWorker.bookingStatus;
            delete newWorker.bookedDate;
          } else if (newWorker.bookingStatus === 'no_show') {
            // If they were a no-show yesterday, clear the status for today
            delete newWorker.bookingStatus;
            delete newWorker.bookedDate;
          }
          // Workers booked further out in the calendar remain 'calendar' with their bookedDate.
          // Workers with no status remain without status.

          return newWorker;
        });
        setStorageItem(STORAGE_KEYS.CONSOLE_WORKERS, resetWorkers);
        console.log('Worker daily statuses reset.');
      }
    }
    // Update the last date the app was opened
    setStorageItem(STORAGE_KEYS.LAST_APP_DATE, todayStr);
  }, []); // Run only once on initial mount

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      {/* --- Business Panel Routes --- */}
      <Route
        path="/business-panel/login"
        element={<BusinessPanelLoginPage />}
      />
      <Route
        path="/business-panel"
        element={
          <BusinessPanelPrivateRoute>
            {' '}
            <BusinessPanelLayout />{' '}
          </BusinessPanelPrivateRoute>
        }
      >
        <Route
          index
          element={<Navigate to="console-profiles" replace />}
        />{' '}
        {/* Default to console profiles */}
        {/* <Route path="dashboard" element={<BusinessPanelDashboard />} /> {/* Keep if needed */}
        <Route path="console-profiles" element={<ConsoleProfiles />} />
        <Route
          path="console-profiles/:profileId"
          element={<ConsoleProfileDetail />}
        />
        <Route
          path="console-profiles/:profileId/edit-season/:seasonHardcodedId"
          element={<EditSeason />}
        />
        <Route
          path="route-manager-profiles"
          element={<RouteManagerProfiles />}
        />
        <Route path="booking-management" element={<BookingManagement />} />
        <Route path="territory-management" element={<TerritoryManagement />} />
        {/* Add other Business Panel routes here */}
      </Route>
      {/* --- Route Manager Routes --- */}
      <Route path="/route-manager/login" element={<RouteManagerLoginPage />} />
      <Route
        path="/route-manager"
        element={
          <RouteManagerPrivateRoute>
            {' '}
            <RouteManagerLayout />{' '}
          </RouteManagerPrivateRoute>
        }
      >
        <Route index element={<Navigate to="team" replace />} />{' '}
        {/* Default to team view */}
        <Route path="team" element={<Team />} />
        <Route path="routes" element={<RouteManagerRoutes />} />
        <Route path="bookings" element={<Bookings />} />{' '}
        {/* RM view of bookings */}
      </Route>
      {/* --- Digital Logsheet Routes --- */}
      <Route path="/logsheet/signin" element={<SignIn />} />
      <Route
        path="/logsheet"
        element={
          <PrivateRoute>
            {' '}
            <Layout />{' '}
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="jobs/:jobId" element={<JobDetail />} />{' '}
        {/* Route for regular jobs */}
        <Route path="contracts/:jobId" element={<ContractDetail />} />{' '}
        {/* Route for contracts */}
        <Route path="new-job" element={<NewJob />} />
        {/* Payout routes might belong here if contractors submit their own */}
        {/* <Route path="payout" element={<Payout />} /> */}
        {/* <Route path="payout/summary" element={<PayoutSummary />} /> */}
        <Route path="*" element={<NotFound />} /> {/* Logsheet specific 404 */}
      </Route>
      {/* --- Admin Console Routes --- */}
      <Route path="/console/login" element={<ConsoleLoginPage />} />
      <Route
        path="/console"
        element={
          <ConsolePrivateRoute>
            {' '}
            <ConsoleLayout />{' '}
          </ConsolePrivateRoute>
        }
      >
        {/* Workerbook */}
        <Route index element={<Navigate to="workerbook" replace />} />{' '}
        {/* Default to workerbook */}
        <Route path="workerbook" element={<Workerbook />} />{' '}
        {/* Today's view, includes PayoutToday conditionally */}
        <Route path="workerbook/next-day" element={<WorkerbookNextDay />} />
        <Route path="workerbook/calendar" element={<WorkerbookCalendar />} />
        <Route path="workerbook/day/:date" element={<WorkerbookDay />} />{' '}
        {/* Specific past/future day view */}
        <Route path="workerbook/no-shows" element={<WorkerbookNoShows />} />
        <Route path="workerbook/wdr-tnb" element={<WorkerbookWdrTnb />} />
        <Route path="workerbook/not-booked" element={<WorkerbookNotBooked />} />
        <Route path="workerbook/move-workers" element={<MoveWorkersPage />} />
        <Route path="workerbook/quit-fired" element={<WorkerbookQuitFired />} />
        <Route
          path="workerbook/contdetail/:workerId"
          element={<ContDetail />}
        />{' '}
        {/* Worker details */}
        {/* Bookings */}
        <Route
          path="bookings"
          element={<Navigate to="prebooks" replace />}
        />{' '}
        {/* Default bookings to MasterBookings */}
        <Route path="bookings/prebooks" element={<MasterBookings />} />{' '}
        {/* Main view for all DBs, includes Maps */}
        <Route
          path="bookings/prebooks/:bookingId"
          element={<BookingsDetails />}
        />{' '}
        {/* Detail/Edit view */}
        <Route path="bookings/completed" element={<CompletedBookings />} />
        {/* Payout (Admin processing) */}
        <Route
          path="payout"
          element={<Navigate to="/console/workerbook" replace />}
        />{' '}
        {/* Redirect base payout to workerbook */}
        <Route
          path="payout/contractor/:contractorId"
          element={<PayoutContractor />}
        />{' '}
        {/* Payout form for individual */}
        <Route path="payout/cart/:cartId" element={<PayoutContractor />} />{' '}
        {/* Payout form for team via cart */}
        <Route
          path="payout/summary/:payoutId"
          element={<PayoutSummary />}
        />{' '}
        {/* Generic summary display - needs adjustment? Or use worker/cart ID? */}
        {/* Settings */}
        <Route
          path="settings"
          element={<Navigate to="payout-logic" replace />}
        />
        <Route path="settings/payout-logic" element={<PayoutLogic />} />
        {/* Add other console settings routes */}
      </Route>
      {/* --- Catch-all Fallback --- */}
      <Route path="*" element={<Navigate to="/" replace />} />{' '}
      {/* Redirect unknown paths to home */}
    </Routes>
  );
}

export default App;
