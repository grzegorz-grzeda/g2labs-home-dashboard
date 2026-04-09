import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  createGroup,
  createLocation,
  createUser,
  deleteLocation,
  getAdminAccess,
  getCurrentReadings,
  getHistory,
  getLocations,
  getMe,
  login,
  logout,
  updateLocation,
  updateUser,
} from './api';
import AccessPage from './pages/AccessPage';
import DashboardPage from './pages/DashboardPage';
import LocationsPage from './pages/LocationsPage';
import { ROUTES, useRoute } from './router';

function getSavedTheme() {
  return localStorage.getItem('theme') || 'system';
}

function getSavedTimeFormat() {
  return localStorage.getItem('time-format') || 'system';
}

function getTimeFormatOptions(timeFormat) {
  if (timeFormat === '24h') return { hour12: false };
  if (timeFormat === '12h') return { hour12: true };
  return {};
}

function formatWithLocalSettings(ts, options, timeFormat) {
  return new Date(ts).toLocaleString(undefined, {
    ...options,
    ...getTimeFormatOptions(timeFormat),
  });
}

function formatLocalDateTime(ts, timeFormat) {
  if (!ts) return '';
  return formatWithLocalSettings(ts, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }, timeFormat);
}


export default function App() {
  const [theme, setTheme] = useState(getSavedTheme);
  const [timeFormat, setTimeFormat] = useState(getSavedTimeFormat);
  const [authState, setAuthState] = useState('loading');
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [status, setStatus] = useState({ text: 'Disconnected', kind: 'disconnected' });
  const [currentUserContext, setCurrentUserContext] = useState(null);
  const [locations, setLocations] = useState([]);
  const [currentReadings, setCurrentReadings] = useState({});
  const [historiesByLocation, setHistoriesByLocation] = useState({});
  const [rangeHours, setRangeHours] = useState('24');
  const [locationsError, setLocationsError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessData, setAccessData] = useState({ groups: [], users: [] });
  const [locationDraft, setLocationDraft] = useState({ name: '', sensorMac: '', groupId: '' });
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [editLocationDrafts, setEditLocationDrafts] = useState({});
  const [editUserDrafts, setEditUserDrafts] = useState({});
  const [newGroupDraft, setNewGroupDraft] = useState({ name: '', description: '' });
  const [newUserDraft, setNewUserDraft] = useState({ name: '', username: '', password: '', role: 'member', groupIds: [] });
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState({});
  const socketRef = useRef(null);
  const updateTimersRef = useRef({});
  const isAdmin = currentUserContext?.user?.role === 'admin';
  const { route, navigate } = useRoute(isAdmin);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('time-format', timeFormat);
  }, [timeFormat]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const loaded = await loadUserContext();
        if (cancelled) return;
        if (loaded) {
          await reloadDashboard();
        } else {
          setAuthState('logged-out');
          setStatus({ text: 'Disconnected', kind: 'disconnected' });
        }
      } catch (error) {
        if (cancelled) return;
        setAuthState('logged-out');
        setAuthError(error.message || 'Failed to initialize dashboard');
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      Object.values(updateTimersRef.current).forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated') return undefined;
    connectSocket();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [authState, currentUserContext?.user?._id]);

  useEffect(() => {
    if (authState !== 'authenticated' || locations.length === 0 || route !== ROUTES.dashboard) return;
    loadAllCharts();
  }, [authState, locations, rangeHours, route]);

  useEffect(() => {
    setEditUserDrafts(previous => {
      const next = {};
      accessData.users.forEach(user => {
        next[user._id] = previous[user._id]
          ? {
              ...previous[user._id],
              role: previous[user._id].role,
              password: previous[user._id].password,
              groupIds: previous[user._id].groupIds,
            }
          : {
              role: user.role,
              password: '',
              groupIds: [...user.groupIds],
            };
      });
      return next;
    });
  }, [accessData.users]);

  async function loadUserContext() {
    try {
      const context = await getMe();
      await applyAuthenticatedContext(context);
      return true;
    } catch (error) {
      if (error?.code === 'AUTH_REQUIRED' || error?.code === 'USER_NOT_FOUND') return false;
      throw new Error(error.error || error.message || 'Failed to load user context');
    }
  }

  async function applyAuthenticatedContext(context) {
    setCurrentUserContext(context);
    setAuthState('authenticated');
    setAuthError('');
    setLocationDraft(draft => ({
      ...draft,
      groupId: draft.groupId || context.groups[0]?._id || '',
    }));
    if (context.user.role === 'admin') {
      try {
        setAccessData(await getAdminAccess());
      } catch (error) {
        console.error('Failed to load admin access UI:', error);
        setAccessError(error.error || error.message || 'Failed to load access management');
      }
    } else {
      setAccessData({ groups: [], users: [] });
      setAccessError('');
    }
  }

  async function reloadDashboard() {
    setLocationsError('');
    setCurrentReadings({});
    setHistoriesByLocation({});
    await loadLocations();
    const current = await getCurrentReadings();
    const nextReadings = {};
    current.forEach(({ location, reading }) => {
      if (reading) {
        nextReadings[location._id] = {
          locationId: location._id,
          locationName: location.name,
          ...reading,
        };
      }
    });
    setCurrentReadings(nextReadings);
  }

  async function loadLocations() {
    const nextLocations = await getLocations();
    setLocations(nextLocations);
    setLocationDraft(draft => ({
      ...draft,
      groupId: nextLocations[0]?.groupId || draft.groupId || currentUserContext?.groups[0]?._id || '',
    }));
  }

  async function loadAllCharts() {
    const histories = await Promise.all(
      locations.map(location => getHistory(location._id, rangeHours))
    );
    const next = {};
    locations.forEach((location, index) => {
      next[location._id] = histories[index];
    });
    setHistoriesByLocation(next);
  }

  function connectSocket() {
    socketRef.current?.disconnect();
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => setStatus({ text: 'Live', kind: 'connected' }));
    socket.on('disconnect', () => setStatus({ text: 'Disconnected', kind: 'disconnected' }));
    socket.on('connect_error', error => {
      console.error('Socket connection error:', error.message);
      setStatus({ text: 'Connection Error', kind: 'disconnected' });
    });
    socket.on('reading', reading => {
      setCurrentReadings(previous => ({
        ...previous,
        [reading.locationId]: reading,
      }));
      setHistoriesByLocation(previous => {
        const existing = previous[reading.locationId];
        if (!existing) return previous;
        return {
          ...previous,
          [reading.locationId]: [...existing, reading],
        };
      });
      setRecentlyUpdatedIds(previous => ({ ...previous, [reading.locationId]: true }));
      clearTimeout(updateTimersRef.current[reading.locationId]);
      updateTimersRef.current[reading.locationId] = setTimeout(() => {
        setRecentlyUpdatedIds(previous => {
          const next = { ...previous };
          delete next[reading.locationId];
          return next;
        });
      }, 1500);
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    try {
      const context = await login(authForm);
      setAuthForm(form => ({ ...form, password: '' }));
      await applyAuthenticatedContext(context);
      await reloadDashboard();
    } catch (error) {
      console.error('Login flow failed:', error);
      setAuthError(error.error || error.message || 'Login failed');
    }
  }

  async function handleLogout() {
    socketRef.current?.disconnect();
    await logout();
    setAuthState('logged-out');
    setCurrentUserContext(null);
    setLocations([]);
    setCurrentReadings({});
    setHistoriesByLocation({});
    setAccessData({ groups: [], users: [] });
    setStatus({ text: 'Disconnected', kind: 'disconnected' });
    navigate(ROUTES.dashboard);
  }

  async function handleAddLocation() {
    try {
      await createLocation(locationDraft);
      setLocationsError('');
      setLocationDraft(draft => ({ ...draft, name: '', sensorMac: '' }));
      await loadLocations();
    } catch (error) {
      setLocationsError(error.error || error.message);
    }
  }

  async function handleSaveLocation(id) {
    const draft = editLocationDrafts[id];
    try {
      await updateLocation(id, draft);
      setLocationsError('');
      setEditingLocationId(null);
      await loadLocations();
    } catch (error) {
      setLocationsError(error.error || error.message);
    }
  }

  async function handleDeleteLocation(id) {
    if (!window.confirm('Delete this location and all its readings?')) return;
    try {
      await deleteLocation(id);
      await loadLocations();
    } catch (error) {
      setLocationsError(error.error || error.message);
    }
  }

  async function handleCreateGroup() {
    try {
      await createGroup(newGroupDraft);
      setAccessError('');
      setNewGroupDraft({ name: '', description: '' });
      await loadUserContext();
      await loadLocations();
    } catch (error) {
      setAccessError(error.error || error.message);
    }
  }

  async function handleCreateUser() {
    try {
      await createUser(newUserDraft);
      setAccessError('');
      setNewUserDraft({ name: '', username: '', password: '', role: 'member', groupIds: [] });
      await loadUserContext();
    } catch (error) {
      setAccessError(error.error || error.message);
    }
  }

  async function handleSaveUser(userId) {
    const draft = editUserDrafts[userId];
    try {
      await updateUser(userId, {
        role: draft.role,
        password: draft.password,
        groupIds: draft.groupIds,
      });
      setAccessError('');
      await loadUserContext();
    } catch (error) {
      setAccessError(error.error || error.message);
    }
  }

  const allHistoryPoints = Object.values(historiesByLocation)
    .flat()
    .filter(point => typeof point.temperature === 'number' && typeof point.humidity === 'number');
  const scales = allHistoryPoints.length > 0 ? {
    tempMin: Math.floor(Math.min(...allHistoryPoints.map(point => point.temperature))) - 5,
    tempMax: Math.ceil(Math.max(...allHistoryPoints.map(point => point.temperature))) + 5,
    humidMin: Math.floor(Math.min(...allHistoryPoints.map(point => point.humidity))) - 5,
    humidMax: Math.ceil(Math.max(...allHistoryPoints.map(point => point.humidity))) + 5,
  } : null;

  function renderPage() {
    if (route === ROUTES.locations) {
      return (
        <LocationsPage
          locations={locations}
          currentUserContext={currentUserContext}
          editingLocationId={editingLocationId}
          setEditingLocationId={setEditingLocationId}
          editLocationDrafts={editLocationDrafts}
          setEditLocationDrafts={setEditLocationDrafts}
          handleSaveLocation={handleSaveLocation}
          handleDeleteLocation={handleDeleteLocation}
          locationDraft={locationDraft}
          setLocationDraft={setLocationDraft}
          handleAddLocation={handleAddLocation}
          locationsError={locationsError}
        />
      );
    }

    if (route === ROUTES.access && isAdmin) {
      return (
        <AccessPage
          accessData={accessData}
          editUserDrafts={editUserDrafts}
          setEditUserDrafts={setEditUserDrafts}
          newGroupDraft={newGroupDraft}
          setNewGroupDraft={setNewGroupDraft}
          handleCreateGroup={handleCreateGroup}
          newUserDraft={newUserDraft}
          setNewUserDraft={setNewUserDraft}
          handleCreateUser={handleCreateUser}
          handleSaveUser={handleSaveUser}
          accessError={accessError}
        />
      );
    }

    return (
      <DashboardPage
        locations={locations}
        currentReadings={currentReadings}
        recentlyUpdatedIds={recentlyUpdatedIds}
        rangeHours={rangeHours}
        setRangeHours={setRangeHours}
        historiesByLocation={historiesByLocation}
        scales={scales}
        timeFormat={timeFormat}
      />
    );
  }

  return (
    <>
      <section id="auth-shell" className="auth-shell" hidden={authState === 'authenticated'}>
        <div className="auth-card">
          <h1>Home Dashboard</h1>
          <p className="auth-subtitle">Sign in to view your assigned locations and live readouts.</p>
          <form className="stacked-form" onSubmit={handleLogin}>
            <input
              id="login-username"
              type="text"
              placeholder="Username"
              autoComplete="username"
              value={authForm.username}
              onChange={event => setAuthForm(form => ({ ...form, username: event.target.value }))}
            />
            <input
              id="login-password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={authForm.password}
              onChange={event => setAuthForm(form => ({ ...form, password: event.target.value }))}
            />
            <button id="login-btn" type="submit" className="btn btn-add">Sign In</button>
          </form>
          <p id="auth-error" className="error-msg">{authError}</p>
        </div>
      </section>

      <main id="dashboard-shell" hidden={authState !== 'authenticated'}>
        <header>
          <h1>Home Dashboard</h1>
          <div id="connection-status" className={`badge ${status.kind}`}>{status.text}</div>
          <div className="user-context">
            <span className="user-context-label">User</span>
            <div id="current-user-name" className="user-name">{currentUserContext?.user?.name}</div>
            <div id="user-role" className={`badge user-role ${currentUserContext?.user?.role === 'admin' ? 'connected' : 'disconnected'}`}>
              {currentUserContext?.user?.role === 'admin' ? 'Admin' : 'Member'}
            </div>
            <div id="group-summary" className="group-summary">
              {currentUserContext?.user?.role === 'admin'
                ? `All groups: ${(currentUserContext?.groups || []).map(group => group.name).join(', ')}`
                : (currentUserContext?.groups || []).map(group => group.name).join(', ')}
            </div>
          </div>
          <button id="logout-btn" className="btn btn-cancel" onClick={handleLogout}>Log Out</button>
          <div id="time-format-toggle" className="theme-toggle time-format-toggle" title="Clock format">
            {['system', '24h', '12h'].map(option => (
              <button
                key={option}
                type="button"
                data-time-format={option}
                className={timeFormat === option ? 'active' : ''}
                onClick={() => setTimeFormat(option)}
              >
                {option === 'system' ? 'System' : option}
              </button>
            ))}
          </div>
          <div id="theme-toggle" className="theme-toggle" title="Toggle theme">
            {[
              { value: 'light', label: '☀' },
              { value: 'system', label: '⬤' },
              { value: 'dark', label: '☾' },
            ].map(option => (
              <button
                key={option.value}
                type="button"
                data-theme={option.value}
                className={theme === option.value ? 'active' : ''}
                onClick={() => setTheme(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>
        <nav className="page-nav" aria-label="Dashboard sections">
          <button
            id="nav-dashboard"
            type="button"
            className={`page-nav-link ${route === ROUTES.dashboard ? 'active' : ''}`}
            onClick={() => navigate(ROUTES.dashboard)}
          >
            Dashboard
          </button>
          <button
            id="nav-locations"
            type="button"
            className={`page-nav-link ${route === ROUTES.locations ? 'active' : ''}`}
            onClick={() => navigate(ROUTES.locations)}
          >
            Locations
          </button>
          {isAdmin ? (
            <button
              id="nav-access"
              type="button"
              className={`page-nav-link ${route === ROUTES.access ? 'active' : ''}`}
              onClick={() => navigate(ROUTES.access)}
            >
              Access
            </button>
          ) : null}
        </nav>

        <div className="page-shell" data-route={route}>
          {renderPage()}
        </div>
      </main>
    </>
  );
}
