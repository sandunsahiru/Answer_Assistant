if (window.__webcodooInitialized) {
    console.log('Webcodoo already initialized');
} else {
    window.__webcodooInitialized = true;

    (() => {
        // State variables in module scope
        const state = {
            isScreenshotMode: false,
            isProcessingScreenshot: false,  // Add this to prevent double processing
            startPos: { x: 0, y: 0 },
            selectionBox: null,
            dropZone: null
        };

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Content script received message:', request);
        
            try {
                if (request.action === "checkIfLoaded") {
                    sendResponse({ loaded: true });
                    return true;
                } else if (request.action === "showAnswer") {
                    showAnswerPopup(request.answer);
                    sendResponse({ status: 'Answer popup shown' });
                } else if (request.action === "initiateScreenshot") {
                    startScreenshotMode();
                    sendResponse({ status: 'Screenshot mode initiated' });
                } else if (request.action === "showDropZone") {
                    toggleDropZone();
                    sendResponse({ status: 'Drop zone toggled' });
                }
            } catch (error) {
                console.error('Error handling message:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        
            return true;
        });

        // Toggle drop zone visibility
        function toggleDropZone() {
            if (state.dropZone) {
                if (state.dropZone.style.display === 'none') {
                    state.dropZone.style.display = 'flex';
                    state.dropZone.focus();
                } else {
                    state.dropZone.style.display = 'none';
                }
                return;
            }
            showDropZone();
        }

        function showDropZone() {
            state.dropZone = document.createElement('div');
            const styles = {
                position: 'fixed',
                bottom: '20px',
                left: '20px',
                width: '300px',
                height: '60px',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '2147483647',
                transition: 'background-color 0.3s ease, border-color 0.3s ease',
                backdropFilter: 'blur(5px)',
                border: '2px dashed rgba(255, 255, 255, 0.3)',
                boxSizing: 'border-box',
                cursor: 'move',
                borderRadius: '8px',
                minWidth: '200px',
                minHeight: '40px'
            };

            Object.assign(state.dropZone.style, styles);

            // Create wrapper for content to handle resizing separately
            const contentWrapper = document.createElement('div');
            contentWrapper.style.position = 'relative';
            contentWrapper.style.width = '100%';
            contentWrapper.style.height = '100%';
            contentWrapper.style.display = 'flex';
            contentWrapper.style.alignItems = 'center';
            contentWrapper.style.justifyContent = 'center';
            contentWrapper.style.pointerEvents = 'none';

            // Add text content with paste instructions
            const text = document.createElement('div');
            text.innerHTML = 'Drop screenshot here<br><span style="font-size: 12px;">or press Ctrl+V to paste</span>';
            text.style.color = 'rgba(255, 255, 255, 0.8)';
            text.style.fontFamily = 'Arial, sans-serif';
            text.style.fontSize = '14px';
            text.style.pointerEvents = 'none';
            text.style.userSelect = 'none';
            text.style.textAlign = 'center';
            text.style.lineHeight = '1.4';
            text.style.zIndex = '2147483648';

            // Add close button with improved positioning and hitbox
            const closeButton = document.createElement('div');
            closeButton.innerHTML = '×';
            Object.assign(closeButton.style, {
                position: 'absolute',
                right: '0',
                top: '0',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer',
                opacity: '0.7',
                transition: 'opacity 0.2s ease',
                zIndex: '2147483649',
                pointerEvents: 'auto',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '0 8px 0 8px'
            });

            // Add resize handles
            const resizeHandles = [];
            const positions = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
            positions.forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${pos}`;
                Object.assign(handle.style, {
                    position: 'absolute',
                    width: pos.includes('n') || pos.includes('s') ? '100%' : '10px',
                    height: pos.includes('e') || pos.includes('w') ? '100%' : '10px',
                    cursor: pos.length === 2 ? `${pos}-resize` : `${pos[0]}-resize`,
                    zIndex: '2147483648',
                    pointerEvents: 'auto'
                });

                // Position handles
                if (pos.includes('n')) handle.style.top = '-5px';
                if (pos.includes('s')) handle.style.bottom = '-5px';
                if (pos.includes('e')) handle.style.right = '-5px';
                if (pos.includes('w')) handle.style.left = '-5px';
                if (pos.length === 1) {
                    handle.style.left = pos === 'w' ? '-5px' : pos === 'e' ? '-5px' : '0';
                    handle.style.top = pos === 'n' ? '-5px' : pos === 's' ? '-5px' : '0';
                }

                resizeHandles.push(handle);
                state.dropZone.appendChild(handle);
            });

            // Improved close button functionality
            closeButton.addEventListener('mouseover', () => {
                closeButton.style.opacity = '1';
            });

            closeButton.addEventListener('mouseout', () => {
                closeButton.style.opacity = '0.7';
            });

            closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                state.dropZone.style.display = 'none';
            });

            // Resize functionality
            let isResizing = false;
            let currentHandle = null;
            let initialSize = { width: 0, height: 0 };
            let initialPosition = { x: 0, y: 0 };
            let initialMousePosition = { x: 0, y: 0 };

            resizeHandles.forEach(handle => {
                handle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    isResizing = true;
                    currentHandle = handle;

                    const rect = state.dropZone.getBoundingClientRect();
                    initialSize = {
                        width: rect.width,
                        height: rect.height
                    };
                    initialPosition = {
                        x: rect.left,
                        y: rect.top
                    };
                    initialMousePosition = {
                        x: e.clientX,
                        y: e.clientY
                    };

                    document.addEventListener('mousemove', handleResize);
                    document.addEventListener('mouseup', stopResize);
                });
            });

            function handleResize(e) {
                if (!isResizing) return;

                const dx = e.clientX - initialMousePosition.x;
                const dy = e.clientY - initialMousePosition.y;
                const position = currentHandle.className.split(' ')[1];

                let newWidth = initialSize.width;
                let newHeight = initialSize.height;
                let newX = initialPosition.x;
                let newY = initialPosition.y;

                if (position.includes('e')) newWidth = initialSize.width + dx;
                if (position.includes('w')) {
                    newWidth = initialSize.width - dx;
                    newX = initialPosition.x + dx;
                }
                if (position.includes('s')) newHeight = initialSize.height + dy;
                if (position.includes('n')) {
                    newHeight = initialSize.height - dy;
                    newY = initialPosition.y + dy;
                }

                // Apply minimum size constraints
                newWidth = Math.max(200, newWidth);
                newHeight = Math.max(40, newHeight);

                state.dropZone.style.width = `${newWidth}px`;
                state.dropZone.style.height = `${newHeight}px`;
                state.dropZone.style.left = `${newX}px`;
                state.dropZone.style.top = `${newY}px`;
            }

            function stopResize() {
                isResizing = false;
                currentHandle = null;
                document.removeEventListener('mousemove', handleResize);
                document.removeEventListener('mouseup', stopResize);
            }

            // Make it draggable
            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = 0;
            let yOffset = 0;

            state.dropZone.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            function dragStart(e) {
                if (e.target.classList?.contains('resize-handle') || e.target === closeButton) return;

                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;

                if (e.target === state.dropZone) {
                    isDragging = true;
                }
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();

                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    xOffset = currentX;
                    yOffset = currentY;

                    setTranslate(currentX, currentY, state.dropZone);
                }
            }

            function dragEnd(e) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
            }

            function setTranslate(xPos, yPos, el) {
                el.style.transform = `translate(${xPos}px, ${yPos}px)`;
            }

            // Add paste handling
            state.dropZone.addEventListener('paste', handlePaste);
            state.dropZone.setAttribute('tabindex', '0');

            // Add drag and drop event listeners
            state.dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!isDragging && !isResizing) {
                    state.dropZone.style.backgroundColor = 'rgba(0, 123, 255, 0.7)';
                    state.dropZone.style.borderColor = 'rgba(255, 255, 255, 0.8)';
                }
            });

            state.dropZone.addEventListener('dragleave', () => {
                if (!isDragging && !isResizing) {
                    state.dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                    state.dropZone.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }
            });

            state.dropZone.addEventListener('drop', handleImageDrop);

            contentWrapper.appendChild(text);
            state.dropZone.appendChild(contentWrapper);
            state.dropZone.appendChild(closeButton);
            document.body.appendChild(state.dropZone);
            state.dropZone.focus();
        }

        async function handlePaste(e) {
            e.preventDefault();
            const items = e.clipboardData.items;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();

                    reader.onload = async (event) => {
                        try {
                            // Show loading state
                            state.dropZone.style.backgroundColor = 'rgba(0, 123, 255, 0.7)';
                            state.dropZone.style.borderColor = 'rgba(255, 255, 255, 0.8)';

                            chrome.runtime.sendMessage({
                                action: "analyzeScreenshot",
                                imageData: event.target.result,
                                timestamp: new Date().getTime()
                            }, response => {
                                // Reset drop zone style
                                state.dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                                state.dropZone.style.borderColor = 'rgba(255, 255, 255, 0.3)';

                                if (response?.error) {
                                    showAnswerPopup("Error: " + response.error);
                                } else if (response?.answer) {
                                    showAnswerPopup(response.answer);
                                } else {
                                    showAnswerPopup("Error: Invalid response");
                                }
                            });
                        } catch (error) {
                            console.error('Error processing pasted image:', error);
                            showAnswerPopup("Error: Failed to process image");
                            state.dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                            state.dropZone.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                        }
                    };

                    reader.readAsDataURL(blob);
                    break; // Only process the first image
                }
            }
        }

        function handleImageDrop(e) {
            e.preventDefault();
            state.dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            state.dropZone.style.borderColor = 'rgba(255, 255, 255, 0.3)';

            const file = e.dataTransfer.files[0];
            if (!file || !file.type.startsWith('image/')) {
                showAnswerPopup('Error: Please drop an image file');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    chrome.runtime.sendMessage({
                        action: "analyzeScreenshot",
                        imageData: event.target.result,
                        timestamp: new Date().getTime()
                    }, response => {
                        if (response?.error) {
                            showAnswerPopup("Error: " + response.error);
                        } else if (response?.answer) {
                            showAnswerPopup(response.answer);
                        } else {
                            showAnswerPopup("Error: Invalid response");
                        }
                    });
                } catch (error) {
                    console.error('Error processing dropped image:', error);
                    showAnswerPopup("Error: Failed to process image");
                }
            };

            reader.readAsDataURL(file);
        }

        function showAnswerPopup(answer) {
            try {
                const popup = document.createElement('div');
                popup.style.position = 'fixed';
                popup.style.bottom = '20px';
                popup.style.right = '20px';
                popup.style.backgroundColor = 'rgba(51, 51, 51, 0.95)';
                popup.style.color = 'white';
                popup.style.padding = '12px 16px';
                popup.style.borderRadius = '4px';
                popup.style.zIndex = '2147483647';
                popup.style.fontSize = '16px';
                popup.style.minWidth = '30px';
                popup.style.maxWidth = '400px';
                popup.style.textAlign = 'center';
                popup.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
                popup.style.userSelect = 'none';
                popup.style.cursor = 'default';
                popup.style.transition = 'opacity 0.3s ease';
                popup.style.opacity = '1';
                popup.style.wordBreak = 'break-word';

                if (answer.startsWith('Error:')) {
                    popup.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
                    popup.textContent = answer;
                } else {
                    // Handle multiple answers
                    const cleanAnswer = answer.split(',')
                        .map(part => part.trim())
                        .map(part => isNaN(part) ? part.toUpperCase() : part)
                        .join(', ');
                    popup.textContent = cleanAnswer;
                }

                document.body.appendChild(popup);

                setTimeout(() => {
                    popup.style.opacity = '0';
                    setTimeout(() => popup.remove(), 300);
                }, 3000);
            } catch (error) {
                console.error('Error showing popup:', error);
            }
        }

        function startScreenshotMode() {
            if (state.isScreenshotMode || state.isProcessingScreenshot) {
                console.log('Screenshot mode or processing already active');
                return;
            }
        
            console.log('Starting screenshot mode...');
            state.isScreenshotMode = true;
            document.body.style.cursor = 'crosshair';
        
            const overlay = document.createElement('div');
            overlay.id = 'screenshot-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = 'transparent';
            overlay.style.zIndex = '999999';
            overlay.style.cursor = 'crosshair';
            document.body.appendChild(overlay);
        
            document.addEventListener('mousedown', handleScreenshotStart);
            document.addEventListener('mousemove', handleScreenshotDrag);
            document.addEventListener('mouseup', handleScreenshotEnd);
        }

        function handleScreenshotStart(e) {
            if (!state.isScreenshotMode) return;
            e.preventDefault();
            state.startPos = { x: e.clientX, y: e.clientY };
        
            state.selectionBox = document.createElement('div');
            state.selectionBox.style.position = 'fixed';
            state.selectionBox.style.border = '2px solid rgba(128, 128, 128, 0.8)'; // Gray border
            state.selectionBox.style.backgroundColor = 'transparent'; // No background color
            state.selectionBox.style.zIndex = '1000000';
            state.selectionBox.style.pointerEvents = 'none';
            // Add a subtle outline
            state.selectionBox.style.outline = '1px solid rgba(255, 255, 255, 0.5)';
            state.selectionBox.style.outlineOffset = '1px';
            document.body.appendChild(state.selectionBox);
        }
        

        function handleScreenshotDrag(e) {
            if (!state.isScreenshotMode || !state.selectionBox) return;
            e.preventDefault();
        
            const currentPos = { x: e.clientX, y: e.clientY };
            const width = Math.abs(currentPos.x - state.startPos.x);
            const height = Math.abs(currentPos.y - state.startPos.y);
        
            state.selectionBox.style.left = Math.min(currentPos.x, state.startPos.x) + 'px';
            state.selectionBox.style.top = Math.min(currentPos.y, state.startPos.y) + 'px';
            state.selectionBox.style.width = width + 'px';
            state.selectionBox.style.height = height + 'px';
        }

        async function handleScreenshotEnd(e) {
            if (!state.isScreenshotMode || !state.selectionBox || state.isProcessingScreenshot) return;
            e.preventDefault();

            // Set both flags to prevent any new captures
            state.isScreenshotMode = false;
            state.isProcessingScreenshot = true;

            const bounds = {
                left: parseInt(state.selectionBox.style.left),
                top: parseInt(state.selectionBox.style.top),
                width: parseInt(state.selectionBox.style.width),
                height: parseInt(state.selectionBox.style.height)
            };

            // Remove UI immediately
            cleanup();

            // Ensure minimum size
            if (bounds.width < 50 || bounds.height < 50) {
                showAnswerPopup("Error: Selection area too small");
                state.isProcessingScreenshot = false;
                return;
            }

            try {
                const scale = window.devicePixelRatio;
                chrome.runtime.sendMessage({
                    action: "captureVisibleTab",
                    area: {
                        x: Math.round((bounds.left + window.scrollX) * scale),
                        y: Math.round((bounds.top + window.scrollY) * scale),
                        width: Math.round(bounds.width * scale),
                        height: Math.round(bounds.height * scale)
                    }
                }, response => {
                    if (response?.error) {
                        showAnswerPopup("Error: " + response.error);
                        state.isProcessingScreenshot = false;
                    } else if (response?.imageData) {
                        // Process the screenshot
                        chrome.runtime.sendMessage({
                            action: "analyzeScreenshot",
                            imageData: response.imageData,
                            timestamp: new Date().getTime()
                        }, analysisResponse => {
                            if (analysisResponse?.error) {
                                showAnswerPopup("Error: " + analysisResponse.error);
                            } else if (analysisResponse?.answer) {
                                showAnswerPopup(analysisResponse.answer);
                            } else {
                                showAnswerPopup("Error: Invalid response");
                            }
                            state.isProcessingScreenshot = false;
                        });
                    }
                });
            } catch (error) {
                console.error('Screenshot capture error:', error);
                showAnswerPopup("Error: Failed to capture screenshot");
                state.isProcessingScreenshot = false;
            }
        }

        function cleanup() {
            state.isScreenshotMode = false;
            document.body.style.cursor = 'default';

            const overlay = document.getElementById('screenshot-overlay');
            if (overlay) overlay.remove();

            if (state.selectionBox) {
                state.selectionBox.remove();
                state.selectionBox = null;
            }

            document.removeEventListener('mousedown', handleScreenshotStart);
            document.removeEventListener('mousemove', handleScreenshotDrag);
            document.removeEventListener('mouseup', handleScreenshotEnd);
        }
    })();
}