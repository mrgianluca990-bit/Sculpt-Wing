(() => {
  'use strict';
  const consoleNode = document.querySelector('.console');
  const upper = consoleNode?.querySelector('.mixer-row.outputs');
  const lower = consoleNode?.querySelector('.mixer-row.inputs');
  const divider = document.getElementById('sof-bar');
  if (!consoleNode || !upper || !lower || !divider || divider.querySelector('.row-resize-handle')) return;

  const STORAGE_KEY = 'sculpt-wing-row-layout-v1';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let preferredRatio = .5, displayedRatio = .5, drag = null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.version === 1 && typeof saved.ratio === 'number' && Number.isFinite(saved.ratio) && saved.ratio > 0 && saved.ratio < 1) preferredRatio = saved.ratio;
  } catch (_) { /* Layout remains usable when storage is unavailable. */ }

  const handle = document.createElement('button');
  handle.type = 'button'; handle.className = 'row-resize-handle';
  handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'horizontal');
  handle.setAttribute('aria-label', 'Altezza delle due righe del mixer');
  handle.setAttribute('aria-controls', 'outputs-scroll inputs-scroll');
  handle.title = 'Trascina per dividere le righe · frecce su/giù · doppio clic per 50 / 50';
  const grip = document.createElement('i'); grip.className = 'row-resize-grip'; grip.setAttribute('aria-hidden', 'true');
  const value = document.createElement('span'); value.className = 'row-resize-value'; value.setAttribute('aria-hidden', 'true');
  handle.append(grip, value); divider.insertBefore(handle, document.getElementById('exit-sof'));
  consoleNode.classList.add('row-resizable');

  function geometry() {
    // Row rectangles already exclude the macro rail, divider and safe areas.
    const total = upper.getBoundingClientRect().height + lower.getBoundingClientRect().height;
    const viewport = window.innerHeight || consoleNode.getBoundingClientRect().height;
    const minimum = viewport <= 440 ? 136 : viewport <= 620 ? 164 : 216;
    const low = total > 0 ? Math.min(.5, minimum / total) : .2;
    return { total, low, high: 1 - low };
  }
  function render() {
    const bounds = geometry();
    displayedRatio = clamp(preferredRatio, bounds.low, bounds.high);
    consoleNode.style.setProperty('--sculpt-upper-row', String(displayedRatio));
    consoleNode.style.setProperty('--sculpt-lower-row', String(1 - displayedRatio));
    const upperPercent = Math.round(displayedRatio * 100), lowerPercent = 100 - upperPercent;
    handle.setAttribute('aria-valuemin', String(Math.round(bounds.low * 100)));
    handle.setAttribute('aria-valuemax', String(Math.round(bounds.high * 100)));
    handle.setAttribute('aria-valuenow', String(upperPercent));
    handle.setAttribute('aria-valuetext', `Riga superiore ${upperPercent}%, riga inferiore ${lowerPercent}%`);
    value.textContent = `${upperPercent} / ${lowerPercent}`;
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ratio: Number(preferredRatio.toFixed(5)) })); } catch (_) {}
  }
  function setRatio(next) {
    const bounds = geometry(); preferredRatio = clamp(next, bounds.low, bounds.high); render();
  }
  function finish({ cancel = false } = {}) {
    if (!drag) return;
    const previous = drag; drag = null;
    if (cancel) { preferredRatio = previous.preferred; render(); }
    consoleNode.classList.remove('row-resizing'); handle.classList.remove('dragging');
    if (handle.hasPointerCapture?.(previous.pointer)) handle.releasePointerCapture(previous.pointer);
    persist();
  }
  function reset() { finish(); preferredRatio = .5; render(); persist(); }
  handle.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0 || event.isPrimary === false) return;
    const bounds = geometry(); if (bounds.total <= 0) return;
    drag = { pointer: event.pointerId, y: event.clientY, ratio: displayedRatio, preferred: preferredRatio, total: bounds.total };
    handle.focus({ preventScroll: true }); handle.setPointerCapture?.(event.pointerId);
    consoleNode.classList.add('row-resizing'); handle.classList.add('dragging');
    event.preventDefault(); event.stopPropagation();
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    setRatio(drag.ratio + (event.clientY - drag.y) / drag.total);
    event.preventDefault(); event.stopPropagation();
  });
  const endPointer = event => { if (drag?.pointer === event.pointerId) { finish(); event.stopPropagation(); } };
  handle.addEventListener('pointerup', endPointer);
  handle.addEventListener('pointercancel', endPointer);
  handle.addEventListener('lostpointercapture', endPointer);
  handle.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
  handle.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); reset(); });
  handle.addEventListener('keydown', event => {
    let next;
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish({ cancel: true }); return; }
    if (['Enter', '0'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); reset(); return; }
    const direction = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 }[event.key];
    if (direction !== undefined) next = displayedRatio + direction * (event.shiftKey ? .05 : .01);
    else if (event.key === 'Home') next = geometry().low;
    else if (event.key === 'End') next = geometry().high;
    else return;
    event.preventDefault(); event.stopPropagation(); setRatio(next); persist();
  });
  window.addEventListener('blur', () => finish());
  window.addEventListener('resize', render);
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(render);
    observer.observe(consoleNode); observer.observe(divider);
    const macros = consoleNode.querySelector('.macro-rail'); if (macros) observer.observe(macros);
  }
  render();
})();
