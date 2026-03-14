const $ = (sel) => document.querySelector(sel);

const els = {
  ssKey: $('#ssKey'),
  proxyMode: $('#proxyMode'),
  sites: $('#sites'),
  localPort: $('#localPort'),
  sitesSection: $('#sitesSection'),
  toggleBtn: $('#toggleBtn'),
  btnText: $('#btnText'),
  statusDot: $('#statusDot'),
  statusText: $('#statusText'),
  errorMsg: $('#errorMsg'),
  serverInfo: $('#serverInfo'),
  serverHost: $('#serverHost'),
  serverPort: $('#serverPort'),
  serverMethod: $('#serverMethod'),
  helpLink: $('#helpLink'),
  helpPanel: $('#helpPanel'),
  closeHelp: $('#closeHelp'),
};

let currentState = null;

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

function showError(text) {
  els.errorMsg.textContent = text;
  els.errorMsg.style.display = 'block';
  setTimeout(() => {
    els.errorMsg.style.display = 'none';
  }, 5000);
}

function hideError() {
  els.errorMsg.style.display = 'none';
}

function updateUI(state) {
  currentState = state;

  els.ssKey.value = state.ssKey || '';
  els.proxyMode.value = state.proxyMode || 'selected';
  els.sites.value = state.sites || '';
  els.localPort.value = state.localPort || 1080;

  els.sitesSection.style.display =
    state.proxyMode === 'selected' ? 'block' : 'none';

  if (state.connected) {
    els.statusDot.classList.add('connected');
    els.statusText.textContent = 'Подключён';
    els.toggleBtn.classList.remove('btn-connect');
    els.toggleBtn.classList.add('btn-disconnect');
    els.btnText.textContent = 'Отключиться';
    setFieldsDisabled(true);
  } else {
    els.statusDot.classList.remove('connected');
    els.statusText.textContent = 'Отключён';
    els.toggleBtn.classList.remove('btn-disconnect');
    els.toggleBtn.classList.add('btn-connect');
    els.btnText.textContent = 'Подключиться';
    setFieldsDisabled(false);
  }

  updateServerInfo(state.ssKey);
}

function setFieldsDisabled(disabled) {
  els.ssKey.disabled = disabled;
  els.proxyMode.disabled = disabled;
  els.sites.disabled = disabled;
  els.localPort.disabled = disabled;
}

async function updateServerInfo(ssKey) {
  if (!ssKey) {
    els.serverInfo.style.display = 'none';
    return;
  }
  const parsed = await sendMessage({ type: 'PARSE_KEY', ssKey });
  if (parsed && parsed.host) {
    els.serverHost.textContent = parsed.host;
    els.serverPort.textContent = parsed.port;
    els.serverMethod.textContent = parsed.method;
    els.serverInfo.style.display = 'block';
  } else {
    els.serverInfo.style.display = 'none';
  }
}

async function saveSettings() {
  await sendMessage({
    type: 'SAVE_SETTINGS',
    payload: {
      ssKey: els.ssKey.value.trim(),
      proxyMode: els.proxyMode.value,
      sites: els.sites.value,
      localPort: parseInt(els.localPort.value, 10) || 1080,
    },
  });
}

let saveTimeout = null;
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveSettings, 400);
}

els.ssKey.addEventListener('input', () => {
  debouncedSave();
  updateServerInfo(els.ssKey.value.trim());
});

els.proxyMode.addEventListener('change', () => {
  els.sitesSection.style.display =
    els.proxyMode.value === 'selected' ? 'block' : 'none';
  debouncedSave();
});

els.sites.addEventListener('input', debouncedSave);
els.localPort.addEventListener('input', debouncedSave);

els.toggleBtn.addEventListener('click', async () => {
  hideError();
  els.toggleBtn.disabled = true;

  await saveSettings();

  if (currentState && currentState.connected) {
    const result = await sendMessage({ type: 'DISCONNECT' });
    if (result && !result.success) {
      showError(result.error || 'Disconnect failed');
    }
  } else {
    const result = await sendMessage({ type: 'CONNECT' });
    if (result && !result.success) {
      showError(result.error || 'Connection failed');
    }
  }

  const state = await sendMessage({ type: 'GET_STATE' });
  updateUI(state);
  els.toggleBtn.disabled = false;
});

els.helpLink.addEventListener('click', (e) => {
  e.preventDefault();
  els.helpPanel.style.display =
    els.helpPanel.style.display === 'none' ? 'block' : 'none';
});

els.closeHelp.addEventListener('click', () => {
  els.helpPanel.style.display = 'none';
});

(async () => {
  const state = await sendMessage({ type: 'GET_STATE' });
  if (state) updateUI(state);
})();
