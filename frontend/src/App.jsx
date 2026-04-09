import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
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

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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

function formatChartTime(ts, timeFormat) {
  return formatWithLocalSettings(ts, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }, timeFormat);
}

function getSelectedValues(selectElement) {
  return Array.from(selectElement.selectedOptions).map(option => option.value);
}

function ChartBox({ location, readings, scales, timeFormat }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    chartRef.current?.destroy();

    const pts = readings.length;
    const gridColor = cssVar('--border');
    const mutedColor = cssVar('--text-faint');
    const surfaceColor = cssVar('--surface');
    const textColor = cssVar('--text-muted');

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: readings.map(reading => new Date(reading.timestamp)),
        datasets: [
          {
            label: 'Temperature (°C)',
            data: readings.map(reading => reading.temperature),
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,0.08)',
            borderWidth: 2,
            pointRadius: pts > 200 ? 0 : 2,
            tension: 0.3,
            fill: true,
            yAxisID: 'yTemp',
          },
          {
            label: 'Humidity (%)',
            data: readings.map(reading => reading.humidity),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56,189,248,0.08)',
            borderWidth: 2,
            pointRadius: pts > 200 ? 0 : 2,
            tension: 0.3,
            fill: true,
            yAxisID: 'yHumid',
          },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, labels: { color: textColor, boxWidth: 12 } },
          tooltip: {
            backgroundColor: surfaceColor,
            borderColor: gridColor,
            borderWidth: 1,
            titleColor: textColor,
            bodyColor: cssVar('--text'),
            callbacks: {
              title: items => items[0] ? formatChartTime(items[0].parsed.x, timeFormat) : '',
              label: context => {
                const unit = context.datasetIndex === 0 ? '°C' : '%';
                return ` ${context.dataset.label}: ${context.parsed.y.toFixed(1)} ${unit}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: { tooltipFormat: 'MMM d, HH:mm' },
            grid: { color: gridColor },
            ticks: {
              color: mutedColor,
              maxTicksLimit: 8,
              callback: value => formatChartTime(value, timeFormat),
            },
          },
          yTemp: {
            position: 'left',
            min: scales?.tempMin,
            max: scales?.tempMax,
            grid: { color: gridColor },
            ticks: { color: '#f97316', callback: value => `${value} °C` },
          },
          yHumid: {
            position: 'right',
            min: scales?.humidMin,
            max: scales?.humidMax,
            grid: { drawOnChartArea: false },
            ticks: { color: '#38bdf8', callback: value => `${value} %` },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [location._id, readings, scales, timeFormat]);

  return (
    <div className="chart-box" id={`chart-box-${location._id}`}>
      <div className="chart-title">{location.name}</div>
      <canvas id={`chart-${location._id}`} ref={canvasRef} />
    </div>
  );
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
  const [newGroupDraft, setNewGroupDraft] = useState({ name: '', description: '' });
  const [newUserDraft, setNewUserDraft] = useState({ name: '', username: '', password: '', role: 'member', groupIds: [] });
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState({});
  const socketRef = useRef(null);
  const updateTimersRef = useRef({});

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
    if (authState !== 'authenticated' || locations.length === 0) return;
    loadAllCharts();
  }, [authState, locations, rangeHours, timeFormat]);

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

  async function handleSaveUser(userId, event) {
    const row = event.currentTarget.closest('tr');
    const role = row.querySelector('.user-role-input').value;
    const password = row.querySelector('.user-password-input').value;
    const groupIds = getSelectedValues(row.querySelector('.user-groups-input'));
    try {
      await updateUser(userId, { role, password, groupIds });
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

        <section id="current-readings">
          <h2>Current Readings</h2>
          <div id="cards-container">
            {locations.map(location => {
              const reading = currentReadings[location._id];
              if (!reading) return null;
              return (
                <div key={location._id} className={`card ${recentlyUpdatedIds[location._id] ? 'updated' : ''}`}>
                  <div className="device-name">{location.name}</div>
                  <div className="metrics">
                    <div className="metric">
                      <div className="value temp-value" data-field="temperature">{Number(reading.temperature).toFixed(1)}</div>
                      <div className="unit">°C</div>
                    </div>
                    <div className="metric">
                      <div className="value humid-value" data-field="humidity">{reading.humidity}</div>
                      <div className="unit">%RH</div>
                    </div>
                    {reading.battery != null ? (
                      <div className="metric">
                        <div className="value battery-value" data-field="battery">{reading.battery}</div>
                        <div className="unit">% bat</div>
                      </div>
                    ) : null}
                  </div>
                  <div className="updated-at" data-field="timestamp" data-timestamp={reading.timestamp}>
                    {formatLocalDateTime(reading.timestamp, timeFormat)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section id="history-section">
          <h2>History</h2>
          <div className="controls">
            <label>
              Range:
              <select id="range-select" value={rangeHours} onChange={event => setRangeHours(event.target.value)}>
                <option value="6">Last 6 h</option>
                <option value="24">Last 24 h</option>
                <option value="72">Last 3 days</option>
                <option value="168">Last 7 days</option>
              </select>
            </label>
          </div>
          <div id="charts-container">
            {locations.map(location => (
              <ChartBox
                key={location._id}
                location={location}
                readings={historiesByLocation[location._id] || []}
                scales={scales}
                timeFormat={timeFormat}
              />
            ))}
          </div>
        </section>

        <section id="locations-section">
          <h2>Locations</h2>
          <div className="table-scroll">
            <table id="locations-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Sensor MAC</th>
                  <th>Group</th>
                  <th />
                </tr>
              </thead>
              <tbody id="locations-tbody">
                {locations.map(location => {
                  const isEditing = editingLocationId === location._id;
                  const draft = editLocationDrafts[location._id] || {
                    name: location.name,
                    sensorMac: location.sensorMac,
                    groupId: location.groupId,
                  };
                  return (
                    <tr key={location._id} data-id={location._id}>
                      <td data-label="Name">
                        <span className="cell-text" style={{ display: isEditing ? 'none' : '' }}>{location.name}</span>
                        <input
                          className="cell-input"
                          type="text"
                          style={{ display: isEditing ? '' : 'none' }}
                          value={draft.name}
                          onChange={event => setEditLocationDrafts(previous => ({
                            ...previous,
                            [location._id]: { ...draft, name: event.target.value },
                          }))}
                        />
                      </td>
                      <td data-label="Sensor MAC">
                        <span className="cell-text" style={{ display: isEditing ? 'none' : '' }}>{location.sensorMac}</span>
                        <input
                          className="cell-input"
                          type="text"
                          style={{ display: isEditing ? '' : 'none' }}
                          value={draft.sensorMac}
                          onChange={event => setEditLocationDrafts(previous => ({
                            ...previous,
                            [location._id]: { ...draft, sensorMac: event.target.value },
                          }))}
                        />
                      </td>
                      <td data-label="Group">
                        <span className="cell-text" style={{ display: isEditing ? 'none' : '' }}>{location.groupName}</span>
                        <select
                          className="cell-input group-input"
                          style={{ display: isEditing ? '' : 'none' }}
                          value={draft.groupId}
                          onChange={event => setEditLocationDrafts(previous => ({
                            ...previous,
                            [location._id]: { ...draft, groupId: event.target.value },
                          }))}
                        >
                          {(currentUserContext?.groups || []).map(group => (
                            <option key={group._id} value={group._id}>{group.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="actions" data-label="Actions">
                        {isEditing ? (
                          <>
                            <button className="btn btn-save" onClick={() => handleSaveLocation(location._id)}>Save</button>
                            <button className="btn btn-cancel" onClick={() => setEditingLocationId(null)}>Cancel</button>
                          </>
                        ) : (
                          <button
                            className="btn btn-edit"
                            onClick={() => {
                              setEditingLocationId(location._id);
                              setEditLocationDrafts(previous => ({
                                ...previous,
                                [location._id]: {
                                  name: location.name,
                                  sensorMac: location.sensorMac,
                                  groupId: location.groupId,
                                },
                              }));
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button className="btn btn-delete" onClick={() => handleDeleteLocation(location._id)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td data-label="Name">
                    <input
                      id="new-name"
                      type="text"
                      placeholder="Room name"
                      value={locationDraft.name}
                      onChange={event => setLocationDraft(draft => ({ ...draft, name: event.target.value }))}
                    />
                  </td>
                  <td data-label="Sensor MAC">
                    <input
                      id="new-mac"
                      type="text"
                      placeholder="AA:BB:CC:DD:EE:FF"
                      value={locationDraft.sensorMac}
                      onChange={event => setLocationDraft(draft => ({ ...draft, sensorMac: event.target.value }))}
                    />
                  </td>
                  <td data-label="Group">
                    <select
                      id="new-group"
                      value={locationDraft.groupId}
                      onChange={event => setLocationDraft(draft => ({ ...draft, groupId: event.target.value }))}
                    >
                      {(currentUserContext?.groups || []).map(group => (
                        <option key={group._id} value={group._id}>{group.name}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Actions">
                    <button id="add-location-btn" className="btn btn-add" onClick={handleAddLocation}>Add</button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p id="locations-error" className="error-msg">{locationsError}</p>
        </section>

        <section id="access-section" hidden={currentUserContext?.user?.role !== 'admin'}>
          <h2>Access Management</h2>
          <div className="access-grid">
            <div className="access-panel">
              <h3>Groups</h3>
              <div id="groups-list" className="groups-list">
                {accessData.groups.map(group => (
                  <div key={group._id} className="group-pill-card">
                    <div className="group-pill-name">{group.name}</div>
                    <div className="group-pill-description">{group.description || 'No description'}</div>
                  </div>
                ))}
              </div>
              <div className="stacked-form">
                <input
                  id="group-name"
                  type="text"
                  placeholder="Group name"
                  value={newGroupDraft.name}
                  onChange={event => setNewGroupDraft(draft => ({ ...draft, name: event.target.value }))}
                />
                <input
                  id="group-description"
                  type="text"
                  placeholder="Description (optional)"
                  value={newGroupDraft.description}
                  onChange={event => setNewGroupDraft(draft => ({ ...draft, description: event.target.value }))}
                />
                <button id="add-group-btn" className="btn btn-add" onClick={handleCreateGroup}>Create Group</button>
              </div>
            </div>

            <div className="access-panel">
              <h3>Users</h3>
              <div className="table-scroll">
                <table id="users-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Password</th>
                      <th>Groups</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody id="users-tbody">
                    {accessData.users.map(user => (
                      <tr key={user._id} data-id={user._id}>
                        <td data-label="Name">{user.name}</td>
                        <td data-label="Username">{user.username}</td>
                        <td data-label="Role">
                          <select className="user-role-input" defaultValue={user.role}>
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td data-label="Password">
                          <input className="user-password-input" type="password" placeholder="Leave unchanged" />
                        </td>
                        <td data-label="Groups">
                          <select className="user-groups-input" multiple size={Math.min(Math.max(accessData.groups.length, 2), 6)} defaultValue={user.groupIds}>
                            {accessData.groups.map(group => (
                              <option key={group._id} value={group._id}>{group.name}</option>
                            ))}
                          </select>
                        </td>
                        <td data-label="Actions" className="actions">
                          <button className="btn btn-save-user" onClick={event => handleSaveUser(user._id, event)}>Save</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td data-label="Name">
                        <input
                          id="new-user-name"
                          type="text"
                          placeholder="Full name"
                          value={newUserDraft.name}
                          onChange={event => setNewUserDraft(draft => ({ ...draft, name: event.target.value }))}
                        />
                      </td>
                      <td data-label="Username">
                        <input
                          id="new-user-username"
                          type="text"
                          placeholder="username"
                          value={newUserDraft.username}
                          onChange={event => setNewUserDraft(draft => ({ ...draft, username: event.target.value }))}
                        />
                      </td>
                      <td data-label="Role">
                        <select
                          id="new-user-role"
                          value={newUserDraft.role}
                          onChange={event => setNewUserDraft(draft => ({ ...draft, role: event.target.value }))}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td data-label="Password">
                        <input
                          id="new-user-password"
                          type="password"
                          placeholder="Password"
                          value={newUserDraft.password}
                          onChange={event => setNewUserDraft(draft => ({ ...draft, password: event.target.value }))}
                        />
                      </td>
                      <td data-label="Groups">
                        <select
                          id="new-user-groups"
                          multiple
                          size={Math.min(Math.max(accessData.groups.length, 2), 6)}
                          value={newUserDraft.groupIds}
                          onChange={event => setNewUserDraft(draft => ({ ...draft, groupIds: getSelectedValues(event.target) }))}
                        >
                          {accessData.groups.map(group => (
                            <option key={group._id} value={group._id}>{group.name}</option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Actions">
                        <button id="add-user-btn" className="btn btn-add" onClick={handleCreateUser}>Add User</button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
          <p id="access-error" className="error-msg">{accessError}</p>
        </section>
      </main>
    </>
  );
}
