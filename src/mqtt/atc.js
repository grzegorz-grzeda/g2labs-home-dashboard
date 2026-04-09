const ATC_UUID = '0000181a-0000-1000-8000-00805f9b34fb';

// Decode ATC custom advertisement service_data hex string.
// ATC format: 13 bytes
//   [0-5]  MAC address (skip)
//   [6-7]  Temperature int16 BE ÷10 → °C
//   [8]    Humidity uint8 %
//   [9]    Battery level uint8 %
//   [10-11] Battery voltage uint16 BE mV (skip)
//   [12]   Frame counter uint8
function decodeAtc(hex) {
  if (hex.length < 26) return null; // 13 bytes = 26 hex chars
  const buf = Buffer.from(hex, 'hex');
  return {
    temperature:  buf.readInt16BE(6) / 10,
    humidity:     buf.readUInt8(8),
    battery:      buf.readUInt8(9),
    frameCounter: buf.readUInt8(12),
  };
}

// Extract and decode ATC data from a blester MQTT payload.
// Returns { address, rssi, temperature, humidity, battery, frameCounter }
// or null if the payload is not a valid ATC advertisement.
function parseBlesterPayload(data) {
  const { address, rssi, service_data } = data;
  const hex = service_data?.[ATC_UUID];
  if (!hex) return null;
  const decoded = decodeAtc(hex);
  if (!decoded) return null;
  return { address: address.toUpperCase(), rssi, ...decoded };
}

module.exports = { parseBlesterPayload };
