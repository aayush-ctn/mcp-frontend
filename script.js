const BASE_URL = "http://localhost:5001";
const SET_API_KEY_URL = `${BASE_URL}/api/front/set-api-key`;
const CHAT_URL = `${BASE_URL}/mcp/handle-chat`;

let authToken = null;

// Set API Key function
async function setApiKey() {
    const userIdInput = document.getElementById("user-id");
    const apiKeyInput = document.getElementById("api-key");
    const errorDiv = document.getElementById("setup-error");
    
    const userId = userIdInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    
    if (!userId || !apiKey) {
        errorDiv.textContent = "Please enter both User ID and API Key";
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
                user_id: userId,
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
    document.getElementById("api-setup-container").style.display = "flex";
    document.getElementById("chat-container").style.display = "none";
    document.getElementById("chat-box").innerHTML = "";
    document.getElementById("user-id").value = "";
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
    
    try {
        const response = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "token": authToken  // CHANGED: Send token in custom "token" header instead of Authorization
            },
            body: JSON.stringify({ 
                prompt: message,  // CHANGED: Your backend expects "prompt" not "message"
                model: "gpt-4o-mini",   // Add your default model
                provider: "CHATGPT" // Add your default provider
            })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error("Session expired. Please set your API key again.");
            }
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Display the bot's response - your backend returns "response" field
        const botMessage = data.data?.response || data.response || data.message || JSON.stringify(data);
        addMessage(botMessage, "bot");
        
    } catch (error) {
        console.error("Chat error:", error);
        addMessage("Error: " + error.message, "bot");
        
        if (error.message.includes("API key again") || error.message.includes("Session expired")) {
            setTimeout(() => resetApiKey(), 2000);
        }
    }
}