const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const vision = require('@google-cloud/vision');
const sharp = require('sharp');
const fsPromises = require('fs').promises;
const fs = require('fs');  
const path = require('path');
const app = express();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Enhanced error logging
function logError(context, error) {
    console.error('\x1b[31m%s\x1b[0m', '🔴 ERROR:', context);
    console.error('\x1b[31m%s\x1b[0m', 'Message:', error.message);
    console.error('\x1b[31m%s\x1b[0m', 'Stack:', error.stack);
    if (error.code) console.error('\x1b[31m%s\x1b[0m', 'Code:', error.code);
    if (error.response) console.error('\x1b[31m%s\x1b[0m', 'Response:', error.response);
}

// Enhanced info logging
function logInfo(context, message) {
    console.log('\x1b[36m%s\x1b[0m', '📘 INFO:', `${context}:`, message);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const CLAUDE_API_KEY = ''; // Replace with actual API key

// Initialize Google Cloud Vision client
const client = new vision.ImageAnnotatorClient({
    keyFilename: '' //Replace with Json file
});

const GEMINI_API_KEY = ''; // Replace with actual API key
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Debug image saving function
async function saveDebugImage(buffer, prefix = 'debug') {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${prefix}-${timestamp}.png`;
        const debugDir = './debug-images';

        // Create debug folder if it doesn't exist
        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir);
        }

        const filepath = path.join(debugDir, filename);
        await fsPromises.writeFile(filepath, buffer);
        logInfo('Debug', `Saved debug image to: ${filepath}`);
        return filepath;
    } catch (error) {
        logError('Debug Save', error);
        return null;
    }
}

// Enhanced image preprocessing
async function preprocessImage(base64Image) {
    try {
        const buffer = Buffer.from(base64Image, 'base64');

        const processedBuffer = await sharp(buffer)
            // Maintain original size unless too large
            .resize({
                width: 2000,
                height: 2000,
                fit: 'inside',
                withoutEnlargement: true
            })
            // Enhance text visibility
            .normalize()
            .modulate({
                brightness: 1.1,
                contrast: 1.3
            })
            .sharpen({
                sigma: 1.2,
                m1: 30,
                m2: 50
            })
            // Ensure consistent color space
            .toColorspace('srgb')
            // Use PNG for best quality
            .png({
                quality: 100,
                compression: 9,
                force: true
            })
            .toBuffer();

        logInfo('Image Processing', `Processed image size: ${processedBuffer.length}`);
        return processedBuffer;
    } catch (error) {
        logError('Image Processing', error);
        return buffer; // Return original buffer if processing fails
    }
}

// Function to detect MCQ questions
function isMCQ(text) {
    const mcqPatterns = [
        /[a-e]\s*\.\s*\w+/i,          // a. answer
        /[a-e]\s*\)\s*\w+/i,          // a) answer
        /\([a-e]\)\s*\w+/i,           // (a) answer
        /option\s+[a-e]\s*:/i,        // option a:
        /choice\s+[a-e]\s*:/i,        // choice a:
        /answer\s+[a-e]\s*:/i,        // answer a:
        /^[a-e]$/i                    // single letter
    ];
    return mcqPatterns.some(pattern => pattern.test(text));
}

// Enhanced MCQ answer formatting
function formatMCQAnswer(answer) {
    try {
        answer = answer.trim().toLowerCase();
        answer = answer.replace(/^answer:\s*/i, '');

        const letterMatch = answer.match(/^[a-e]/i);
        if (letterMatch) {
            return letterMatch[0].toUpperCase();
        }

        const patterns = [
            /^(?:option|choice)?\s*([a-e])(?:\.|:|,|\)|\s|$)/i,
            /\(([a-e])\)/i,
            /^[^a-e]*([a-e])[^a-e]*$/i
        ];

        for (const pattern of patterns) {
            const match = answer.match(pattern);
            if (match) {
                return match[1].toUpperCase();
            }
        }

        logInfo('Format MCQ', 'No valid MCQ answer pattern found');
        return 'Invalid Answer';
    } catch (error) {
        logError('Format MCQ', error);
        return 'Error';
    }
}

// Enhanced text cleaning
function cleanOCRText(text) {
    try {
        if (!text) {
            logInfo('Clean OCR', 'Empty text received');
            return '';
        }

        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(line => !/^[-_\s]*$/.test(line))
            .filter(line => !/^[^a-zA-Z0-9]*$/.test(line));

        const questionLine = lines.findIndex(line =>
            line.match(/^\d+[\.)]/i) ||
            line.match(/question\s+\d+/i) ||
            line.match(/^q\.?\s*\d+/i)
        );

        if (questionLine === -1) {
            logInfo('Clean OCR', 'No question marker found, using full text');
            return lines.join('\n');
        }

        let relevantLines = [];
        let answerChoicesFound = false;

        for (let i = questionLine; i < lines.length; i++) {
            const line = lines[i];
            if (i !== questionLine && line.match(/^\d+[\.)]/)) break;

            if (line.match(/[a-e][\.)]\s+\w+/i)) answerChoicesFound = true;
            if (answerChoicesFound || !line.match(/^[a-e][\.)]\s*$/i)) {
                relevantLines.push(line);
            }
        }

        const result = relevantLines.join('\n');
        logInfo('Clean OCR', `Processed ${lines.length} lines into ${relevantLines.length} relevant lines`);
        return result;
    } catch (error) {
        logError('Clean OCR', error);
        return '';
    }
}

// Gemini analysis function
async function analyzeWithGemini(text) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            logInfo('Gemini Analysis', `Analyzing text for short answer, attempt ${attempt + 1}`);

            const prompt = `Given this question: ${text}\nProvide the single, best answer using one of the following formats, prioritizing the format that fits:

1. If the options are numbered or lettered, provide only the number or letter (e.g., "A", "1", "2", etc.). If multiple answers are correct, separate them with commas (e.g., "A,B").
2. If the options are rows and the correct answer is a specific row, provide the row number.
3. If the answer is a word, provide only one or two words maximum. If there are multiple valid word answers, separate them by commas (e.g., "cat,dog").
4. If none of the above fit, prioritize the simplest word or number answer available.
Do not include any explanations or additional text, only the answer itself using the above-specified formats.`;

            const result = await Promise.race([
                geminiModel.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 100,
                        topP: 0.8,
                        topK: 40
                    }
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), 15000)
                )
            ]);

            const response = result.response.text().trim();

            // Clean up the response
            let cleanedResponse = response
                .replace(/^(answer:?\s*)/i, '') // Remove "Answer:" prefix
                .split(/[.()]/, 1)[0].trim() // Remove everything after period or parenthesis
                .split(/\s+(?:but|note|however)/i, 1)[0].trim(); // Remove explanations

            logInfo('Gemini Analysis', `Received answer: ${cleanedResponse}`);
            return cleanedResponse;

        } catch (error) {
            logError('Gemini Analysis', `Attempt ${attempt + 1} failed: ${error.message}`);

            // If this was our last retry, throw the error
            if (attempt === maxRetries - 1) {
                throw new Error(`Gemini API failed after ${maxRetries} attempts: ${error.message}`);
            }

            // Wait before retrying (exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000); // Max 8 second delay
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }

    // This should never be reached due to the throw in the last retry
    throw new Error('Unexpected error in Gemini analysis');
}

// Enhanced Claude analysis
async function analyzeWithClaude(text, forceMCQ = true) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            logInfo('Claude Analysis', `Analyzing text (MCQ: ${forceMCQ}), attempt ${attempt + 1}`);

            const prompt = forceMCQ ?
                `For this multiple choice question:\n${text}\n\nRespond with ONLY a single letter (A, B, C, D, or E) representing the correct answer. Do not include any periods, explanations, or other text. Just one letter.` :
                `Given this question: ${text}\nProvide ONLY 1-2 words as the answer. If multiple answers are possible, separate them with commas. No explanations or additional text.`;

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                    'x-api-key': CLAUDE_API_KEY
                },
                body: JSON.stringify({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 1024,
                    temperature: 0.1,
                    messages: [{
                        role: "user",
                        content: prompt
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            if (!data.content?.[0]?.text) {
                throw new Error('Invalid response format');
            }

            let answer = data.content[0].text.trim();

            // Clean up non-MCQ answers
            if (!forceMCQ) {
                // Remove any "Answer:" prefix
                answer = answer.replace(/^(answer:?\s*)/i, '');
                // Remove everything after a period or parenthesis
                answer = answer.split(/[.()]/, 1)[0].trim();
                // Remove any additional explanations after "but" or "note"
                answer = answer.split(/\s+(?:but|note)/i, 1)[0].trim();
            }

            logInfo('Claude Analysis', `Received answer: ${answer}`);
            return forceMCQ ? formatMCQAnswer(answer) : answer;

        } catch (error) {
            logError('Claude Analysis', `Attempt ${attempt + 1} failed: ${error.message}`);

            // If this was our last retry, throw the error
            if (attempt === maxRetries - 1) {
                throw error;
            }

            // Wait before retrying (exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000); // Max 8 second delay
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }
}

// Text analysis endpoint
app.post('/analyze', async (req, res) => {
    const startTime = Date.now();
    try {
        const { text, isShortAnswer = false, useGemini = false } = req.body;

        let answer;
        if (useGemini) {
            logInfo('Text Analysis', 'Using Gemini for short answer');
            answer = await analyzeWithGemini(text);
        } else {
            logInfo('Text Analysis', `Using Claude (${isShortAnswer ? 'short answer' : 'MCQ'})`);
            answer = await analyzeWithClaude(text, !isShortAnswer);
        }

        const processingTime = Date.now() - startTime;
        logInfo('Text Analysis', `Completed in ${processingTime}ms`);

        res.json({ answer, processingTime });
    } catch (error) {
        logError('Text Analysis', error);
        res.status(500).json({
            error: error.message,
            processingTime: Date.now() - startTime
        });
    }
});

// Image analysis endpoint with debug features
app.post('/analyze-image', async (req, res) => {
    const startTime = Date.now();
    try {
        if (!client) {
            throw new Error('Vision client not initialized');
        }

        const { imageData, isShortAnswer = false } = req.body;
        if (!imageData) {
            throw new Error('No image data provided');
        }

        logInfo('Image Analysis', 'Processing image data');
        console.log('Image data length:', imageData.length);
        console.log('Image data starts with:', imageData.substring(0, 50));

        const base64Image = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Image, 'base64');

        // Save original image
        const originalImagePath = await saveDebugImage(buffer, 'original');

        // Process and save processed image
        const processedBuffer = await preprocessImage(base64Image);
        const processedImagePath = await saveDebugImage(processedBuffer, 'processed');

        logInfo('Vision API', `Attempting text detection with image buffer size: ${processedBuffer.length}`);

        const request = {
            image: { content: processedBuffer },
            imageContext: {
                languageHints: ['en'],
                textDetectionParams: {
                    enableTextDetectionConfidenceScore: true
                }
            }
        };

        const [result] = await client.textDetection(request);

        console.log('Raw Vision API result:', JSON.stringify(result, null, 2));

        if (!result) {
            throw new Error('No result from Vision API');
        }

        const detections = result.textAnnotations;
        if (!detections || detections.length === 0) {
            throw new Error(
                'No text detected in image. Debug images saved at: ' +
                `Original: ${originalImagePath}, Processed: ${processedImagePath}`
            );
        }

        logInfo('Vision API', `Detected ${detections.length} text annotations`);
        logInfo('Vision API', `First detection confidence: ${detections[0].confidence}`);

        const extractedText = detections[0].description;
        logInfo('Text Extraction', `Extracted ${extractedText.length} characters`);
        console.log('Extracted text:', extractedText);

        const cleanedText = cleanOCRText(extractedText);
        if (!cleanedText) {
            throw new Error('No readable question text found in image');
        }

        logInfo('Text Processing', `Cleaned text: ${cleanedText}`);

        // Detect if the text appears to be an MCQ
        const isMcqQuestion = isMCQ(cleanedText);
        logInfo('Question Type', `Is MCQ: ${isMcqQuestion}`);

        // If it's an MCQ, use MCQ mode, otherwise use short answer mode
        const answer = await analyzeWithClaude(cleanedText, isMcqQuestion)

        const processingTime = Date.now() - startTime;
        logInfo('Analysis Complete', `Processed in ${processingTime}ms`);

        res.json({
            answer,
            confidence: detections[0].confidence,
            processingTime,
            textExtracted: cleanedText,
            debugImages: {
                original: originalImagePath,
                processed: processedImagePath
            }
        });
    } catch (error) {
        logError('Image Analysis', error);
        res.status(500).json({
            error: error.message,
            processingTime: Date.now() - startTime
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        vision: client ? 'initialized' : 'not initialized',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logError('Server Error', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Create debug directory on startup
if (!fs.existsSync('./debug-images')) {
    fs.mkdirSync('./debug-images');
    console.log('\x1b[32m%s\x1b[0m', '✅ Created debug-images directory');
}

// Validate Vision client on startup
(async () => {
    try {
        const testBuffer = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            'base64'
        );
        await client.textDetection({
            image: { content: testBuffer }
        });
        console.log('\x1b[32m%s\x1b[0m', '✅ Vision client successfully validated');
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', '❌ Vision client validation failed:', error.message);
        process.exit(1);
    }
})();

// Start server
const PORT = 3001;
app.listen(PORT, () => {
    console.log('\x1b[32m%s\x1b[0m', `🚀 Server running on port ${PORT}`);
    console.log('\x1b[36m%s\x1b[0m', '🔍 Ready to process images and text');
});