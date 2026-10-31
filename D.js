const topicCards = [...document.querySelectorAll(".topic-card")];
const topicSections = [...document.querySelectorAll(".topic-section")];
const searchInput = document.querySelector("#topic-search");
const clearSearchButton = document.querySelector("#clear-search");
const searchStatus = document.querySelector("#search-status");

if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    document.querySelectorAll(".reveal").forEach((element) => {
        revealObserver.observe(element);
    });
} else {
    document.querySelectorAll(".reveal").forEach((element) => {
        element.classList.add("is-visible");
    });
}

function filterTopics() {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    topicCards.forEach((card) => {
        const searchableText = `${card.dataset.search} ${card.textContent}`.toLowerCase();
        const matches = !query || searchableText.includes(query);
        card.hidden = !matches;

        if (matches) {
            visibleCount += 1;
        }
    });

    topicSections.forEach((section) => {
        section.hidden = query.length > 0 && !section.querySelector(".topic-card:not([hidden])");
    });

    clearSearchButton.hidden = query.length === 0;
    searchStatus.textContent = query
        ? `${visibleCount} ${visibleCount === 1 ? "topic" : "topics"} found`
        : "";
}

searchInput.addEventListener("input", filterTopics);
clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    filterTopics();
    searchInput.focus();
});

const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector("#chat-messages");
const chatSendButton = document.querySelector("#chat-send");
const chatStatus = document.querySelector("#chat-status");
const suggestionButtons = [...document.querySelectorAll(".suggestion-button")];
const keyToggle = document.querySelector("#toggle-key-panel");
const keyPanel = document.querySelector("#chat-key-panel");
const apiProviderSelect = document.querySelector("#api-provider");
const apiKeyInput = document.querySelector("#api-key-input");
const forgetApiKeyButton = document.querySelector("#forget-api-key");
const conversation = [];
let sessionApiKey = "";
let sessionApiProvider = "gemini";

keyToggle.addEventListener("click", () => {
    keyPanel.hidden = !keyPanel.hidden;
    keyToggle.setAttribute("aria-expanded", String(!keyPanel.hidden));
    if (!keyPanel.hidden) {
        apiKeyInput.focus();
    }
});

keyPanel.addEventListener("submit", (event) => {
    event.preventDefault();
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
        chatStatus.textContent = "Paste your API key first.";
        apiKeyInput.focus();
        return;
    }

    sessionApiKey = apiKey;
    sessionApiProvider = apiProviderSelect.value;
    apiKeyInput.value = "";
    apiProviderSelect.disabled = true;
    forgetApiKeyButton.hidden = false;
    keyToggle.textContent = `${sessionApiProvider === "gemini" ? "Gemini" : "OpenAI"} key added`;
    keyPanel.hidden = true;
    keyToggle.setAttribute("aria-expanded", "false");
    chatStatus.textContent = "API key set for this page session.";
});

forgetApiKeyButton.addEventListener("click", () => {
    sessionApiKey = "";
    apiProviderSelect.disabled = false;
    forgetApiKeyButton.hidden = true;
    keyToggle.textContent = "Add API key";
    chatStatus.textContent = "Page API key removed. The server may still have its own key.";
});

function addChatMessage(role, text, extraClass = "") {
    const message = document.createElement("div");
    message.className = `chat-message ${role}-message ${extraClass}`.trim();

    const name = document.createElement("span");
    name.className = "message-name";
    name.textContent = role === "user" ? "You" : "Deary";

    const content = document.createElement("p");
    content.textContent = text;

    message.append(name, content);
    chatMessages.append(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return message;
}

chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = chatInput.value.trim();

    if (!question || chatSendButton.disabled) {
        return;
    }

    addChatMessage("user", question);
    chatInput.value = "";
    chatInput.disabled = true;
    chatSendButton.disabled = true;
    suggestionButtons.forEach((button) => {
        button.disabled = true;
    });
    chatStatus.textContent = "Deary is thinking...";

    const thinkingMessage = document.createElement("div");
    thinkingMessage.className = "chat-message assistant-message thinking-message";
    thinkingMessage.setAttribute("role", "status");
    const thinkingName = document.createElement("span");
    thinkingName.className = "message-name";
    thinkingName.textContent = "Deary";
    const thinkingText = document.createElement("p");
    thinkingText.append("Thinking");
    const thinkingDots = document.createElement("span");
    thinkingDots.className = "thinking-dots";
    thinkingDots.setAttribute("aria-hidden", "true");
    thinkingDots.textContent = "...";
    thinkingText.append(thinkingDots);
    thinkingMessage.append(thinkingName, thinkingText);
    chatMessages.append(thinkingMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 55000);

    try {
        const headers = { "Content-Type": "application/json" };
        if (sessionApiKey) {
            headers["x-ai-api-key"] = sessionApiKey;
        }
        headers["x-ai-provider"] = sessionApiKey ? sessionApiProvider : apiProviderSelect.value;

        const response = await fetch("/api/chat", {
            method: "POST",
            headers,
            body: JSON.stringify({
                messages: [...conversation, { role: "user", content: question }]
            }),
            signal: controller.signal
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) {
            if (window.location.port === "5500" || contentType.toLowerCase().includes("text/html")) {
                throw new Error("The AI server isn't running. Live Server (port 5500) only serves the website files. In the project folder, run `npm start`, then open http://localhost:3000 instead.");
            }
            throw new Error("The chat server returned a non-JSON response. Start it with `npm start` and open http://localhost:3000.");
        }

        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error("The chat server returned invalid JSON. Restart it with `npm start` and try again.");
        }

        if (!response.ok) {
            throw new Error(result.error || "Deary couldn't answer just now. Please try again.");
        }

        if (typeof result.answer !== "string" || !result.answer.trim()) {
            throw new Error("Deary returned an empty answer. Please try asking again.");
        }

        conversation.push(
            { role: "user", content: question },
            { role: "assistant", content: result.answer }
        );
        if (conversation.length > 12) {
            conversation.splice(0, conversation.length - 12);
        }
        addChatMessage("assistant", result.answer);
        const provider = sessionApiKey ? sessionApiProvider : apiProviderSelect.value;
        chatStatus.textContent = `Replies are generated by ${provider === "gemini" ? "Google Gemini" : "OpenAI"}.`;
    } catch (error) {
        const message = error.name === "AbortError"
            ? "Deary took too long to reply. Please try again."
            : error instanceof TypeError
                ? "Couldn't reach the chat server. Make sure the website server is running, then try again."
                : error instanceof Error
                    ? error.message
                    : "Deary couldn't answer just now. Please try again.";
        addChatMessage("assistant", message, "error-message");
        chatStatus.textContent = "No reply received. You can try again.";
    } finally {
        window.clearTimeout(timeoutId);
        thinkingMessage.remove();
        chatInput.disabled = false;
        chatSendButton.disabled = false;
        suggestionButtons.forEach((button) => {
            button.disabled = false;
        });
        chatInput.focus();
    }
});

chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        chatForm.requestSubmit();
    }
});

suggestionButtons.forEach((button) => {
    button.addEventListener("click", () => {
        chatInput.value = button.textContent;
        chatForm.requestSubmit();
    });
});