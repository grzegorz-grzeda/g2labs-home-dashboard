# g2labs-home-dashboard

A local web dashboard for ATC MiThermometer BLE sensor data. Subscribes to MQTT topics published by [blester](https://github.com/g2labs/blester), stores readings in MongoDB, and presents current values and historical plots in a browser.

## Features

- Parses ATC custom advertisement format from blester MQTT payloads
- Location management — assign sensor MACs to named rooms via the UI
- Historical charts with automatic resolution scaling (`$bucketAuto`) across any time range
- Shared y-axis scales across all location charts with ±5 padding
- Real-time card updates via Socket.io
- Light / dark / system theme toggle, persisted in localStorage

## Requirements

- Node.js 18+
- MongoDB (local or remote)
- An MQTT broker reachable from the machine running this app
- [blester](https://github.com/g2labs/blester) scanning ATC MiThermometer devices and publishing to the `atc` topic

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and adjust as needed (all values have defaults):

```bash
cp .env.example .env
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `MQTT_BROKER` | `mqtt://localhost:1883` | MQTT broker URL |
| `MQTT_TOPIC` | `atc` | Topic to subscribe to (also subscribes to `atc/#`) |
| `MONGODB_URI` | `mongodb://localhost:27017/home-dashboard` | MongoDB connection string |
| `PORT` | `3000` | HTTP port |
| `CHART_BUCKETS` | `300` | Max data points per chart (aggregated by MongoDB) |

## Running

```bash
# Production
npm start

# Development (auto-restarts on file change)
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Data flow

```
ATC MiThermometer (BLE)
        │
      blester
        │ MQTT  topic: atc
        ▼
  g2labs-home-dashboard
        │ saves raw readings
        ▼
     MongoDB
        │ $bucketAuto aggregation
        ▼
   Browser dashboard
```

## MQTT payload

Blester publishes BLE advertisement data as JSON. The dashboard decodes temperature, humidity, and battery from the ATC custom service UUID (`0000181a-0000-1000-8000-00805f9b34fb`):

```json
{
  "address": "AA:BB:CC:DD:EE:FF",
  "name": "ATC_XXXX",
  "rssi": -65,
  "service_data": {
    "0000181a-0000-1000-8000-00805f9b34fb": "aabbccddeeff09c12d6013880a"
  }
}
```

Readings from unassigned MACs are silently dropped. Assign a sensor to a location via the Locations panel in the UI.

## License

MIT
