import { getDocument, PDFWorker, Util, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Text extraction only. PDF bytes and the worker stay on this device; no PDF
// URL, external font/cmap URL, canvas renderer, JavaScript action or XFA form is
// loaded. The legacy distribution supplies Mozilla's browser compatibility
// shims without exposing Node or depending on a remote script.
export const limits = Object.freeze({
  maxFileBytes: 25 * 1024 * 1024,
  maxPages: 100,
  maxTextItems: 100_000,
  maxTextCharacters: 2_000_000,
  timeoutMs: 45_000,
});

function failure(code, message, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.name = code === 'PDF_ABORTED' ? 'AbortError' : 'PdfReadError';
  error.code = code;
  return error;
}

function abortError() {
  return failure('PDF_ABORTED', 'Lettura del PDF annullata.');
}

function readableError(error) {
  if (error?.code?.startsWith('PDF_')) return error;
  if (error?.name === 'PasswordException') {
    return failure('PDF_PASSWORD', 'Il PDF è protetto da password. Esporta una copia senza password e riprova.', error);
  }
  if (error?.name === 'AbortError') return abortError();
  return failure('PDF_INVALID', 'Non riesco a leggere questo PDF. Verifica il file oppure esporta di nuovo la ch list in PDF.', error);
}

// The item transform includes text rotation; the viewport includes page
// rotation, crop box and UserUnit. Bounding the four transformed text corners
// produces page coordinates with the origin at the top-left, including on a
// rotated page. Font ascent/descent improve row alignment over baseline-only y.
function textBox(item, style, viewport) {
  if (typeof item.str !== 'string' || !item.str.trim() || !Array.isArray(item.transform)) return null;
  const matrix = Util.transform(viewport.transform, item.transform);
  if (!matrix.every(Number.isFinite)) return null;
  const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  const fontHeight = Math.hypot(matrix[2], matrix[3]);
  const angle = Math.atan2(matrix[1], matrix[0]) + (style?.vertical ? Math.PI / 2 : 0);
  const advance = Math.abs(Number(style?.vertical ? item.height : item.width)) * scale;
  if (!Number.isFinite(advance) || !Number.isFinite(fontHeight) || fontHeight <= 0) return null;
  const ascent = Number.isFinite(style?.ascent) ? style.ascent : 0.8;
  const descent = Number.isFinite(style?.descent) ? style.descent : -0.2;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const vx = style?.vertical ? Math.sin(angle) : matrix[2] / fontHeight;
  const vy = style?.vertical ? -Math.cos(angle) : matrix[3] / fontHeight;
  const corners = [
    [matrix[4] + vx * ascent * fontHeight, matrix[5] + vy * ascent * fontHeight],
    [matrix[4] + vx * descent * fontHeight, matrix[5] + vy * descent * fontHeight],
    [matrix[4] + ux * advance + vx * ascent * fontHeight, matrix[5] + uy * advance + vy * ascent * fontHeight],
    [matrix[4] + ux * advance + vx * descent * fontHeight, matrix[5] + uy * advance + vy * descent * fontHeight],
  ];
  const left = Math.min(...corners.map(point => point[0]));
  const top = Math.min(...corners.map(point => point[1]));
  const right = Math.max(...corners.map(point => point[0]));
  const bottom = Math.max(...corners.map(point => point[1]));
  return { text: item.str.replace(/\u0000/g, ''), x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Read a local File/Blob as positioned text. pageNumber is 1-based; coordinates
 * and page dimensions are viewport units at scale 1, with y measured from top.
 * onProgress receives {phase,pageNumber,totalPages,loadedBytes,totalBytes}.
 * Rejects with an Italian message and a stable PDF_* error.code.
 */
export async function readFile(file, { signal, onProgress } = {}) {
  if (signal?.aborted) throw abortError();
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isFinite(file.size) || file.size <= 0) {
    throw failure('PDF_INVALID', 'Scegli un file PDF valido e non vuoto.');
  }
  if (file.size > limits.maxFileBytes) {
    throw failure('PDF_FILE_TOO_LARGE', 'Il PDF supera il limite di 25 MB. Esporta solo le pagine della ch list.');
  }
  let port, worker, loadingTask, activePage, textReader, timer, stopped;
  let totalPages = 0, pageNumber = 0, itemCount = 0, characterCount = 0;
  let rejectInterruption;
  const interruption = new Promise((_, reject) => { rejectInterruption = reject; });
  // Cancellation may arrive while a synchronous validation is in progress.
  interruption.catch(() => {});
  const stop = error => {
    if (stopped) return;
    stopped = error;
    rejectInterruption(error);
  };
  const onAbort = () => stop(abortError());
  const progress = (phase, loadedBytes = file.size) => {
    if (typeof onProgress !== 'function' || stopped) return;
    try { onProgress({ phase, pageNumber, totalPages, loadedBytes, totalBytes: file.size }); } catch { /* UI callbacks cannot strand the worker. */ }
  };
  const pending = promise => {
    if (stopped) { Promise.resolve(promise).catch(() => {}); return Promise.reject(stopped); }
    return Promise.race([promise, interruption]);
  };
  const workerFailed = () => stop(failure('PDF_WORKER', 'Il lettore PDF locale non si è avviato correttamente. Riapri Sculpt Wing e riprova.'));
  signal?.addEventListener('abort', onAbort, { once: true });
  timer = setTimeout(() => stop(failure('PDF_TIMEOUT', 'La lettura del PDF ha superato 45 secondi. Esporta solo le pagine della ch list e riprova.')), limits.timeoutMs);
  try {
    progress('reading', 0);
    const buffer = await pending(file.arrayBuffer());
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0 || buffer.byteLength > limits.maxFileBytes) {
      throw failure('PDF_INVALID', 'Il file PDF è vuoto o non valido.');
    }
    const data = new Uint8Array(buffer);
    const header = String.fromCharCode(...data.subarray(0, Math.min(1024, data.length)));
    if (!/%PDF-\d\.\d/.test(header)) throw failure('PDF_INVALID', 'Il file scelto non è un PDF valido.');
    if (stopped) throw stopped;
    progress('loading');
    if (stopped) throw stopped;
    try {
      // Supplying the port skips PDF.js's URL-origin inference, which otherwise
      // attempts a blob/CDN wrapper on Electron's sculpt://app custom scheme.
      port = new Worker(new URL('./pdf.worker.js', document.baseURI), { type: 'module' });
      port.addEventListener('error', workerFailed);
      port.addEventListener('messageerror', workerFailed);
      worker = new PDFWorker({ port, verbosity: VerbosityLevel.ERRORS });
    } catch (error) {
      throw failure('PDF_WORKER', 'Il lettore PDF locale non è disponibile in questa versione dell’app.', error);
    }
    loadingTask = getDocument({
      data,
      worker,
      useWorkerFetch: false,
      isEvalSupported: false,
      enableXfa: false,
      disableFontFace: true,
      disableWorkerRendering: true,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      useSystemFonts: false,
      useWasm: false,
      verbosity: VerbosityLevel.ERRORS,
    });
    loadingTask.onPassword = () => stop(failure('PDF_PASSWORD', 'Il PDF è protetto da password. Esporta una copia senza password e riprova.'));
    const documentProxy = await pending(loadingTask.promise);
    totalPages = documentProxy.numPages;
    if (!Number.isInteger(totalPages) || totalPages < 1) throw failure('PDF_INVALID', 'Il PDF non contiene pagine leggibili.');
    if (totalPages > limits.maxPages) {
      throw failure('PDF_TOO_MANY_PAGES', 'Il PDF contiene più di 100 pagine. Esporta solo le pagine della ch list.');
    }
    const pages = [];
    progress('extracting');
    if (stopped) throw stopped;
    for (let number = 1; number <= totalPages; number++) {
      activePage = await pending(documentProxy.getPage(number));
      const viewport = activePage.getViewport({ scale: 1 });
      const styles = Object.create(null), items = [];
      textReader = activePage.streamTextContent({ includeMarkedContent: false, disableNormalization: false }).getReader();
      while (true) {
        const chunk = await pending(textReader.read());
        if (chunk.done) break;
        Object.assign(styles, chunk.value.styles);
        for (const item of chunk.value.items) {
          const box = textBox(item, styles[item.fontName], viewport);
          if (!box || !box.text.trim()) continue;
          itemCount++; characterCount += box.text.length;
          if (itemCount > limits.maxTextItems || characterCount > limits.maxTextCharacters) {
            throw failure('PDF_TOO_COMPLEX', 'Il PDF contiene troppo testo per una ch list. Esporta soltanto le pagine con i canali.');
          }
          items.push(box);
        }
      }
      textReader.releaseLock(); textReader = null;
      pages.push({ pageNumber: number, width: viewport.width, height: viewport.height, items });
      activePage.cleanup(); activePage = null;
      pageNumber = number;
      progress('extracting');
      if (stopped) throw stopped;
    }
    if (!itemCount) {
      throw failure('PDF_NO_TEXT', 'Il PDF non contiene testo selezionabile: potrebbe essere una scansione. Esporta una ch list con testo oppure incolla il testo della lista.');
    }
    progress('complete');
    if (stopped) throw stopped;
    return { pages };
  } catch (error) {
    throw stopped || readableError(error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    if (textReader) {
      try { textReader.cancel().catch(() => {}); textReader.releaseLock(); } catch { /* Worker may already have failed. */ }
    }
    try { activePage?.cleanup(); } catch { /* Worker teardown owns the remaining page resources. */ }
    // A failed worker may never acknowledge PDF.js's asynchronous destroy.
    // Bound that acknowledgement, then terminate the explicitly owned port.
    let cleanupTimer;
    try {
      if (loadingTask) await Promise.race([
        loadingTask.destroy().catch(() => {}),
        new Promise(resolve => { cleanupTimer = setTimeout(resolve, 250); }),
      ]);
    } finally {
      clearTimeout(cleanupTimer);
      try { worker?.destroy(); } finally {
        port?.removeEventListener('error', workerFailed);
        port?.removeEventListener('messageerror', workerFailed);
        port?.terminate();
      }
    }
  }
}

globalThis.SculptPdfReader = Object.freeze({ readFile, limits });
