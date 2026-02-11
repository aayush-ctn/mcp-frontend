const BASE_URL = "http://localhost:5001";
const SET_API_KEY_URL = `${BASE_URL}/api/front/set-api-key`;
const CHAT_URL = `${BASE_URL}/mcp/handle-chat`;

let authToken = null;
let sessionUuid = null; // Store session UUID
let userUuid = null; // Store user UUID

// Set API Key function
async function setApiKey() {
    const userNameInput = document.getElementById("user-name");
    const apiKeyInput = document.getElementById("api-key");
    const errorDiv = document.getElementById("setup-error");

    const userName = userNameInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!userName || !apiKey) {
        errorDiv.textContent = "Please enter both User Name and API Key";
        return;
    }

    errorDiv.textContent = "";

    try {
        const response = await fetch(SET_API_KEY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_name: userName,
                api_key: apiKey
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to set API key: ${response.status}`);
        }

        const data = await response.json();
        authToken = data.token || data.data?.token || data.accessToken || data.access_token;

        if (!authToken) {
            console.error("Token not found in response:", data);
            throw new Error("No token received from server");
        }

        // Reset session when setting new API key
        sessionUuid = null;
        userUuid = null;

        // Hide API setup, show chat
        document.getElementById("api-setup-container").style.display = "none";
        document.getElementById("chat-container").style.display = "flex";

        addMessage("API Key set successfully! You can start chatting now.", "bot");
    } catch (error) {
        console.error("API Key setup error:", error);
        errorDiv.textContent = "Failed to set API key: " + error.message;
    }
}

// Reset API Key function
function resetApiKey() {
    authToken = null;
    sessionUuid = null;
    userUuid = null;

    document.getElementById("api-setup-container").style.display = "flex";
    document.getElementById("chat-container").style.display = "none";
    document.getElementById("chat-box").innerHTML = "";
    document.getElementById("user-name").value = "";
    document.getElementById("api-key").value = "";
}

// Add message to chat
function addMessage(text, type) {
    const chatBox = document.getElementById("chat-box");
    if (!chatBox) {
        console.error("chat-box not found");
        return;
    }

    const messageDiv = document.createElement("div");
    messageDiv.className = "message " + type;
    messageDiv.innerText = text;
    chatBox.appendChild(messageDiv);

    // Auto-scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Add loading indicator
function addLoadingIndicator() {
    const chatBox = document.getElementById("chat-box");
    if (!chatBox) {
        console.error("chat-box not found");
        return;
    }

    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message bot loading-message";
    loadingDiv.id = "loading-indicator";
    loadingDiv.innerHTML = `
        <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
    chatBox.appendChild(loadingDiv);

    // Auto-scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Remove loading indicator
function removeLoadingIndicator() {
    const loadingIndicator = document.getElementById("loading-indicator");
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

// Send message
async function sendMessage() {
    const input = document.getElementById("message-input");
    if (!input) {
        console.error("message-input not found");
        return;
    }

    const message = input.value.trim();
    if (!message) return;

    if (!authToken) {
        addMessage("Error: API key not set. Please set your API key.", "bot");
        setTimeout(() => resetApiKey(), 1000);
        return;
    }

    addMessage(message, "user");
    input.value = "";

    // Show loading indicator
    addLoadingIndicator();

    try {
        // Build request body
        const requestBody = {
            prompt: message,
            model: "gpt-4o-mini",
            provider: "CHATGPT"
        };

        // Add session_uuid and user_uuid if they exist (for continuing conversation)
        if (sessionUuid) {
            requestBody.session_uuid = sessionUuid;
        }
        if (userUuid) {
            requestBody.user_uuid = userUuid;
        }

        console.log("Request body:", requestBody); // Debug log

        const response = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "token": authToken
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error("Session expired. Please set your API key again.");
            }
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Response data:", data); // Debug log

        // Store session_uuid and user_uuid from the first response
        if (data.data?.session_uuid) {
            sessionUuid = data.data.session_uuid;
            console.log("Session UUID stored:", sessionUuid);
        }
        if (data.data?.user_uuid) {
            userUuid = data.data.user_uuid;
            console.log("User UUID stored:", userUuid);
        }

        // Remove loading indicator before showing response
        removeLoadingIndicator();

        // Display the bot's response
        const botMessage = data.data?.response || data.response || data.message || JSON.stringify(data);
        addMessage(botMessage, "bot");
    } catch (error) {
        console.error("Chat error:", error);

        // Remove loading indicator on error
        removeLoadingIndicator();

        addMessage("Error: " + error.message, "bot");

        if (error.message.includes("API key again") || error.message.includes("Session expired")) {
            setTimeout(() => resetApiKey(), 2000);
        }
    }
}

// Optional: Add a "New Conversation" button functionality
function startNewConversation() {
    sessionUuid = null;
    userUuid = null;
    document.getElementById("chat-box").innerHTML = "";
    addMessage("New conversation started!", "bot");
}