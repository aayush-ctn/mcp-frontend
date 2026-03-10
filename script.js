const BASE_URL = "http://localhost:5001"

let token     = null   // Token 1 — from loginUser, for projects/tools APIs
let chatToken = null   // Token 2 — from setApiKey, for mcp/handle-chat
let userName  = null
let projectId   = null
let projectName = null
let sessionUuid = null
let userUuid    = null

// Auth modal state
let pendingAuthToolId   = null
let pendingAuthToolName = null
let pendingAuthType     = null
let pendingMessage      = null   // original message to re-send after auth saved

// Track which tools have auth saved in current session (tool_id -> true/false)
// Resets when sessionUuid changes (new chat)
const toolAuthSavedMap = {}

// Full tool data cache
let chatToolsCache = []


/* ─── SCREEN NAVIGATION ─────────────────────────────────────────── */

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"))
    document.getElementById(id).classList.remove("hidden")
}

function logout() {
    console.log("[AUTH] Logging out — clearing all tokens and state")
    token     = null
    chatToken = null
    userName  = null
    projectId   = null
    projectName = null
    sessionUuid = null
    userUuid    = null
    showScreen("api-screen")
    document.getElementById("user-name").value = ""
    document.getElementById("api-error").innerText = ""
}


/* ─── SHARED JSON SANITIZER ─────────────────────────────────────── */

function sanitizeJSON(raw) {
    return raw
        .replace(/^\uFEFF/, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\u00A0/g, ' ')
        .replace(/\u2013|\u2014/g, '-')
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
        .trim()
}


/* ─── AUTH: LOGIN / CREATE ───────────────────────────────────────── */

async function loginUser() {
    const name = document.getElementById("user-name").value.trim()
    const err  = document.getElementById("api-error")
    if (!name) { err.innerText = "Please enter your username."; return }
    err.innerText = ""

    console.log("[AUTH] Attempting login for user:", name)

    try {
        const res  = await fetch(`${BASE_URL}/api/user/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        })
        const data = await res.json()
        console.log("[AUTH] Login response status:", res.status, "| data:", data)

        if (!res.ok) { err.innerText = data?.message || "Login failed."; return }

        token = data.data?.user?.token
        if (!token) { err.innerText = "No token returned from server."; return }

        userName = name
        console.log("[AUTH] Token 1 stored ✓ | userName:", userName)
        showScreen("project-screen")
        loadProjects()
    } catch (e) {
        console.error("[AUTH] Login error:", e)
        err.innerText = "Login failed. Check your username."
    }
}

async function createUser() {
    const name = document.getElementById("user-name").value.trim()
    const err  = document.getElementById("api-error")
    if (!name) { err.innerText = "Please enter a username to create an account."; return }
    err.innerText = ""

    console.log("[AUTH] Creating account for:", name)

    try {
        const res  = await fetch(`${BASE_URL}/api/user/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        })
        const data = await res.json()
        console.log("[AUTH] Create user response status:", res.status, "| data:", data)

        if (!res.ok) { err.innerText = data?.message || "Could not create account."; return }

        err.style.color = "#27ae60"
        err.innerText = "Account created! You can now sign in."
        setTimeout(() => { err.style.color = ""; err.innerText = "" }, 3000)
    } catch (e) {
        console.error("[AUTH] Create user error:", e)
        err.innerText = "Failed to create account."
    }
}


/* ─── PROJECTS ───────────────────────────────────────────────────── */

async function loadProjects() {
    const container = document.getElementById("project-list")
    container.innerHTML = "<p class='empty-msg'>Loading...</p>"

    console.log("[PROJECTS] Fetching | token:", token ? "present ✓" : "MISSING ✗")

    const res  = await fetch(`${BASE_URL}/api/projects/list`, { headers: { token } })
    const data = await res.json()
    console.log("[PROJECTS] Status:", res.status, "| count:", data?.data?.projects?.length ?? 0)

    const projects = data?.data?.projects || []
    container.innerHTML = ""
    if (projects.length === 0) {
        container.innerHTML = "<p class='empty-msg'>No projects yet — create one below.</p>"
        return
    }
    projects.forEach(p => {
        const pid = p.id || p._id
        const div = document.createElement("div")
        div.className = "list-item" + (pid === projectId ? " active-item" : "")
        div.innerHTML = `
            <div class="item-info">
                <span class="item-name">${p.name}</span>
                <span class="item-sub">${p.description || ""}</span>
            </div>
            <div class="item-actions">
                <span class="tool-count-badge">${p.toolCount ?? 0} tools</span>
                <button onclick="selectProject('${pid}', '${p.name}')">Select →</button>
            </div>`
        container.appendChild(div)
    })
}

