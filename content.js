// content.js
console.log('Teams Recording Downloader content script loaded');

// Create a performance observer to monitor network requests
const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach(entry => {
        if (entry.name.includes('videomanifest?provider=spo')) {
            console.log('Found manifest URL through PerformanceObserver:', entry.name);
            // Store the URL in a data attribute on the document body
            document.body.setAttribute('data-manifest-url', entry.name);
        }
    });
});

observer.observe({ entryTypes: ['resource'] });

function findManifestUrl() {
    // First check if we've stored a URL
    const storedUrl = document.body.getAttribute('data-manifest-url');
    if (storedUrl) {
        return storedUrl;
    }

    // Check performance entries directly
    const entries = performance.getEntriesByType('resource');
    for (const entry of entries) {
        if (entry.name.includes('videomanifest?provider=spo')) {
            return entry.name;
        }
    }

    return null;
}

// Check for manifest URL periodically
setInterval(() => {
    const manifestUrl = findManifestUrl();
    console.log('Checking for manifest URL:', manifestUrl);
    if (manifestUrl) {
        chrome.runtime.sendMessage({
            type: 'checkForManifest',
            hasManifest: true
        });
    }
}, 1000);