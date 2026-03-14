const STATE_KEY = 'outlineVpnState';

const DEFAULT_STATE = {
  connected: false,
  ssKey: '',
  proxyMode: 'selected',
  sites: '',
  localPort: 1080,
};

async function getState() {
  const result = await chrome.storage.local.get(STATE_KEY);
  return { ...DEFAULT_STATE, ...result[STATE_KEY] };
}

async function setState(patch) {
  const current = await getState();
  const updated = { ...current, ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: updated });
  return updated;
}

function parseSsKey(ssKey) {
  const cleaned = ssKey.trim();
  if (!cleaned.startsWith('ss://')) return null;

  const withoutScheme = cleaned.slice(5);
  const atIndex = withoutScheme.lastIndexOf('@');

  let method, password, host, port;

  if (atIndex !== -1) {
    const userInfoB64 = withoutScheme.slice(0, atIndex);
    const serverPart = withoutScheme.slice(atIndex + 1).split(/[/?#]/)[0];
    const userInfo = atob(userInfoB64);
    const colonIdx = userInfo.indexOf(':');
    method = userInfo.slice(0, colonIdx);
    password = userInfo.slice(colonIdx + 1);
    const serverColonIdx = serverPart.lastIndexOf(':');
    host = serverPart.slice(0, serverColonIdx);
    port = parseInt(serverPart.slice(serverColonIdx + 1), 10);
  } else {
    try {
      const decoded = atob(withoutScheme.split(/[/?#]/)[0]);
      const match = decoded.match(/^(.+?):(.+)@(.+):(\d+)$/);
      if (!match) return null;
      [, method, password, host, port] = match;
      port = parseInt(port, 10);
    } catch {
      return null;
    }
  }

  if (!method || !password || !host || !port) return null;
  return { method, password, host, port };
}

function generatePacScript(sites, localPort) {
  const siteLines = sites
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const conditions = siteLines.map(site => {
    if (site.startsWith('*.')) {
      const domain = site.slice(2);
      return `dnsDomainIs(host, "${domain}") || dnsDomainIs(host, ".${domain}")`;
    }
    return `dnsDomainIs(host, "${site}")`;
  });

  return `function FindProxyForURL(url, host) {
  if (${conditions.join(' ||\n      ')}) {
    return "SOCKS5 127.0.0.1:${localPort}; DIRECT";
  }
  return "DIRECT";
}`;
}

async function connectProxy(state) {
  const { proxyMode, sites, localPort } = state;
  let config;

  if (proxyMode === 'all') {
    config = {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: 'socks5',
          host: '127.0.0.1',
          port: localPort,
        },
        bypassList: ['127.0.0.1', 'localhost', '<local>'],
      },
    };
  } else {
    const trimmedSites = sites.trim();
    if (!trimmedSites) {
      return { success: false, error: 'No sites specified for selective mode' };
    }
    config = {
      mode: 'pac_script',
      pacScript: {
        data: generatePacScript(trimmedSites, localPort),
      },
    };
  }

  return new Promise(resolve => {
    chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ success: true });
      }
    });
  });
}

async function disconnectProxy() {
  return new Promise(resolve => {
    chrome.proxy.settings.clear({ scope: 'regular' }, () => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ success: true });
      }
    });
  });
}

function drawIcon(connected) {
  const size = 128;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);

  // Shield shape
  const cx = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx, 10);
  ctx.lineTo(size - 12, 30);
  ctx.quadraticCurveTo(size - 12, 90, cx, size - 6);
  ctx.quadraticCurveTo(12, 90, 12, 30);
  ctx.closePath();

  ctx.fillStyle = connected ? '#36d986' : '#555';
  ctx.fill();

  ctx.strokeStyle = connected ? '#2bb870' : '#444';
  ctx.lineWidth = 3;
  ctx.stroke();

  // VPN label
  ctx.fillStyle = connected ? '#1a1a2e' : '#888';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VPN', cx, cx + 8);

  const imageData = ctx.getImageData(0, 0, size, size);
  chrome.action.setIcon({
    imageData: {
      128: imageData,
      48: ctx.getImageData(0, 0, size, size),
      16: ctx.getImageData(0, 0, size, size),
    },
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  drawIcon(state.connected);
  if (state.connected) {
    await connectProxy(state);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await getState();
  drawIcon(state.connected);
  if (state.connected) {
    await connectProxy(state);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'GET_STATE': {
        const state = await getState();
        sendResponse(state);
        break;
      }

      case 'SAVE_SETTINGS': {
        const state = await setState(msg.payload);
        sendResponse({ success: true, state });
        break;
      }

      case 'CONNECT': {
        const state = await getState();
        if (!state.ssKey) {
          sendResponse({ success: false, error: 'Access key not set' });
          break;
        }
        const parsed = parseSsKey(state.ssKey);
        if (!parsed) {
          sendResponse({ success: false, error: 'Invalid ss:// key format' });
          break;
        }
        const result = await connectProxy(state);
        if (result.success) {
          await setState({ connected: true });
          drawIcon(true);
        }
        sendResponse(result);
        break;
      }

      case 'DISCONNECT': {
        const result = await disconnectProxy();
        if (result.success) {
          await setState({ connected: false });
          drawIcon(false);
        }
        sendResponse(result);
        break;
      }

      case 'PARSE_KEY': {
        const parsed = parseSsKey(msg.ssKey);
        sendResponse(parsed);
        break;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true;
});