async function createProject() {
    const name = document.getElementById("project-name").value.trim()
    const desc = document.getElementById("project-desc").value.trim()
    if (!name) { alert("Project name is required."); return }

    console.log("[PROJECTS] Creating:", name)

    const btn = document.getElementById("create-project-btn")
    btn.disabled = true; btn.innerText = "Creating..."
    const res = await fetch(`${BASE_URL}/api/projects/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ name, description: desc })
    })
    const data = await res.json()
    console.log("[PROJECTS] Create status:", res.status, "| data:", data)

    document.getElementById("project-name").value = ""
    document.getElementById("project-desc").value = ""
    btn.disabled = false; btn.innerText = "Create Project"
    loadProjects()
}

function selectProject(id, name) {
    console.log("[PROJECTS] Selected | id:", id, "| name:", name)
    projectId   = id
    projectName = name
    sessionUuid = null
    userUuid    = null
    // Clear session-scoped auth map when switching projects
    Object.keys(toolAuthSavedMap).forEach(k => delete toolAuthSavedMap[k])
    goToTools()
}


/* ─── TOOLS ──────────────────────────────────────────────────────── */

function goToTools() {
    if (!projectId) { alert("Select a project first."); return }
    document.getElementById("active-project-label").innerText = projectName
    showScreen("tool-screen")
    loadTools()
}

async function loadTools() {
    const container = document.getElementById("tool-list")
    container.innerHTML = "<p class='empty-msg'>Loading...</p>"

    console.log("[TOOLS] Loading | projectId:", projectId, "| token:", token ? "✓" : "✗")

    const res  = await fetch(`${BASE_URL}/api/tools/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ project_id: projectId })
    })
    const data = await res.json()
    console.log("[TOOLS] Status:", res.status, "| raw count:", data?.data?.tools?.length ?? 0)
    console.log("[TOOLS] Raw tools:", data?.data?.tools)

    const tools = (data?.data?.tools || []).filter(t => String(t.project_id) === String(projectId))
    console.log("[TOOLS] Filtered count:", tools.length)

    container.innerHTML = ""
    if (tools.length === 0) {
        container.innerHTML = "<p class='empty-msg'>No tools yet — create one below.</p>"
        return
    }
    tools.forEach(t => {
        const tid = t.id || t._id
        const div = document.createElement("div")
        div.className = "list-item"
        div.innerHTML = `
            <div class="item-info">
                <span class="item-name">${t.name}</span>
                <span class="item-sub">${t.description || ""}</span>
                <span class="item-meta">${t.method} · ${t.url}</span>
            </div>
            <div class="item-actions">
                ${t.auth_required ? `<span class="auth-badge">🔒 ${t.auth_type || "auth"}</span>` : ""}
                <button class="btn-danger" onclick="deleteTool('${tid}')">Delete</button>
            </div>`
        container.appendChild(div)
    })
}

function toggleAuthFields() {
    const checked = document.getElementById("tool-auth-required").checked
    const fields  = document.getElementById("auth-fields")
    checked ? fields.classList.remove("hidden") : fields.classList.add("hidden")
}

