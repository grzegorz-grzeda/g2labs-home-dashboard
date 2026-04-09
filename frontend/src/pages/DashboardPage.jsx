import React from 'react';
import ChartBox from '../components/ChartBox';

function getTimeFormatOptions(timeFormat) {
  if (timeFormat === '24h') return { hour12: false };
  if (timeFormat === '12h') return { hour12: true };
  return {};
}

function formatLocalDateTime(ts, timeFormat) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...getTimeFormatOptions(timeFormat),
  });
}

export default function DashboardPage({
  locations,
  currentReadings,
  recentlyUpdatedIds,
  rangeHours,
  setRangeHours,
  historiesByLocation,
  scales,
  timeFormat,
}) {
  return (
    <>
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
    </>
  );
}
