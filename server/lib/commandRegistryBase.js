export class CommandRegistry {
  constructor(encoder, enc) {
    this.encoder = encoder;
    this.enc = enc;
    this.commands = new Map();
  }

  register(cmd, defaultBody = {}) {
    this.commands.set(cmd, (ack = 0, seq = 0, params = {}) => ({
      cmd,
      ack,
      seq,
      time: Date.now(),
      body: this.encoder?.bon?.encode
        ? this.encoder.bon.encode({ ...defaultBody, ...params })
        : { ...defaultBody, ...params },
    }));
    return this;
  }

  registerHeartbeat() {
    this.commands.set("heart_beat", (ack, seq) => ({
      cmd: "_sys/ack",
      ack,
      seq,
      time: Date.now(),
      body: {},
    }));
    return this;
  }

  encodePacket(raw) {
    if (this.encoder?.encode) {
      return this.encoder.encode(raw, this.enc || "x");
    }
    return JSON.stringify(raw);
  }

  build(cmd, ack, seq, params) {
    const fn = this.commands.get(cmd);
    if (!fn) throw new Error(`Unknown cmd: ${cmd}`);
    return fn(ack, seq, params);
  }
}
