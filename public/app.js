let socket;
const authShell = document.getElementById('auth-shell');
const dashboardShell = document.getElementById('dashboard-shell');
const statusBadge = document.getElementById('connection-status');
const cardsContainer = document.getElementById('cards-container');
const chartsContainer = document.getElementById('charts-container');
const rangeSelect = document.getElementById('range-select');
const locationsTbody = document.getElementById('locations-tbody');
const locationsError = document.getElementById('locations-error');
const currentUserName = document.getElementById('current-user-name');
const userRole = document.getElementById('user-role');
const groupSummary = document.getElementById('group-summary');
const newGroupSelect = document.getElementById('new-group');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authError = document.getElementById('auth-error');
const accessSection = document.getElementById('access-section');
const groupsList = document.getElementById('groups-list');
const usersTbody = document.getElementById('users-tbody');
const accessError = document.getElementById('access-error');
const addGroupBtn = document.getElementById('add-group-btn');
const addUserBtn = document.getElementById('add-user-btn');
const newUserGroupsSelect = document.getElementById('new-user-groups');

// { locationId -> card element }
const cards = {};
// { locationId -> Chart instance }
const charts = {};
// { locationId -> location object }
let locationsMap = {};
// Current shared y-axis scales
let currentScales = null;
let currentUserContext = null;

// ── Theme ─────────────────────────────────────────────────────────────────────
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getTimeFormatOptions() {
  const timeFormat = localStorage.getItem('time-format') || 'system';
  if (timeFormat === '24h') return { hour12: false };
  if (timeFormat === '12h') return { hour12: true };
  return {};
}

function formatWithLocalSettings(ts, options) {
  return new Date(ts).toLocaleString(undefined, {
    ...options,
    ...getTimeFormatOptions(),
  });
}

