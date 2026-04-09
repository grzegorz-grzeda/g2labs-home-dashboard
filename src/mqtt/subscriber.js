const mqtt = require('mqtt');
const { EventEmitter } = require('events');
const { parseBlesterPayload } = require('./atc');

class MqttSubscriber extends EventEmitter {
  constructor({ broker, topic }) {
    super();
    this.topic = topic;
    this.client = mqtt.connect(broker);

    this.client.on('connect', () => {
      console.log(`MQTT connected, subscribing to "${topic}"`);
      this.client.subscribe(topic);
      this.client.subscribe(`${topic}/#`);
    });

    this.client.on('message', (topic, payload) => {
      let data;
      try {
        data = JSON.parse(payload.toString());
      } catch {
        console.warn('Non-JSON MQTT message on', topic);
        return;
      }

      const reading = parseBlesterPayload(data);
      if (!reading) return;

      // Emit to whoever is listening (services/readings.js)
      this.emit('reading', reading);
    });

    this.client.on('error', err => console.error('MQTT error:', err));
  }
}

module.exports = MqttSubscriber;
