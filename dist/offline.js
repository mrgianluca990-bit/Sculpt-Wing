(() => {
  'use strict';
  if(window.SculptNative?.available){
    const label=document.getElementById('offline-status');if(label)label.textContent='App installata';
    document.getElementById('offline-button')?.classList.add('ready');
    window.SculptOffline={openHelp(){const U=window.SculptUI,box=U.el('div');box.append(U.el('p','desk-note','L’interfaccia è inclusa nell’app e funziona senza Internet. Per controllare la WING collega il dispositivo e il banco alla stessa rete del router.'),U.button('Connessione WING',()=>{modal.close();U.open('connection');},'desk-primary'));const modal=U.modal('Sculpt Wing installato',box);}};
    return;
  }
  const VERSION = 'sculpt-control-v24';
  let registration = null;
  let state = { mode: 'checking', message: 'Verifica offline…', detail: '' };
  let refreshTask = null;
  let refreshAgain = false;
  let dialog = null;
  let lastFocus = null;

  const isHomeApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

  function setStatus(mode, message, detail = '') {
    state = { mode, message, detail };
    const label = document.getElementById('offline-status');
    if (label) {
      label.textContent = message;
      label.dataset.status = mode;
      label.title = detail;
      label.setAttribute('aria-live', 'polite');
    }
    if (dialog) updateHelp();
    window.dispatchEvent(new CustomEvent('sculpt-offline-status', { detail: { ...state } }));
  }

  function requestVerification(worker, type = 'SCULPT_VERIFY_OFFLINE') {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => {
        channel.port1.close();
        reject(new Error('La verifica non ha risposto.'));
      }, type === 'SCULPT_REPAIR_CACHE' ? 25000 : 7000);
      channel.port1.onmessage = event => {
        window.clearTimeout(timeout);
        channel.port1.close();
        if (event.data?.type !== 'SCULPT_OFFLINE_STATUS') return reject(new Error('Risposta non valida.'));
        resolve(event.data);
      };
      worker.postMessage({ type }, [channel.port2]);
    });
  }

  async function refreshStatus() {
    if (refreshTask) { refreshAgain = true; return refreshTask; }
    refreshTask = (async () => {
      if (!registration?.active || registration.active.state !== 'activated') return false;
      const worker = registration.active;
      try {
        const result = await requestVerification(worker);
        // A controllerchange may arrive while the old worker is replying.
        // Retry against the current worker instead of leaving a stale status.
        if (registration.active !== worker) { refreshAgain = true; return false; }
        if (result.ready && result.version === VERSION && worker.state === 'activated') {
          setStatus('ready', 'Offline pronto', isHomeApp()
            ? 'Interfaccia e icone verificate in questa app. Puoi provare anche in modalità aereo.'
            : 'Interfaccia e icone verificate in questo browser. Dopo l’aggiunta alla Home, apri la nuova icona una volta online.');
          return true;
        }
        if (result.ready && typeof result.version === 'string' && result.version.startsWith('sculpt-control-v')) {
          const currentNumber = Number(VERSION.split('-v').at(-1));
          const availableNumber = Number(result.version.split('-v').at(-1));
          if (availableNumber < currentNumber) {
            setStatus('preparing', 'Aggiornamento in corso…', 'Attendo l’attivazione della nuova versione già scaricata.');
          } else {
            setStatus('update', 'Aggiornamento pronto', 'La nuova versione è salvata e verificata. Tocca «Apri nuova versione» per aggiornare quando hai finito di regolare i controlli.');
          }
          return true;
        }
        setStatus('unavailable', 'Offline non pronto', 'Alcune risorse non sono disponibili. Riapri la demo con Internet attivo e riprova.');
      } catch {
        if (registration.active !== worker) { refreshAgain = true; return false; }
        setStatus('unavailable', 'Offline non pronto', 'Non è stato possibile verificare i file sul dispositivo. Tieni Internet attivo e riprova.');
      }
      return false;
    })();
    try { return await refreshTask; } finally {
      refreshTask = null;
      if (refreshAgain) { refreshAgain = false; queueMicrotask(refreshStatus); }
    }
  }

  async function start() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') {
      setStatus('unsupported', 'Anteprima locale', 'Per installare la versione offline su iPhone, apri il link della demo in Safari o Chrome con Internet attivo.');
      return;
    }
    setStatus('preparing', 'Preparazione offline…', 'Sto salvando l’interfaccia su questo dispositivo.');
    try {
      registration = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), {
        scope: new URL('./', document.baseURI).href,
        updateViaCache: 'none'
      });
      const observeInstallingWorker = () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') refreshStatus();
          if (worker.state === 'redundant' && !registration.active) {
            setStatus('unavailable', 'Offline non pronto', 'Il salvataggio dei file non è riuscito. Controlla la connessione e riprova.');
          }
        });
      };
      registration.addEventListener('updatefound', observeInstallingWorker);
      observeInstallingWorker();
      if (registration.active?.state === 'activated') {
        await refreshStatus();
      } else {
        let timeout;
        try {
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Installazione in attesa')), 25000); })
          ]);
          await refreshStatus();
        } finally { window.clearTimeout(timeout); }
      }
    } catch {
      // An offline update check can fail even though the installed worker and
      // its complete app cache are still available. Verify that existing copy.
      try {
        const existing = await navigator.serviceWorker.getRegistration(new URL('./', document.baseURI).href);
        if (existing?.active?.state === 'activated') {
          registration = existing;
          await refreshStatus();
          return;
        }
      } catch { /* Fall through to the explicit unavailable state. */ }
      if (state.mode !== 'ready') setStatus('unavailable', 'Offline non pronto', 'Apri il link online, attendi qualche secondo e riprova. La demo resta utilizzabile mentre la pagina è aperta.');
    }
  }

  function updateHelp() {
    if (!dialog) return;
    dialog.querySelector('[data-offline-status]').textContent = state.message;
    dialog.querySelector('[data-offline-status]').dataset.status = state.mode;
    dialog.querySelector('[data-offline-detail]').textContent = state.detail;
    const retry = dialog.querySelector('[data-offline-retry]');
    retry.hidden = ['ready', 'update', 'unsupported'].includes(state.mode);
    dialog.querySelector('[data-offline-update]').hidden = state.mode !== 'update';
  }

  function closeHelp() {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else { dialog.removeAttribute('open'); dialog.hidden = true; }
    lastFocus?.focus?.();
  }

  function createHelp() {
    const style = document.createElement('style');
    style.textContent = `
      .sculpt-offline-dialog{position:fixed;box-sizing:border-box;inset:0;margin:auto;width:min(440px,calc(100vw - 28px));max-height:calc(100vh - 36px);max-height:calc(100dvh - 36px);overflow:auto;border:1px solid #444449;border-radius:22px;padding:25px;background:#1c1c20;color:#eeeae8;box-shadow:0 24px 90px #0009;font-family:inherit;line-height:1.5;z-index:1000;text-align:left}
      .sculpt-offline-dialog:not([open]){display:none}.sculpt-offline-dialog::backdrop{background:#121214cc;backdrop-filter:blur(7px)}
      .sculpt-offline-dialog *{box-sizing:border-box}.sculpt-offline-dialog h2{font-size:22px;font-weight:650;letter-spacing:-.5px;margin:4px 44px 15px 0;color:#eeeae8}
      .sculpt-offline-kicker{font-size:10px;letter-spacing:2px;font-weight:700;color:#aaa6a8;margin:0}
      .sculpt-offline-close{position:absolute;right:13px;top:13px;width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:50%;background:#252529;color:#eeeae8;font-size:25px;cursor:pointer}
      .sculpt-offline-state{border:1px solid #444449;background:#252529;border-radius:13px;padding:13px 14px;margin:0 0 18px}
      .sculpt-offline-state strong{display:block;font-size:13px;color:#eeeae8}.sculpt-offline-state strong[data-status=ready]{color:#ef414b}
      .sculpt-offline-state p{margin:5px 0 0;font-size:12px;color:#aaa6a8;line-height:1.55}
      .sculpt-offline-dialog ol{margin:0;padding-left:23px;font-size:13px;color:#aaa6a8}.sculpt-offline-dialog li{padding-left:4px;margin:0 0 12px}.sculpt-offline-dialog li::marker{color:#ef414b;font-weight:700}.sculpt-offline-dialog strong{color:#eeeae8}
      .sculpt-offline-note{font-size:11px!important;line-height:1.55!important;color:#aaa6a8!important;margin:16px 0 0!important}
      .sculpt-offline-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:22px}.sculpt-offline-actions button{font:inherit;font-size:12px;font-weight:650;padding:12px 17px;border-radius:10px;min-height:44px;border:1px solid #444449;cursor:pointer;background:#252529;color:#eeeae8}.sculpt-offline-actions [data-offline-done]{background:#ef414b;color:#121214;border-color:transparent}
      .sculpt-offline-dialog [hidden]{display:none!important}.sculpt-offline-dialog button:focus-visible{outline:2px solid #ef414b;outline-offset:3px}
      @media(max-height:440px){.sculpt-offline-dialog{padding:18px;max-height:calc(100dvh - 16px)}.sculpt-offline-dialog ol{font-size:12px}.sculpt-offline-dialog li{margin-bottom:7px}}
    `;
    document.head.appendChild(style);
    dialog = document.createElement('dialog');
    dialog.className = 'sculpt-offline-dialog';
    dialog.setAttribute('aria-labelledby', 'sculpt-offline-heading');
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = `
      <p class="sculpt-offline-kicker">SCULPT WING</p>
      <button class="sculpt-offline-close" type="button" aria-label="Chiudi guida offline" data-offline-close>×</button>
      <h2 id="sculpt-offline-heading">Installa su iPhone</h2>
      <div class="sculpt-offline-state" aria-live="polite"><strong data-offline-status>${escapeHTML(state.message)}</strong><p data-offline-detail></p></div>
      <ol>
        <li>Apri il link della demo in <strong>Safari o Chrome</strong> su iPhone, con Internet attivo.</li>
        <li>Tocca <strong>Condividi → Aggiungi alla schermata Home</strong>. Se compare, lascia attivo <strong>Apri come app web</strong>.</li>
        <li>Apri la nuova icona dalla Home <strong>una volta online</strong> e attendi la scritta <strong>Offline pronto</strong>.</li>
        <li>Ora puoi provare l’interfaccia anche in <strong>modalità aereo</strong>.</li>
      </ol>
      <p class="sculpt-offline-note">La demo non richiede il mixer. I file restano disponibili finché il dispositivo conserva i dati dell’app. Se li cancelli, riapri la demo online.</p>
      <div class="sculpt-offline-actions"><button type="button" data-offline-retry>Riprova</button><button type="button" data-offline-update hidden>Apri nuova versione</button><button type="button" data-offline-done>Torna al mixer</button></div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('[data-offline-close]').addEventListener('click', closeHelp);
    dialog.querySelector('[data-offline-done]').addEventListener('click', closeHelp);
    dialog.querySelector('[data-offline-update]').addEventListener('click', () => {
      if (state.mode === 'update') window.location.reload();
    });
    dialog.querySelector('[data-offline-retry]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      setStatus('preparing', 'Preparazione offline…', 'Verifico i file su questo dispositivo.');
      try {
        if (registration?.active?.state === 'activated') {
          await requestVerification(registration.active, 'SCULPT_REPAIR_CACHE');
          await refreshStatus();
        } else await start();
      } catch {
        setStatus('unavailable', 'Offline non pronto', 'Per completare il salvataggio serve una connessione Internet. Riprova quando sei online.');
      } finally { button.disabled = false; }
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeHelp();
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeHelp(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeHelp(); }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button:not([disabled])')].filter(button => !button.hidden);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    updateHelp();
  }

  function openHelp() {
    if (!dialog) createHelp();
    lastFocus = document.activeElement;
    updateHelp();
    dialog.hidden = false;
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
    dialog.querySelector('[data-offline-close]').focus();
    if (registration?.active?.state === 'activated') refreshStatus();
  }

  window.SculptOffline = Object.freeze({ openHelp, refreshStatus, getStatus: () => ({ ...state }), version: VERSION });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => refreshStatus());
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'SCULPT_CACHE_CHANGED') refreshStatus();
    });
  }
  window.addEventListener('pageshow', () => { if (registration?.active) refreshStatus(); });
  window.addEventListener('online', () => {
    if (registration?.active) refreshStatus();
    else if (state.mode === 'unavailable') start();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