function formatLocalDateTime(ts) {
  return formatWithLocalSettings(ts, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatChartTime(ts) {
  return formatWithLocalSettings(ts, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  document.querySelectorAll('#theme-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  // Rebuild charts so Chart.js picks up new colors
  if (Object.keys(locationsMap).length > 0) loadAllCharts();
}

document.querySelectorAll('#theme-toggle button').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

// Restore saved preference (default: system)
applyTheme(localStorage.getItem('theme') || 'system');

function refreshVisibleTimes() {
  document.querySelectorAll('.updated-at[data-timestamp]').forEach(el => {
    el.textContent = formatTime(el.dataset.timestamp);
  });
  if (Object.keys(locationsMap).length > 0) loadAllCharts();
}

function applyTimeFormat(timeFormat) {
  localStorage.setItem('time-format', timeFormat);
  document.querySelectorAll('.time-format-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.timeFormat === timeFormat);
  });
  refreshVisibleTimes();
}

document.querySelectorAll('.time-format-toggle button').forEach(btn => {
  btn.addEventListener('click', () => applyTimeFormat(btn.dataset.timeFormat));
});

applyTimeFormat(localStorage.getItem('time-format') || 'system');

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  applyShellState(false);
  const loaded = await loadUserContext();
  if (loaded) await reloadDashboard();
}

async function loadUserContext() {
  const response = await apiFetch('/api/me');
  if (response.status === 401) return false;
  if (!response.ok) {
    throw new Error(`Failed to load user context (${response.status})`);
  }
  const me = await response.json();
  await applyAuthenticatedContext(me);
  return true;
}

async function applyAuthenticatedContext(context) {
  currentUserContext = context;
  applyShellState(true);
  renderCurrentUser(context);
  renderGroupOptions(context.groups);
  try {
    await loadAdminAccess();
  } catch (err) {
    console.error('Failed to load admin access UI:', err);
    setAccessError(err.message || 'Failed to load access management');
  }
}

function renderCurrentUser(context) {
  if (!groupSummary || !currentUserName) return;
  currentUserName.textContent = context.user.name;
  if (userRole) {
    userRole.textContent = context.user.role === 'admin' ? 'Admin' : 'Member';
    userRole.className = `badge user-role ${context.user.role === 'admin' ? 'connected' : 'disconnected'}`;
  }
  groupSummary.textContent = context.user.role === 'admin'
    ? `All groups: ${context.groups.map(group => group.name).join(', ')}`
    : context.groups.map(group => group.name).join(', ');
}

function renderGroupOptions(groups) {
  if (!newGroupSelect) return;
  newGroupSelect.innerHTML = groups
    .map(group => `<option value="${group._id}">${group.name}</option>`)
    .join('');
}

function applyShellState(isAuthenticated) {
  authShell.hidden = isAuthenticated;
  dashboardShell.hidden = !isAuthenticated;
  if (!isAuthenticated) {
    statusBadge.textContent = 'Disconnected';
    statusBadge.className = 'badge disconnected';
  }
}

async function loadAdminAccess() {
  if (!accessSection) return;
  if (currentUserContext.user.role !== 'admin') {
    accessSection.hidden = true;
    groupsList.innerHTML = '';
    usersTbody.innerHTML = '';
    setAccessError('');
    return;
  }

  const response = await apiFetch('/api/admin/access');
  if (!response.ok) {
    throw new Error(`Failed to load access management (${response.status})`);
  }

  const access = await response.json();
  accessSection.hidden = false;
  renderGroupsList(access.groups);
  renderUsersTable(access.users, access.groups);
  renderNewUserGroupOptions(access.groups);
}

function renderGroupsList(groups) {
  groupsList.innerHTML = groups
    .map(group => `
      <div class="group-pill-card">
        <div class="group-pill-name">${group.name}</div>
        <div class="group-pill-description">${group.description || 'No description'}</div>
      </div>
    `)
    .join('');
}

function renderUsersTable(users, groups) {
  usersTbody.innerHTML = '';
  users.forEach(user => {
    const tr = document.createElement('tr');
    tr.dataset.id = user._id;
    tr.innerHTML = `
      <td data-label="Name">${user.name}</td>
      <td data-label="Username">${user.username}</td>
      <td data-label="Role">
        <select class="user-role-input">
          <option value="member" ${user.role === 'member' ? 'selected' : ''}>Member</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td data-label="Password"><input class="user-password-input" type="password" placeholder="Leave unchanged" /></td>
      <td data-label="Groups">${renderUserGroupMultiSelect(user.groupIds, groups)}</td>
      <td data-label="Actions" class="actions"><button class="btn btn-save-user">Save</button></td>
    `;
    tr.querySelector('.btn-save-user').addEventListener('click', () => saveUserAccess(tr));
    usersTbody.appendChild(tr);
  });
}

function renderUserGroupMultiSelect(selectedGroupIds, groups) {
  const options = groups.map(group => `
    <option value="${group._id}" ${selectedGroupIds.includes(group._id) ? 'selected' : ''}>${group.name}</option>
  `).join('');
  return `<select class="user-groups-input" multiple size="${Math.min(Math.max(groups.length, 2), 6)}">${options}</select>`;
}

function renderNewUserGroupOptions(groups) {
  newUserGroupsSelect.innerHTML = groups
    .map(group => `<option value="${group._id}">${group.name}</option>`)
    .join('');
  newUserGroupsSelect.size = Math.min(Math.max(groups.length, 2), 6);
}

function getSelectedValues(select) {
  return [...select.selectedOptions].map(option => option.value);
}

function resetDashboardState() {
  Object.values(charts).forEach(chart => chart.destroy());
  Object.keys(charts).forEach(key => delete charts[key]);
  Object.keys(cards).forEach(key => delete cards[key]);
  locationsMap = {};
  currentScales = null;
  cardsContainer.innerHTML = '';
  chartsContainer.innerHTML = '';
  locationsTbody.innerHTML = '';
}

async function reloadDashboard() {
  resetDashboardState();
  connectSocket();
  await loadLocations();
  const currentResponse = await apiFetch('/api/current');
  if (!currentResponse.ok) {
    throw new Error(`Failed to load current readings (${currentResponse.status})`);
  }
  const current = await currentResponse.json();
  current.forEach(({ location, reading }) => {
    if (reading) upsertCard({ locationId: location._id, locationName: location.name, ...reading });
  });
}

// ── Cards ─────────────────────────────────────────────────────────────────────
function upsertCard({ locationId, locationName, temperature, humidity, battery, timestamp }) {
  if (!cards[locationId]) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="device-name">${locationName}</div>
      <div class="metrics">
        <div class="metric">
          <div class="value temp-value" data-field="temperature">${temperature.toFixed(1)}</div>
          <div class="unit">°C</div>
        </div>
        <div class="metric">
          <div class="value humid-value" data-field="humidity">${humidity}</div>
          <div class="unit">%RH</div>
        </div>
        ${battery != null ? `
        <div class="metric">
          <div class="value battery-value" data-field="battery">${battery}</div>
          <div class="unit">% bat</div>
        </div>` : ''}
      </div>
      <div class="updated-at" data-field="timestamp" data-timestamp="${timestamp}">${formatTime(timestamp)}</div>
    `;
    cardsContainer.appendChild(card);
    cards[locationId] = card;
  } else {
    const card = cards[locationId];
    card.querySelector('[data-field="temperature"]').textContent = temperature.toFixed(1);
    card.querySelector('[data-field="humidity"]').textContent = humidity;
    const bEl = card.querySelector('[data-field="battery"]');
    if (bEl && battery != null) bEl.textContent = battery;
    const timestampEl = card.querySelector('[data-field="timestamp"]');
    timestampEl.dataset.timestamp = timestamp;
    timestampEl.textContent = formatTime(timestamp);
    card.classList.add('updated');
    setTimeout(() => card.classList.remove('updated'), 1500);
  }
}

// ── Charts ────────────────────────────────────────────────────────────────────
async function loadAllCharts() {
  const hours = rangeSelect.value;
  const locations = Object.values(locationsMap);

  // Fetch all readings in parallel, then compute shared scales
  const allReadings = await Promise.all(
    locations.map(loc => apiFetch(`/api/history/${loc._id}?hours=${hours}`).then(r => r.json()))
  );

  const temps = allReadings.flat().map(r => r.temperature);
  const humids = allReadings.flat().map(r => r.humidity);

  const scales = temps.length > 0 ? {
    tempMin: Math.floor(Math.min(...temps)) - 5,
    tempMax: Math.ceil(Math.max(...temps)) + 5,
    humidMin: Math.floor(Math.min(...humids)) - 5,
    humidMax: Math.ceil(Math.max(...humids)) + 5,
  } : null;

  currentScales = scales;
  locations.forEach((loc, i) => renderLocationChart(loc, allReadings[i], scales));
}

function renderLocationChart(loc, readings, scales) {
  // Create chart box if it doesn't exist yet
  if (!document.getElementById(`chart-box-${loc._id}`)) {
    const box = document.createElement('div');
    box.className = 'chart-box';
    box.id = `chart-box-${loc._id}`;
    box.innerHTML = `<div class="chart-title">${loc.name}</div><canvas id="chart-${loc._id}"></canvas>`;
    chartsContainer.appendChild(box);
  }

  if (charts[loc._id]) charts[loc._id].destroy();
  charts[loc._id] = buildChart(`chart-${loc._id}`, readings, scales);
}

function buildChart(canvasId, readings, scales) {
  const pts = readings.length;
  const gridColor   = cssVar('--border');
  const mutedColor  = cssVar('--text-faint');
  const surfaceColor = cssVar('--surface');
  const textColor   = cssVar('--text-muted');

  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: readings.map(r => new Date(r.timestamp)),
      datasets: [
        {
          label: 'Temperature (°C)',
          data: readings.map(r => r.temperature),
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
          data: readings.map(r => r.humidity),
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
            title: items => items[0] ? formatChartTime(items[0].parsed.x) : '',
            label: ctx => {
              const unit = ctx.datasetIndex === 0 ? '°C' : '%';
              return ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} ${unit}`;
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
            callback: value => formatChartTime(value),
          },
        },
        yTemp: {
          position: 'left',
          min: scales?.tempMin,
          max: scales?.tempMax,
          grid: { color: gridColor },
          ticks: { color: '#f97316', callback: v => `${v} °C` },
        },
        yHumid: {
          position: 'right',
          min: scales?.humidMin,
          max: scales?.humidMax,
          grid: { drawOnChartArea: false },
          ticks: { color: '#38bdf8', callback: v => `${v} %` },
        },
      },
    },
  });
}

