  // background.js
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'checkForManifest') {
      chrome.action.setIcon({
        path: {
          "128": request.hasManifest ? "icons/icon128-active.png" : "icons/icon128.png"
        },
        tabId: sender.tab.id
      });
    }
  });