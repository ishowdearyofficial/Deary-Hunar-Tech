const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;
const rateLimits = new Map();

const staticFiles = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/main.css", ["main.css", "text/css; charset=utf-8"]],
    ["/D.js", ["D.js", "text/javascript; charset=utf-8"]]
]);

class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

function sendJson(response, statusCode, data) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });
    response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
    const chunks = [];
    let size = 0;

    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            throw new HttpError(413, "Your message is too large. Please shorten it and try again.");
        }
        chunks.push(chunk);
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new HttpError(400, "The chat request was not valid JSON.");
    }
}

function validateMessages(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
        throw new HttpError(400, "Send between 1 and 12 chat messages.");
    }

    const messages = value.map((message) => {
        if (
            !message ||
            !["user", "assistant"].includes(message.role) ||
            typeof message.content !== "string"
        ) {
            throw new HttpError(400, "Each chat message needs a valid role and text.");
        }

        const content = message.content.trim();
        if (!content || content.length > MAX_MESSAGE_LENGTH) {
            throw new HttpError(400, "Each message must be between 1 and 2,000 characters.");
        }

        return { role: message.role, content };
    });

    if (messages[messages.length - 1].role !== "user") {
        throw new HttpError(400, "The last chat message must be a question from you.");
    }

    return messages;
}

function checkRateLimit(ipAddress) {
    const now = Date.now();
    let record = rateLimits.get(ipAddress);

    if (!record || record.resetAt <= now) {
        record = { count: 0, resetAt: now + RATE_WINDOW_MS };
        rateLimits.set(ipAddress, record);
    }

    if (record.count >= RATE_LIMIT) {
        return false;
    }

    record.count += 1;
    return true;
}

async function handleChat(request, response) {
    const requestProvider = request.headers["x-ai-provider"] || "openai";
    if (!["openai", "gemini"].includes(requestProvider)) {
        throw new HttpError(400, "Choose either Gemini or OpenAI as the AI provider.");
    }
    const provider = requestProvider;
    const requestApiKey = request.headers["x-ai-api-key"];
    const apiKey = typeof requestApiKey === "string" && requestApiKey.trim()
        ? requestApiKey.trim()
        : provider === "gemini"
            ? process.env.GEMINI_API_KEY
            : process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            503,
            `Add a ${provider === "gemini" ? "Gemini" : "OpenAI"} API key with the chat's Add API key button, or configure ${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} on the server.`
        );
    }
    if (apiKey.length > 512) {
        throw new HttpError(400, "The API key is too long.");
    }

    const contentType = request.headers["content-type"] || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
        throw new HttpError(415, "The chat request must use JSON.");
    }

    if (!checkRateLimit(request.socket.remoteAddress || "unknown")) {
        throw new HttpError(429, "Too many questions in a short time. Please wait a minute and try again.");
    }

    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "The chat request must contain a messages list.");
    }
    const messages = validateMessages(body.messages);
    let upstream;

    try {
        if (provider === "gemini") {
            upstream = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`,
                {
                    method: "POST",
                    headers: {
                        "x-goog-api-key": apiKey,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        systemInstruction: {
                            parts: [{
                                text: "You are Deary, a friendly and patient AI tutor on Deary Tech. Explain concepts in plain language, especially computer hardware, operating systems, and AI. Answer other reasonable questions too. Give useful, concise explanations with brief reasoning when helpful; do not provide hidden chain-of-thought. Be honest when uncertain, and remind the user to verify important information."
                            }]
                        },
                        contents: messages.map((message) => ({
                            role: message.role === "assistant" ? "model" : "user",
                            parts: [{ text: message.content }]
                        })),
                        generationConfig: { maxOutputTokens: 700 }
                    }),
                    signal: AbortSignal.timeout(45000)
                }
            );
        } else {
            upstream = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
                    messages: [
                        {
                            role: "system",
                            content: "You are Deary, a friendly and patient AI tutor on Deary Tech. Explain concepts in plain language, especially computer hardware, operating systems, and AI. Answer other reasonable questions too. Give useful, concise explanations with a brief summary of the key reasoning steps when helpful; do not provide hidden chain-of-thought. Be honest when uncertain, and remind the user to verify important information."
                        },
                        ...messages
                    ],
                    max_completion_tokens: 700
                }),
                signal: AbortSignal.timeout(45000)
            });
        }
    } catch (error) {
        if (error.name === "TimeoutError") {
            throw new HttpError(504, "The AI took too long to reply. Please try again.");
        }
        throw new HttpError(502, `Couldn't reach ${provider === "gemini" ? "Google Gemini" : "OpenAI"}. Check the server's internet connection and try again.`);
    }

    if (upstream.status === 401 || upstream.status === 403) {
        throw new HttpError(502, `${provider === "gemini" ? "Google Gemini" : "OpenAI"} rejected the API key. Check the key and provider access.`);
    }
    if (upstream.status === 429) {
        throw new HttpError(502, `${provider === "gemini" ? "Gemini" : "OpenAI"} has reached a usage limit or is busy. Check your API usage and try again.`);
    }
    if (!upstream.ok) {
        throw new HttpError(502, `${provider === "gemini" ? "Gemini" : "OpenAI"} couldn't complete the request (HTTP ${upstream.status}). Check the model and API account settings.`);
    }

    let result;
    try {
        result = await upstream.json();
    } catch {
        throw new HttpError(502, `${provider === "gemini" ? "Gemini" : "OpenAI"} returned an unreadable response. Please try again.`);
    }

    const answer = provider === "gemini"
        ? result?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("")
        : result?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
        throw new HttpError(502, `${provider === "gemini" ? "Gemini" : "OpenAI"} returned an empty answer. Please try again.`);
    }

    sendJson(response, 200, { answer: answer.trim() });
}

async function handleRequest(request, response) {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    );

    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/chat") {
        if (request.method !== "POST") {
            response.setHeader("Allow", "POST");
            throw new HttpError(405, "Use POST to send a chat question.");
        }
        await handleChat(request, response);
        return;
    }

    if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        throw new HttpError(405, "This page only supports GET requests.");
    }

    const file = staticFiles.get(requestUrl.pathname);
    if (!file) {
        throw new HttpError(404, "Page not found.");
    }

    const [fileName, contentType] = file;
    const content = await readFile(path.join(__dirname, fileName));
    response.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff"
    });
    response.end(content);
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error("PORT must be a valid port number between 1 and 65535.");
}

createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
        if (response.headersSent) {
            response.destroy(error);
            return;
        }

        if (error instanceof HttpError) {
            sendJson(response, error.statusCode, { error: error.message });
            return;
        }

        console.error("Request failed:", error);
        sendJson(response, 500, { error: "The server couldn't complete that request. Please try again." });
    });
}).listen(PORT, HOST, () => {
    console.log(`Deary Tech is running at http://${HOST}:${PORT}`);
});
