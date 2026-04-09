import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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

function formatChartTime(ts, timeFormat) {
  return formatWithLocalSettings(ts, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }, timeFormat);
}

export default function ChartBox({ location, readings, scales, timeFormat }) {
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