function appendToChart(reading) {
  const chart = charts[reading.locationId];
  if (!chart) return;
  const { temperature, humidity } = reading;
  chart.data.labels.push(new Date(reading.timestamp));
  chart.data.datasets[0].data.push(temperature);
  chart.data.datasets[1].data.push(humidity);

  const s = currentScales;
  if (!s ||
      temperature < s.tempMin + 5 || temperature > s.tempMax - 5 ||
      humidity   < s.humidMin + 5 || humidity   > s.humidMax - 5) {
    recalcScalesAndUpdate();
  } else {
    chart.update('none');
  }
}

function recalcScalesAndUpdate() {
  const allTemps = [];
  const allHumids = [];
  Object.values(charts).forEach(chart => {
    chart.data.datasets[0].data.forEach(v => allTemps.push(v));
    chart.data.datasets[1].data.forEach(v => allHumids.push(v));
  });

  if (allTemps.length === 0) return;

  currentScales = {
    tempMin:  Math.floor(Math.min(...allTemps))  - 5,
    tempMax:  Math.ceil(Math.max(...allTemps))   + 5,
    humidMin: Math.floor(Math.min(...allHumids)) - 5,
    humidMax: Math.ceil(Math.max(...allHumids))  + 5,
  };

  Object.values(charts).forEach(chart => {
    chart.options.scales.yTemp.min  = currentScales.tempMin;
    chart.options.scales.yTemp.max  = currentScales.tempMax;
    chart.options.scales.yHumid.min = currentScales.humidMin;
    chart.options.scales.yHumid.max = currentScales.humidMax;
    chart.update('none');
  });
}

