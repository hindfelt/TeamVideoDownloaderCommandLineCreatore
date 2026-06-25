// background.js
// Capture the Teams/SharePoint Stream video manifest URL *and* the auth
// headers the browser sends with it. The manifest is access-controlled, so
// ffmpeg needs the same Cookie/Authorization headers or the media server
// answers 401 Unauthorized.
//
// The OnePlayer fetches the manifest from a service worker, so the request
// often has tabId === -1. We therefore keep BOTH a per-tab cache and a global
// "last seen" cache, and the popup falls back to the global one.

const MEDIA_URLS = [
  '*://*.svc.ms/*',
  '*://*.sharepoint.com/*',
  '*://*.sharepoint-df.com/*',
  '*://*.teams.microsoft.com/*'
];

const manifestByTab = {};   // tabId -> { url, headers, topLevelSite }
let lastManifest = null;    // { url, headers, topLevelSite } regardless of tab

// Catch the URL as early as possible (some requests have no headers here).
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!details.url.includes('videomanifest')) return;
    const previousHeaders = (lastManifest && lastManifest.url === details.url) ? lastManifest.headers : null;
    const entry = {
      url: details.url,
      headers: previousHeaders,
      topLevelSite: getTopLevelSite(previousHeaders, details)
    };
    lastManifest = entry;
    if (details.tabId >= 0) manifestByTab[details.tabId] = entry;
    setActiveIcon(details.tabId, true);
  },
  { urls: MEDIA_URLS }
);

// Capture the outgoing auth headers on the manifest request.
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (!details.url.includes('videomanifest')) return;
    const headers = {};
    for (const h of details.requestHeaders || []) {
      headers[h.name.toLowerCase()] = h.value;
    }
    const entry = {
      url: details.url,
      headers,
      topLevelSite: getTopLevelSite(headers, details)
    };
    lastManifest = entry;
    if (details.tabId >= 0) manifestByTab[details.tabId] = entry;
    console.log('Captured manifest request (tabId ' + details.tabId + '), headers:', Object.keys(headers).sort());
    setActiveIcon(details.tabId, true);
  },
  { urls: MEDIA_URLS },
  ['requestHeaders', 'extraHeaders']
);

// Forget the per-tab cache when that tab navigates somewhere new.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    delete manifestByTab[tabId];
    setActiveIcon(tabId, false);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete manifestByTab[tabId];
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'recordingFrameReady') {
    // A child frame captured the recording — tell the tab's top frame to hide
    // its placeholder button so only the child's working button is shown.
    const tabId = sender.tab?.id;
    if (typeof tabId === 'number' && sender.frameId !== 0) {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'hidePlaceholderButton' },
        { frameId: 0 },
        () => void chrome.runtime.lastError
      );
    }
    return; // no response needed
  }
  if (request.type === 'getManifest') {
    const tabId = request.tabId ?? sender.tab?.id;
    // Prefer the tab-specific capture; fall back to the most recent one
    // (covers service-worker requests that arrive with tabId === -1).
    const entry = manifestByTab[tabId] || lastManifest || null;
    if (!entry?.url) {
      sendResponse({ manifestUrl: null, headers: null });
      return true;
    }
    const headers = Object.assign({}, entry.headers || {});
    // webRequest can't see the HttpOnly auth cookie on the service-worker
    // request, but the cookies API can. Pull every cookie that would be sent
    // to the manifest URL (includes HttpOnly) and attach it. Some Teams media
    // cookies are CHIPS-partitioned by the SharePoint page origin, so check
    // both the normal jar and the partitioned jar when we know the top site.
    getCookiesForManifest(entry, headers, (cookies) => {
      if (cookies && cookies.length) {
        headers.cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        console.log('Attached ' + cookies.length + ' cookie(s) for the manifest host.');
      } else {
        console.log('No cookies found for the manifest host.');
      }
      sendResponse({ manifestUrl: entry.url, headers });
    });
    return true; // async sendResponse
  }
  if (request.type === 'checkForManifest' && sender.tab) {
    setActiveIcon(sender.tab.id, request.hasManifest);
  }
});

function setActiveIcon(tabId, active) {
  if (typeof tabId !== 'number' || tabId < 0) return;
  const maybePromise = chrome.action.setIcon({
      path: { '128': active ? 'icons/team_lit.png' : 'icons/team_unlit.png' },
      tabId
  });
  if (maybePromise && typeof maybePromise.catch === 'function') {
    maybePromise.catch(() => {});
  }
}

function getCookiesForManifest(entry, headers, callback) {
  const filters = [{ url: entry.url }];
  const topLevelSite = entry.topLevelSite || getTopLevelSite(headers, null);

  if (topLevelSite) {
    filters.push({
      url: entry.url,
      partitionKey: { topLevelSite }
    });
  }

  const byCookieKey = new Map();
  let pending = filters.length;

  for (const filter of filters) {
    try {
      chrome.cookies.getAll(filter, (cookies) => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.log('Cookie lookup failed:', error.message);
        } else {
          for (const cookie of cookies || []) {
            byCookieKey.set(`${cookie.domain}\n${cookie.path}\n${cookie.name}`, cookie);
          }
        }

        pending -= 1;
        if (pending === 0) callback([...byCookieKey.values()]);
      });
    } catch (error) {
      console.log('Cookie lookup failed:', error.message);
      pending -= 1;
      if (pending === 0) callback([...byCookieKey.values()]);
    }
  }
}

function getTopLevelSite(headers, details) {
  const candidate = headers?.origin || headers?.referer || details?.initiator || details?.documentUrl;
  if (!candidate) return null;

  try {
    return new URL(candidate).origin;
  } catch (error) {
    return null;
  }
}
