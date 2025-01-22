# AI-Powered MCQ & Short Answer Assistant

A Chrome extension that helps analyze multiple-choice questions (MCQ) and short answers using AI technology (Claude and Gemini).

## Features

### Question Analysis Methods
- **Text Selection Analysis**
  - MCQ analysis with Claude AI
  - Short answer analysis with Claude AI
  - Alternative analysis using Gemini AI
  - Right-click context menu for quick access

### Screenshot Analysis
- **Smart Screenshot Tool**
  - Custom screenshot selection interface
  - Real-time preview of selected area
  - Automatic image preprocessing for better OCR
  - Google Cloud Vision OCR integration
  - Support for both MCQ and short answer formats

### Interactive Drop Zone
- **Drag & Drop Interface**
  - Floating, resizable drop zone
  - Support for image paste (Ctrl+V)
  - Drag and drop image upload
  - Movable interface with smooth animations
  - Minimalistic design with visual feedback

### AI Integration
- **Multiple AI Models**
  - Claude 3.5 Sonnet for precise MCQ analysis
  - Gemini 1.5 Pro for alternative interpretations
  - Google Cloud Vision for OCR
  - Smart question type detection (MCQ vs Short Answer)

### User Interface
- **Answer Display**
  - Non-intrusive popup notifications
  - Clean answer formatting for MCQs (A, B, C, D, E)
  - Detailed response for short answers
  - Error handling with user feedback
  - Auto-dismissing notifications

### Technical Features
- **Performance & Reliability**
  - Automatic content script injection
  - Efficient image preprocessing
  - Multiple retry mechanisms for API calls
  - Comprehensive error handling
  - Debug image saving for troubleshooting

### Keyboard Shortcuts
- Screenshot capture shortcut
- Drop zone toggle shortcut
- Quick text selection analysis

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Set up API keys:
   - Claude API key
   - Gemini API key
   - Google Cloud Vision credentials

4. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked"
   - Select the extension directory

## Usage

1. **Text Analysis**
   - Select text
   - Right-click and choose analysis type
   - View results in popup

2. **Screenshot Analysis**
   - Click extension icon or use shortcut
   - Select area
   - View results automatically

3. **Drop Zone**
   - Toggle with extension icon
   - Drag & drop or paste images
   - Resize and move as needed

## Technical Requirements

- Node.js
- Express server (port 3001)
- Chrome browser
- API keys for:
  - Claude AI
  - Gemini AI
  - Google Cloud Vision

## Server Setup

1. Start the local server:
```bash
node server.js
```

2. Server provides endpoints for:
   - `/analyze` - Text analysis
   - `/analyze-image` - Image analysis
   - `/health` - Server health check

## Development Notes

- Background script handles API communications
- Content script manages UI interactions
- Server processes OCR and AI requests
- Debug images saved in `debug-images` directory
