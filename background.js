async function isContentScriptInjected(tabId) {
    try {
        const response = await Promise.race([
            chrome.tabs.sendMessage(tabId, { action: "checkIfLoaded" }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 1000)
            )
        ]);
        return response && response.loaded;
    } catch (error) {
        return false;
    }
}

chrome.runtime.onInstalled.addListener(() => {
    // Create the context menu items
    chrome.contextMenus.create({
        id: "analyzeMCQ",
        title: "Ask Webcodoo (MCQ)",
        contexts: ["selection"]
    });

    chrome.contextMenus.create({
        id: "analyzeShort",
        title: "Ask Webcodoo (Short Answer)",
        contexts: ["selection"]
    });
    chrome.contextMenus.create({
        id: "analyzeGemini",
        title: "Ask Gemini (Short Answer)",
        contexts: ["selection"]
    });
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
        try {
            const isInjected = await isContentScriptInjected(tab.id);
            if (!isInjected) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // Wait for initialization
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            await chrome.tabs.sendMessage(tab.id, {
                action: "showDropZone"
            });
        } catch (error) {
            console.error('Error showing drop zone:', error);
        }
    }
});


// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
        const isInjected = await isContentScriptInjected(tab.id);
        if (!isInjected) {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (command === "take-screenshot") {
            await chrome.tabs.sendMessage(tab.id, {
                action: "initiateScreenshot",
                isShortAnswer: false
            });
        } else if (command === "toggle-drop-zone") {
            await chrome.tabs.sendMessage(tab.id, {
                action: "showDropZone"
            });
        }
    } catch (error) {
        console.error(`Error handling command ${command}:`, error);
    }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        console.log('Selected text:', info.selectionText);
        const selectedText = info.selectionText;
        
        const isGemini = info.menuItemId === "analyzeGemini";
        const isShortAnswer = info.menuItemId === "analyzeShort" || isGemini;
        
        console.log('Using Gemini:', isGemini);
        console.log('Is short answer:', isShortAnswer);

        let response;
        if (isGemini) {
            response = await analyzeWithAI(selectedText, true, true);
        } else {
            response = await analyzeWithAI(selectedText, isShortAnswer, false);
        }

        if (!response || !response.answer) {
            console.error('Invalid response from AI:', response);
            throw new Error('Invalid response format');
        }

        if (tab && tab.id) {
            const isInjected = await isContentScriptInjected(tab.id);
            if (!isInjected) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // Wait for initialization
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            await chrome.tabs.sendMessage(tab.id, {
                action: "showAnswer",
                answer: response.answer
            });

            console.log('Message sent to content script');
        }
    } catch (error) {
        console.error('Error in context menu handler:', error);
        if (tab && tab.id) {
            try {
                const isInjected = await isContentScriptInjected(tab.id);
                if (!isInjected) {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                await chrome.tabs.sendMessage(tab.id, {
                    action: "showAnswer",
                    answer: "Error: " + error.message
                });
            } catch (msgError) {
                console.error('Failed to send error message to content script:', msgError);
            }
        }
    }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkIfLoaded") {
        sendResponse({ loaded: true });
        return true;
    }
    if (request.action === "captureVisibleTab") {
        (async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

                const responseBlob = await fetch(screenshotDataUrl);
                const imageBlob = await responseBlob.blob();
                const imageBitmap = await createImageBitmap(imageBlob);

                const canvas = new OffscreenCanvas(request.area.width, request.area.height);
                const ctx = canvas.getContext('2d');

                ctx.drawImage(
                    imageBitmap,
                    request.area.x,
                    request.area.y,
                    request.area.width,
                    request.area.height,
                    0,
                    0,
                    request.area.width,
                    request.area.height
                );

                const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({ imageData: reader.result });
                };
                reader.readAsDataURL(croppedBlob);

            } catch (error) {
                console.error('Screenshot capture error:', error);
                sendResponse({ error: error.message });
            }
        })();
        return true;
    }

    if (request.action === "analyzeScreenshot") {
        (async () => {
            try {
                const response = await fetch('http://localhost:3001/analyze-image', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        imageData: request.imageData,
                        timestamp: request.timestamp,
                        isShortAnswer: true
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to analyze image');
                }

                const data = await response.json();
                if (data.error) {
                    throw new Error(data.error);
                }
                sendResponse({ answer: data.answer });
            } catch (error) {
                console.error('Error analyzing screenshot:', error);
                sendResponse({ error: error.message });
            }
        })();
        return true;
    }
});

// Helper function to analyze text with Claude API
async function analyzeWithAI(text, isShortAnswer = false, useGemini = false) {
    try {
        console.log('Sending request with isShortAnswer:', isShortAnswer, 'useGemini:', useGemini);
        const response = await fetch('http://localhost:3001/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text,
                isShortAnswer,
                useGemini
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Server response:', errorData);
            throw new Error(`Request failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('Server response:', data);

        if (!data || !data.answer) {
            throw new Error('Invalid response format');
        }

        return data;
    } catch (error) {
        console.error('Error in analyzeWithAI:', error);
        throw error;
    }
}