async function createTool() {
    if (!projectId) { alert("No project selected."); return }
    const name         = document.getElementById("tool-name").value.trim()
    const description  = document.getElementById("tool-description").value.trim()
    const url          = document.getElementById("tool-url").value.trim()
    const method       = document.getElementById("tool-method").value
    const headersText  = document.getElementById("tool-headers").value.trim()
    const queryText    = document.getElementById("tool-query-fields").value.trim()
    const bodyText     = document.getElementById("tool-body-fields").value.trim()
    const authRequired = document.getElementById("tool-auth-required").checked
    const authType     = document.getElementById("tool-auth-type").value

    if (!name)        { alert("Tool name is required."); return }
    if (!description) { alert("Description is required."); return }
    if (!url)         { alert("URL is required."); return }

    let headers = {}
    try {
        const cleanHeaders = sanitizeJSON(headersText)
        headers = cleanHeaders ? JSON.parse(cleanHeaders) : {}
    } catch(e) {
        alert("Invalid Headers JSON.\n\nError: " + e.message)
        return
    }

    const queryParamFields = {}
    if (queryText) queryText.split(",").map(v => v.trim()).filter(Boolean).forEach(k => queryParamFields[k] = "string")

    const bodyParamFields = {}
    if (bodyText) bodyText.split(",").map(v => v.trim()).filter(Boolean).forEach(k => bodyParamFields[k] = "string")

    const payload = {
        project_id: projectId, name, description, url, method,
        headers, queryParamFields, bodyParamFields,
        auth_required: authRequired,
        ...(authRequired ? { auth_type: authType } : {})
    }

    console.log("[TOOLS] Creating | payload:", payload)

    const btn = document.getElementById("create-tool-btn")
    btn.disabled = true; btn.innerText = "Creating..."

    const res    = await fetch(`${BASE_URL}/api/tools/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify(payload)
    })
    const result = await res.json()
    console.log("[TOOLS] Create status:", res.status, "| data:", result)

    btn.disabled = false; btn.innerText = "Create Tool"
    if (!res.ok) { alert("Error: " + (result?.message || "Failed to create tool")); return }

    ;["tool-name","tool-description","tool-url","tool-headers","tool-query-fields","tool-body-fields"]
        .forEach(id => document.getElementById(id).value = "")
    document.getElementById("tool-method").value = "GET"
    document.getElementById("tool-auth-required").checked = false
    document.getElementById("auth-fields").classList.add("hidden")
    loadTools()
}

async function deleteTool(id) {
    if (!confirm("Delete this tool?")) return
    console.log("[TOOLS] Deleting id:", id)
    const res = await fetch(`${BASE_URL}/api/tools/delete/${id}`, { method: "POST", headers: { token } })
    const data = await res.json()
    console.log("[TOOLS] Delete status:", res.status, "| data:", data)
    loadTools()
}


/* ─── API KEY SCREEN ─────────────────────────────────────────────── */

function goToApiKeyScreen() {
    if (!projectId) { alert("Select a project first."); return }
    showScreen("apikey-screen")
    document.getElementById("apikey-error").innerText = ""
}

async function setApiKeyAndGoToChat() {
    const apiKey = document.getElementById("chat-api-key").value.trim()
    const err    = document.getElementById("apikey-error")
    if (!apiKey) { err.innerText = "Please enter your API key."; return }
    err.innerText = ""

    console.log("[APIKEY] Calling set-api-key | userName:", userName, "| token1:", token ? "✓" : "✗")

    try {
        const res  = await fetch(`${BASE_URL}/api/front/set-api-key`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ api_key: apiKey, user_name: userName })
        })
        const data = await res.json()
        console.log("[APIKEY] Status:", res.status, "| data:", data)

        if (!res.ok) { err.innerText = data?.message || "Failed to save API key."; return }

        chatToken = data.data?.token
        console.log("[APIKEY] Token 2 (chat):", chatToken ? "stored ✓" : "MISSING ✗ — check setApiKey response shape")

        if (!chatToken) { err.innerText = "No chat token returned from server."; return }
        goToChat()
    } catch (e) {
        console.error("[APIKEY] Error:", e)
        err.innerText = "Could not reach the server."
    }
}


/* ─── CHAT ───────────────────────────────────────────────────────── */

const toolStateMap = {}

function goToChat() {
    if (!projectId) { alert("Select a project first."); return }
    document.getElementById("chat-project-label").innerText = projectName
    if (!sessionUuid) {
        document.getElementById("chat-box").innerHTML = ""
        // Clear auth map for fresh session
        Object.keys(toolAuthSavedMap).forEach(k => delete toolAuthSavedMap[k])
    }
    showScreen("chat-screen")
    loadChatTools()
}

async function loadChatTools() {
    const container = document.getElementById("chat-tools")
    container.innerHTML = ""

    console.log("[CHAT-TOOLS] Loading | projectId:", projectId, "| sessionUuid:", sessionUuid)

    const res  = await fetch(`${BASE_URL}/api/tools/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({
            project_id: projectId,
            ...(sessionUuid ? { session_uuid: sessionUuid } : {})
        })
    })
    const data = await res.json()
    const allTools = (data?.data?.tools || []).filter(t => String(t.project_id) === String(projectId))
    console.log("[CHAT-TOOLS] Status:", res.status, "| filtered count:", allTools.length)
    console.log("[CHAT-TOOLS] Auth tools:", allTools.filter(t => t.auth_required).map(t => ({ name: t.name, auth_required: t.auth_required, auth_type: t.auth_type })))

    chatToolsCache = allTools

    if (allTools.length === 0) {
        container.innerHTML = "<p class='empty-msg' style='font-size:12px'>No tools</p>"
        return
    }

    allTools.forEach(tool => {
        const tid    = tool.id || tool._id
        const active = typeof tool.is_active === "boolean" ? tool.is_active : true
        toolStateMap[tid] = active

        const div = document.createElement("div")
        div.className = "tool-toggle-item"

        const nameSpan = document.createElement("span")
        nameSpan.className = "toggle-name"
        nameSpan.innerText = tool.name

        const btn = document.createElement("button")
        btn.id        = `toggle-btn-${tid}`
        btn.innerText = active ? "ON" : "OFF"
        btn.className = `toggle-btn ${active ? "toggle-on" : "toggle-off"}`
        btn.disabled  = !sessionUuid
        btn.addEventListener("click", () => toggleChatTool(tid, btn))

        const row = document.createElement("div")
        row.className = "toggle-row"
        row.appendChild(nameSpan)

        if (tool.auth_required) {
            const authSaved = toolAuthSavedMap[tid] === true
            const authBadge = document.createElement("span")
            authBadge.className = "auth-badge-small"
            authBadge.id        = `auth-badge-${tid}`
            authBadge.innerText = authSaved ? "🔓" : "🔒"
            authBadge.title     = authSaved
                ? "Credential saved for this session — click to update"
                : "Auth required — click to set credential"
            authBadge.style.cursor = "pointer"
            authBadge.addEventListener("click", () => {
                // Clicking badge manually — no pending message (not triggered by failure)
                openAuthModal(tid, tool.name, tool.auth_type, null)
            })
            row.appendChild(authBadge)
        }

        row.appendChild(btn)

        const sub = document.createElement("span")
        sub.className = "toggle-sub"
        sub.innerText = `${tool.method} · ${tool.description || ""}`

        div.appendChild(row)
        div.appendChild(sub)
        container.appendChild(div)
    })

    if (!sessionUuid) {
        const hint = document.createElement("p")
        hint.className = "empty-msg"
        hint.style.cssText = "font-size:11px;margin-top:10px;color:#e6a817"
        hint.innerText = "⚠ Send a message first to enable toggling"
        container.appendChild(hint)
    }
}

