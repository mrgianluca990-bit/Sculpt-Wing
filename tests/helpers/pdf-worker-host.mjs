// A Web Worker transport adapter for Node integration tests. The imported
// module below is the actual bundled PDF.js worker, not a parser mock.
import { parentPort, workerData } from 'node:worker_threads';

const listeners = new Map();
globalThis.self = globalThis;
globalThis.onmessage = null;
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
globalThis.addEventListener = (type, handler) => {
  if (type !== 'message') return;
  const listener = data => handler({ data });
  listeners.set(handler, listener);
  parentPort.on('message', listener);
};
globalThis.removeEventListener = (type, handler) => {
  if (type !== 'message') return;
  const listener = listeners.get(handler);
  if (listener) parentPort.off('message', listener);
  listeners.delete(handler);
};
await import(workerData.url);