// ── Locations CRUD ────────────────────────────────────────────────────────────
async function loadLocations() {
  const response = await apiFetch('/api/locations');
  if (!response.ok) {
    throw new Error(`Failed to load locations (${response.status})`);
  }
  const locations = await response.json();
  locationsMap = Object.fromEntries(locations.map(l => [l._id, l]));
  renderLocationsTable(locations);

  // Remove chart boxes for deleted locations
  [...chartsContainer.children].forEach(box => {
    const id = box.id.replace('chart-box-', '');
    if (!locationsMap[id]) {
      if (charts[id]) { charts[id].destroy(); delete charts[id]; }
      box.remove();
    }
  });

  await loadAllCharts();
}

function renderLocationsTable(locations) {
  locationsTbody.innerHTML = '';
  locations.forEach(loc => {
    const tr = document.createElement('tr');
    tr.dataset.id = loc._id;
    tr.innerHTML = `
      <td data-label="Name"><span class="cell-text">${loc.name}</span><input class="cell-input" type="text" value="${loc.name}" style="display:none" /></td>
      <td data-label="Sensor MAC"><span class="cell-text">${loc.sensorMac}</span><input class="cell-input" type="text" value="${loc.sensorMac}" style="display:none" /></td>
      <td data-label="Group"><span class="cell-text">${loc.groupName}</span>${renderGroupSelect(loc.groupId, 'display:none')}</td>
      <td class="actions" data-label="Actions">
        <button class="btn btn-edit">Edit</button>
        <button class="btn btn-save" style="display:none">Save</button>
        <button class="btn btn-cancel" style="display:none">Cancel</button>
        <button class="btn btn-delete">Delete</button>
      </td>
    `;
    tr.querySelector('.btn-edit').addEventListener('click', () => startEdit(tr));
    tr.querySelector('.btn-save').addEventListener('click', () => saveEdit(tr, loc._id));
    tr.querySelector('.btn-cancel').addEventListener('click', () => cancelEdit(tr));
    tr.querySelector('.btn-delete').addEventListener('click', () => deleteLocation(loc._id));
    locationsTbody.appendChild(tr);
  });
}

function renderGroupSelect(selectedGroupId, style = '') {
  const options = currentUserContext.groups
    .map(group => `<option value="${group._id}" ${group._id === selectedGroupId ? 'selected' : ''}>${group.name}</option>`)
    .join('');
  return `<select class="cell-input group-input" style="${style}">${options}</select>`;
}

function startEdit(tr) {
  tr.querySelectorAll('.cell-text').forEach(el => el.style.display = 'none');
  tr.querySelectorAll('.cell-input').forEach(el => el.style.display = '');
  tr.querySelector('.btn-edit').style.display = 'none';
  tr.querySelector('.btn-save').style.display = '';
  tr.querySelector('.btn-cancel').style.display = '';
}

function cancelEdit(tr) {
  tr.querySelectorAll('.cell-text').forEach(el => el.style.display = '');
  tr.querySelectorAll('.cell-input').forEach(el => el.style.display = 'none');
  tr.querySelector('.btn-edit').style.display = '';
  tr.querySelector('.btn-save').style.display = 'none';
  tr.querySelector('.btn-cancel').style.display = 'none';
  setError('');
}