async function toggleChatTool(id, btn) {
    if (!sessionUuid) {
        alert("Send a message first to start a session, then you can toggle tools.")
        return
    }

    const wasActive  = toolStateMap[id]
    const optimistic = !wasActive
    console.log("[TOGGLE] Tool:", id, "| current:", wasActive, "→", optimistic)

    setToggleBtn(btn, optimistic)
    btn.disabled = true

    try {
        const res  = await fetch(`${BASE_URL}/api/tools/toggle-status/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ session_uuid: sessionUuid })
        })
        const data = await res.json()
        console.log("[TOGGLE] Status:", res.status, "| confirmed is_active:", data?.data?.is_active)
        btn.disabled = false

        if (res.ok) {
            const confirmed = typeof data?.data?.is_active === "boolean" ? data.data.is_active : optimistic
            toolStateMap[id] = confirmed
            setToggleBtn(btn, confirmed)
        } else {
            toolStateMap[id] = wasActive
            setToggleBtn(btn, wasActive)
        }
    } catch (e) {
        console.error("[TOGGLE] Error:", e)
        btn.disabled = false
        toolStateMap[id] = wasActive
        setToggleBtn(btn, wasActive)
    }
}

function setToggleBtn(btn, isActive) {
    btn.innerText = isActive ? "ON" : "OFF"
    btn.className = `toggle-btn ${isActive ? "toggle-on" : "toggle-off"}`
}


/* ─── AUTH MODAL ─────────────────────────────────────────────────── */

// Default header key names per auth type — user can override
const headerKeyDefaults = {
    bearer:  "Authorization",
    api_key: "X-Api-Key",
    basic:   "Authorization"
}

const headerKeyHints = {
    bearer:  "Value will be sent as: Authorization: Bearer <value>",
    api_key: "Check the API docs for the correct header name (e.g. X-Api-Key, apikey, api-key)",
    basic:   "Value will be sent as: Authorization: Basic <base64(value)>"
}

function openAuthModal(toolId, toolName, authType, messageToResume) {
    pendingAuthToolId   = toolId
    pendingAuthToolName = toolName
    pendingAuthType     = authType
    pendingMessage      = messageToResume || null

    console.log("[AUTH-MODAL] Opening | tool:", toolName, "| type:", authType, "| hasResume:", !!messageToResume)

    const authSaved = toolAuthSavedMap[toolId] === true

    document.getElementById("auth-modal-title").innerText      = `${authSaved ? "🔓 Update" : "🔒 Authenticate"}: ${toolName}`
    document.getElementById("auth-modal-desc").innerText       = authSaved
        ? `Update the credential for this tool. Current session auth will be replaced.`
        : `This tool requires ${authType === "bearer" ? "a Bearer Token" : authType === "api_key" ? "an API Key" : "Basic Auth"}.`
    document.getElementById("auth-modal-header-key").value     = headerKeyDefaults[authType] || "Authorization"
    document.getElementById("auth-modal-header-hint").innerText = headerKeyHints[authType] || ""
    document.getElementById("auth-modal-value").value          = ""
    document.getElementById("auth-modal-error").innerText      = ""
    document.getElementById("auth-modal").classList.remove("hidden")
    setTimeout(() => document.getElementById("auth-modal-value").focus(), 100)
}

function closeAuthModal() {
    pendingAuthToolId   = null
    pendingAuthToolName = null
    pendingAuthType     = null
    pendingMessage      = null
    document.getElementById("auth-modal").classList.add("hidden")
}

async function confirmSaveToolAuth() {
    const headerKey = document.getElementById("auth-modal-header-key").value.trim()
    const value     = document.getElementById("auth-modal-value").value.trim()
    const err       = document.getElementById("auth-modal-error")

    if (!headerKey) { err.innerText = "Please enter the header name."; return }
    if (!value)     { err.innerText = "Please enter the credential value."; return }
    if (!pendingAuthToolId) { closeAuthModal(); return }

    // Session must exist to scope the auth — if no session yet, it will be created on first message
    // We allow saving even before session exists; backend will handle it on first tool call
    err.innerText = ""

    const toolId   = pendingAuthToolId
    const authType = pendingAuthType
    const message  = pendingMessage

    // Format value based on auth type
    let authValue = value
    if (authType === "bearer" && !value.startsWith("Bearer ")) {
        authValue = `Bearer ${value}`
    } else if (authType === "basic" && !value.startsWith("Basic ")) {
        authValue = `Basic ${btoa(value)}`
    }
    // api_key — send raw value, header key is user-specified

    console.log("[AUTH-MODAL] Saving | tool_id:", toolId, "| session_uuid:", sessionUuid, "| header_key:", headerKey, "| auth_type:", authType)

    try {
        const res  = await fetch(`${BASE_URL}/api/tools/auth/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({
                tool_id:      toolId,
                session_uuid: sessionUuid,   // null on first message — backend handles upsert
                header_key:   headerKey,
                auth_value:   authValue
            })
        })
        const data = await res.json()
        console.log("[AUTH-MODAL] Save status:", res.status, "| data:", data)

        if (!res.ok) {
            err.innerText = data?.message || "Failed to save auth."
            return
        }

        // Mark tool as authenticated in this session
        toolAuthSavedMap[toolId] = true
        const badge = document.getElementById(`auth-badge-${toolId}`)
        if (badge) {
            badge.innerText = "🔓"
            badge.title = "Credential saved for this session — click to update"
        }

        closeAuthModal()

        // Re-send the original message that triggered the auth failure
        if (message) {
            console.log("[AUTH-MODAL] Re-sending original message:", message)
            await dispatchMessage(message)
        }
    } catch (e) {
        console.error("[AUTH-MODAL] Error:", e)
        err.innerText = "Could not reach the server."
    }
}

