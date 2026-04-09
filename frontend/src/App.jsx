import React, { useEffect, useState } from 'react';
import {
  createGroup,
  createUser,
  updateUser,
} from './api';
import { useAuthSession } from './hooks/useAuthSession';
import { useDashboardData } from './hooks/useDashboardData';
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
  const [editUserDrafts, setEditUserDrafts] = useState({});
  const [newGroupDraft, setNewGroupDraft] = useState({ name: '', description: '' });
  const [newUserDraft, setNewUserDraft] = useState({ name: '', username: '', password: '', role: 'member', groupIds: [] });
  const {
    authState,
    authError,
    authForm,
    setAuthForm,
    currentUserContext,
    accessData,
    accessError,
    setAccessError,
    refreshUserContext,
    handleLogin,
    handleLogout: endSession,
  } = useAuthSession();
  const isAdmin = currentUserContext?.user?.role === 'admin';
  const { route, navigate } = useRoute(isAdmin);
  const {
    status,
    locations,
    currentReadings,
    historiesByLocation,
    rangeHours,
    setRangeHours,
    locationsError,
    locationDraft,
    setLocationDraft,
    editingLocationId,
    setEditingLocationId,
    editLocationDrafts,
    setEditLocationDrafts,
    recentlyUpdatedIds,
    scales,
    loadLocations,
    handleAddLocation,
    handleSaveLocation,
    handleDeleteLocation,
  } = useDashboardData({ authState, currentUserContext, route });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('time-format', timeFormat);
  }, [timeFormat]);

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

  async function handleCreateGroup() {
    try {
      await createGroup(newGroupDraft);
      setAccessError('');
      setNewGroupDraft({ name: '', description: '' });
      await refreshUserContext();
      await loadLocations();
    } catch (error) {
      setAccessError(error.error || error.message);
    }
  }

  async function handleLogout() {
    await endSession();
    navigate(ROUTES.dashboard);
  }

  async function handleCreateUser() {
    try {
      await createUser(newUserDraft);
      setAccessError('');
      setNewUserDraft({ name: '', username: '', password: '', role: 'member', groupIds: [] });
      await refreshUserContext();
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
      await refreshUserContext();
    } catch (error) {
      setAccessError(error.error || error.message);
    }
  }

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
        currentUserContext={currentUserContext}
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
