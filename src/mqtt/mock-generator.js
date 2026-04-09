const { EventEmitter } = require('events');

class MockReadingGenerator extends EventEmitter {
  constructor({ sensorMacs, intervalMs = 5000, now = () => new Date() }) {
    super();
    this.sensorMacs = sensorMacs;
    this.intervalMs = intervalMs;
    this.now = now;
    this.interval = null;
    this.state = new Map();
  }

  start() {
    if (this.interval || this.sensorMacs.length === 0) return;

    this.interval = setInterval(() => {
      this.sensorMacs.forEach((sensorMac, index) => {
        this.emit('reading', this.nextReading(sensorMac, index));
      });
    }, this.intervalMs);
  }

  stop() {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  nextReading(sensorMac, index) {
    const previous = this.state.get(sensorMac) || {
      step: 0,
      frameCounter: index % 256,
      battery: 96 - index * 3,
    };
    const step = previous.step + 1;
    const frameCounter = (previous.frameCounter + 1) % 256;
    const temperature = Number((20.5 + index * 0.7 + Math.sin(step / 4) * 1.3).toFixed(1));
    const humidity = Math.max(20, Math.min(80, Math.round(46 + index * 5 + Math.cos(step / 5) * 7)));
    const battery = Math.max(40, previous.battery - (step % 24 === 0 ? 1 : 0));
    const reading = {
      address: sensorMac,
      rssi: -58 - index * 3,
      temperature,
      humidity,
      battery,
      frameCounter,
      timestamp: this.now(),
    };

    this.state.set(sensorMac, { step, frameCounter, battery });
    return reading;
  }
}

module.exports = MockReadingGenerator;