document.getElementById("auth-modal").addEventListener("click", function(e) {
    if (e.target === this) closeAuthModal()
})


/* ─── MESSAGES ───────────────────────────────────────────────────── */

function addMessage(text, type) {
    const box = document.getElementById("chat-box")
    const div = document.createElement("div")
    div.className = "msg " + type
    div.innerText = text
    box.appendChild(div)
    box.scrollTop = box.scrollHeight
}

async function sendMessage() {
    const input   = document.getElementById("message-input")
    const message = input.value.trim()
    if (!message) return
    input.value = ""
    input.focus()
    await dispatchMessage(message)
}

// Auth failure keywords — if LLM response contains these after a tool call
// it means the external API returned 401/403
const AUTH_FAILURE_HINTS = [
    "authentication", "unauthorized", "api key", "apikey", "api_key",
    "credentials", "access denied", "forbidden", "401", "403",
    "log in", "login", "please provide", "authentication is required",
    "requires authentication", "auth_required", "provide credentials",
    "need.*api.*key", "key.*required"
]

function detectAuthFailure(responseText) {
    const lower = (responseText || "").toLowerCase()
    return AUTH_FAILURE_HINTS.some(hint => lower.includes(hint))
}

// Find first active tool that needs auth but hasn't been saved in this session
function findUnauthenticatedTool() {
    return chatToolsCache.find(tool => {
        const tid = tool.id || tool._id
        return tool.auth_required &&
               toolStateMap[tid] !== false &&
               !toolAuthSavedMap[tid]
    })
}

