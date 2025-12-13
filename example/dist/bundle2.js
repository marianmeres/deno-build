// example/src/utils.ts
function randomId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
var EventEmitter = class {
  listeners = /* @__PURE__ */ new Map();
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, /* @__PURE__ */ new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }
  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }
  emit(event, ...args) {
    this.listeners.get(event)?.forEach((cb) => cb(...args));
  }
};

// example/src/mod.ts
var VERSION = "1.0.0";
function greet(name) {
  return `Hello, ${name}!`;
}
export {
  EventEmitter,
  VERSION,
  debounce,
  greet,
  randomId
};
