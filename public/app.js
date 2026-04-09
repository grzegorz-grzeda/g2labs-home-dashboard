const socket = io();
const statusBadge = document.getElementById('connection-status');
const cardsContainer = document.getElementById('cards-container');
const chartsContainer = document.getElementById('charts-container');
const rangeSelect = document.getElementById('range-select');
const locationsTbody = document.getElementById('locations-tbody');
const locationsError = document.getElementById('locations-error');

// { locationId -> card element }
const cards = {};
// { locationId -> Chart instance }
const charts = {};
// { locationId -> location object }
let locationsMap = {};
// Current shared y-axis scales
let currentScales = null;

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

// ── Socket.io ─────────────────────────────────────────────────────────────────
socket.on('connect', () => {
  statusBadge.textContent = 'Live';
  statusBadge.className = 'badge connected';
});
socket.on('disconnect', () => {
  statusBadge.textContent = 'Disconnected';
  statusBadge.className = 'badge disconnected';
});
socket.on('reading', reading => {
  upsertCard(reading);
  appendToChart(reading);
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadLocations();
  const current = await fetch('/api/current').then(r => r.json());
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
    locations.map(loc => fetch(`/api/history/${loc._id}?hours=${hours}`).then(r => r.json()))
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
  const locations = await fetch('/api/locations').then(r => r.json());
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
  const res = await fetch(`/api/locations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sensorMac }),
  });
  if (!res.ok) { setError((await res.json()).error); return; }
  setError('');
  await loadLocations();
}

async function deleteLocation(id) {
  if (!confirm('Delete this location and all its readings?')) return;
  await fetch(`/api/locations/${id}`, { method: 'DELETE' });
  delete cards[id];
  document.querySelector(`[data-location-id="${id}"]`)?.remove();
  await loadLocations();
}

document.getElementById('add-location-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-name').value.trim();
  const sensorMac = document.getElementById('new-mac').value.trim();
  const res = await fetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sensorMac }),
  });
  if (!res.ok) { setError((await res.json()).error); return; }
  setError('');
  document.getElementById('new-name').value = '';
  document.getElementById('new-mac').value = '';
  await loadLocations();
});

rangeSelect.addEventListener('change', loadAllCharts);

function setError(msg) { locationsError.textContent = msg; }

function formatTime(ts) {
  if (!ts) return '';
  return formatLocalDateTime(ts);
}

init();