async function saveEdit(tr, id) {
  const inputs = tr.querySelectorAll('.cell-input');
  const name = inputs[0].value.trim();
  const sensorMac = inputs[1].value.trim();
  const groupId = inputs[2].value;
  const res = await apiFetch(`/api/locations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sensorMac, groupId }),
  });
  if (!res.ok) { setError((await res.json()).error); return; }
  setError('');
  await loadLocations();
}

async function deleteLocation(id) {
  if (!confirm('Delete this location and all its readings?')) return;
  await apiFetch(`/api/locations/${id}`, { method: 'DELETE' });
  delete cards[id];
  document.querySelector(`[data-location-id="${id}"]`)?.remove();
  await loadLocations();
}

document.getElementById('add-location-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-name').value.trim();
  const sensorMac = document.getElementById('new-mac').value.trim();
  const groupId = newGroupSelect.value;
  const res = await apiFetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sensorMac, groupId }),
  });
  if (!res.ok) { setError((await res.json()).error); return; }
  setError('');
  document.getElementById('new-name').value = '';
  document.getElementById('new-mac').value = '';
  await loadLocations();
});

addGroupBtn.addEventListener('click', async () => {
  const name = document.getElementById('group-name').value.trim();
  const description = document.getElementById('group-description').value.trim();
  const response = await apiFetch('/api/admin/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) {
    setAccessError((await response.json()).error);
    return;
  }
  setAccessError('');
  document.getElementById('group-name').value = '';
  document.getElementById('group-description').value = '';
  await loadUserContext();
  await loadLocations();
});

addUserBtn.addEventListener('click', async () => {
  const name = document.getElementById('new-user-name').value.trim();
  const username = document.getElementById('new-user-username').value.trim();
  const password = document.getElementById('new-user-password').value;
  const role = document.getElementById('new-user-role').value;
  const groupIds = getSelectedValues(newUserGroupsSelect);
  const response = await apiFetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, username, password, role, groupIds }),
  });
  if (!response.ok) {
    setAccessError((await response.json()).error);
    return;
  }
  setAccessError('');
  document.getElementById('new-user-name').value = '';
  document.getElementById('new-user-username').value = '';
  document.getElementById('new-user-password').value = '';
  document.getElementById('new-user-role').value = 'member';
  [...newUserGroupsSelect.options].forEach(option => {
    option.selected = false;
  });
  await loadUserContext();
});

async function saveUserAccess(tr) {
  const role = tr.querySelector('.user-role-input').value;
  const password = tr.querySelector('.user-password-input').value;
  const groupIds = getSelectedValues(tr.querySelector('.user-groups-input'));
  const response = await apiFetch(`/api/admin/users/${tr.dataset.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, password, groupIds }),
  });
  if (!response.ok) {
    setAccessError((await response.json()).error);
    return;
  }
  setAccessError('');
  await loadUserContext();
}

rangeSelect.addEventListener('change', loadAllCharts);

function setError(msg) { locationsError.textContent = msg; }
function setAccessError(msg) { accessError.textContent = msg; }
function setAuthError(msg) { authError.textContent = msg; }

loginBtn.addEventListener('click', async () => {
  try {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUsername.value.trim(),
        password: loginPassword.value,
      }),
    });

    if (!response.ok) {
      setAuthError((await response.json()).error);
      return;
    }

    const context = await response.json();
    setAuthError('');
    loginPassword.value = '';
    await applyAuthenticatedContext(context);
    await reloadDashboard();
  } catch (err) {
    console.error('Login flow failed:', err);
    setAuthError(err.message || 'Login failed');
  }
});

logoutBtn.addEventListener('click', async () => {
  if (socket) socket.disconnect();
  await apiFetch('/api/auth/logout', { method: 'POST' });
  currentUserContext = null;
  resetDashboardState();
  applyShellState(false);
});

function formatTime(ts) {
  if (!ts) return '';
  return formatLocalDateTime(ts);
}

init().catch(err => {
  console.error('Dashboard init failed:', err);
  if (!dashboardShell.hidden) {
    statusBadge.textContent = 'Error';
    statusBadge.className = 'badge disconnected';
    setError(err.message || 'Failed to initialize dashboard');
  } else {
    setAuthError(err.message || 'Failed to initialize dashboard');
  }
});

async function apiFetch(path, options = {}) {
  return fetch(path, { ...options, credentials: 'same-origin' });
}

function connectSocket() {
  if (socket) socket.disconnect();
  socket = io();

  socket.on('connect', () => {
    statusBadge.textContent = 'Live';
    statusBadge.className = 'badge connected';
  });
  socket.on('disconnect', () => {
    statusBadge.textContent = 'Disconnected';
    statusBadge.className = 'badge disconnected';
  });
  socket.on('connect_error', err => {
    statusBadge.textContent = 'Connection Error';
    statusBadge.className = 'badge disconnected';
    console.error('Socket connection error:', err.message);
  });
  socket.on('reading', reading => {
    upsertCard(reading);
    appendToChart(reading);
  });
}
