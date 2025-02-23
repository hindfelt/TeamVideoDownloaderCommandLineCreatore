// popup.js
document.addEventListener('DOMContentLoaded', function() {
    console.log('Popup loaded');
    const button = document.getElementById('copyCommand');
    const status = document.getElementById('status');
    
    button.addEventListener('click', async () => {
        console.log('Button clicked');
        status.textContent = 'Processing...';
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log('Current tab:', tab);
            
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    function findManifestUrl() {
                        // First check if we've stored a URL
                        const storedUrl = document.body.getAttribute('data-manifest-url');
                        if (storedUrl) {
                            return storedUrl;
                        }

                        // Check performance entries
                        const entries = performance.getEntriesByType('resource');
                        for (const entry of entries) {
                            if (entry.name.includes('videomanifest?provider=spo')) {
                                return entry.name;
                            }
                        }

                        return null;
                    }

                    function getMeetingName() {
                        const title = document.title
                            .replace('Microsoft Teams', '')
                            .trim()
                            .replace(/[^a-zA-Z0-9]/g, '_');
                        return title || 'teams_recording';
                    }

                    const manifestUrl = findManifestUrl();
                    const meetingName = getMeetingName();
                    console.log('Found manifest:', manifestUrl);
                    console.log('Meeting name:', meetingName);
                    return { manifestUrl, meetingName };
                }
            });
            
            console.log('Script execution result:', result);
            
            if (result && result[0] && result[0].result) {
                const { manifestUrl, meetingName } = result[0].result;
                
                if (manifestUrl) {
                    const command = `ffmpeg -i "${manifestUrl}" -codec copy "${meetingName}.mp4"`;
                    console.log('Generated command:', command);
                    
                    await navigator.clipboard.writeText(command);
                    status.textContent = 'Command copied to clipboard!';
                } else {
                    status.textContent = 'No manifest URL found. Please refresh the page and try again.';
                }
            } else {
                status.textContent = 'Error: Could not execute script';
            }
        } catch (error) {
            console.error('Error:', error);
            status.textContent = `Error: ${error.message}`;
        }
    });
});