async function dispatchMessage(message) {
    addMessage(message, "user")

    console.log("[CHAT] Sending | chatToken:", chatToken ? "✓" : "MISSING ✗", "| sessionUuid:", sessionUuid)

    const box    = document.getElementById("chat-box")
    const typing = document.createElement("div")
    typing.className = "msg bot typing"
    typing.innerHTML = "<span></span><span></span><span></span>"
    box.appendChild(typing)
    box.scrollTop = box.scrollHeight

    const body = { prompt: message, model: "gpt-4o-mini", provider: "CHATGPT", project_id: projectId }
    if (sessionUuid) body.session_uuid = sessionUuid
    if (userUuid)    body.user_uuid    = userUuid

    try {
        const res  = await fetch(`${BASE_URL}/mcp/handle-chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: chatToken },
            body: JSON.stringify(body)
        })
        const data = await res.json()
        console.log("[CHAT] Status:", res.status, "| session_uuid:", data?.data?.session_uuid, "| data:", data)
        typing.remove()

        const firstMessage = !sessionUuid
        if (data.data?.session_uuid) sessionUuid = data.data.session_uuid
        if (data.data?.user_uuid)    userUuid    = data.data.user_uuid

        const responseText = data.data?.response || "No response."
        addMessage(responseText, "bot")

        // Check if response looks like an auth failure AND there's an unauth tool
        if (detectAuthFailure(responseText)) {
            const unauthTool = findUnauthenticatedTool()
            if (unauthTool) {
                const tid = unauthTool.id || unauthTool._id
                console.log("[CHAT] Auth failure detected — opening modal for:", unauthTool.name)
                // Small delay so bot message renders before modal
                setTimeout(() => openAuthModal(tid, unauthTool.name, unauthTool.auth_type, message), 500)
            }
        }

        // First message — session now exists, reload tools to enable toggles
        if (firstMessage && sessionUuid) {
            console.log("[CHAT] First message — reloading tools with sessionUuid:", sessionUuid)
            loadChatTools()
        }
    } catch (e) {
        console.error("[CHAT] Error:", e)
        typing.remove()
        addMessage("Error: Could not reach the server.", "bot")
    }
}