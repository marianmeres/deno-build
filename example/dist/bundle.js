function randomId(prefix = "id") {
    return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}
function debounce(fn, delay) {
    let timeout;
    return (...args)=>{
        clearTimeout(timeout);
        timeout = setTimeout(()=>fn(...args), delay);
    };
}
class EventEmitter {
    listeners = new Map();
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return ()=>this.off(event, callback);
    }
    off(event, callback) {
        this.listeners.get(event)?.delete(callback);
    }
    emit(event, ...args) {
        this.listeners.get(event)?.forEach((cb)=>cb(...args));
    }
}
export { randomId as randomId, debounce as debounce, EventEmitter as EventEmitter };
const VERSION = "1.0.0";
function greet(name) {
    return `Hello, ${name}!`;
}
export { VERSION as VERSION };
export { greet as greet };
