const BASE_URL = "http://localhost:5001"

let token = null
let projectId = null
let projectName = null
let sessionUuid = null   // Created by backend on first chat — required for toggleTool
let userUuid = null


/* ─── SCREEN NAVIGATION ─────────────────────────────────────────── */

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"))
    document.getElementById(id).classList.remove("hidden")
}


/* ─── SHARED JSON SANITIZER ─────────────────────────────────────── */

function sanitizeJSON(raw) {
    return raw
        .replace(/^\uFEFF/, '')                    // BOM
        .replace(/[\u200B-\u200D\uFEFF]/g, '')     // zero-width spaces
        .replace(/[\u2018\u2019]/g, "'")            // smart single quotes
        .replace(/[\u201C\u201D]/g, '"')            // smart double quotes
        .replace(/\u00A0/g, ' ')                   // non-breaking space → regular space
        .replace(/\u2013|\u2014/g, '-')            // en/em dash → hyphen
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '') // strip all remaining non-ASCII
        .trim()
}


/* ─── SET API KEY ────────────────────────────────────────────────── */

async function setApiKey() {
    const name = document.getElementById("user-name").value.trim()
    const key  = document.getElementById("api-key").value.trim()
    const err  = document.getElementById("api-error")
    if (!name || !key) { err.innerText = "Please enter both name and API key."; return }
    err.innerText = ""
    try {
        const res  = await fetch(`${BASE_URL}/api/front/set-api-key`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_name: name, api_key: key })
        })
        const data = await res.json()
        if (!data?.data?.token) throw new Error("No token")
        token = data.data.token
        showScreen("project-screen")
        loadProjects()
    } catch {
        err.innerText = "Authentication failed. Check your credentials."
    }
}


/* ─── PROJECTS ───────────────────────────────────────────────────── */

async function loadProjects() {
    const container = document.getElementById("project-list")
    container.innerHTML = "<p class='empty-msg'>Loading...</p>"
    const res  = await fetch(`${BASE_URL}/api/projects/list`, { headers: { token } })
    const data = await res.json()
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
    const btn = document.getElementById("create-project-btn")
    btn.disabled = true; btn.innerText = "Creating..."
    await fetch(`${BASE_URL}/api/projects/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ name, description: desc })
    })
    document.getElementById("project-name").value = ""
    document.getElementById("project-desc").value = ""
    btn.disabled = false; btn.innerText = "Create Project"
    loadProjects()
}

function selectProject(id, name) {
    projectId   = id
    projectName = name
    sessionUuid = null   // Reset session — sessions are project-scoped
    userUuid    = null
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
    const res   = await fetch(`${BASE_URL}/api/tools/list`, { headers: { token } })
    const data  = await res.json()
    // Backend now returns project_id as a plain string — simple equality check
    const tools = (data?.data?.tools || []).filter(t => t.project_id === projectId)
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
                <button class="btn-danger" onclick="deleteTool('${tid}')">Delete</button>
            </div>`
        container.appendChild(div)
    })
}

async function createTool() {
    if (!projectId) { alert("No project selected."); return }
    const name        = document.getElementById("tool-name").value.trim()
    const description = document.getElementById("tool-description").value.trim()
    const url         = document.getElementById("tool-url").value.trim()
    const method      = document.getElementById("tool-method").value
    const headersText = document.getElementById("tool-headers").value.trim()
    const schemaText  = document.getElementById("tool-input-schema").value.trim()
    const queryText   = document.getElementById("tool-query-fields").value.trim()
    const bodyText    = document.getElementById("tool-body-fields").value.trim()

    if (!name)        { alert("Tool name is required."); return }
    if (!description) { alert("Description is required."); return }
    if (!url)         { alert("URL is required."); return }

    let headers = {}, inputSchema = {}

    // ── Parse Headers ──────────────────────────────────────────────
    try {
        const cleanHeaders = sanitizeJSON(headersText)
        headers = cleanHeaders ? JSON.parse(cleanHeaders) : {}
    } catch(e) {
        alert("Invalid Headers JSON.\n\nError: " + e.message + "\n\nValue received:\n" + headersText)
        return
    }

    // ── Parse Input Schema ─────────────────────────────────────────
    try {
        const cleanSchema = sanitizeJSON(schemaText)
        inputSchema = cleanSchema ? JSON.parse(cleanSchema) : {}
    } catch(e) {
        alert("Invalid Input Schema JSON.\n\nError: " + e.message + "\n\nValue received:\n" + schemaText)
        return
    }

    const queryParamFields = queryText ? queryText.split(",").map(v => v.trim()).filter(Boolean) : []
    const bodyParamFields  = bodyText  ? bodyText.split(",").map(v => v.trim()).filter(Boolean)  : []

    const payload = { project_id: projectId, name, description, url, method, headers, inputSchema, queryParamFields, bodyParamFields }

    const btn = document.getElementById("create-tool-btn")
    btn.disabled = true; btn.innerText = "Creating..."

    const res    = await fetch(`${BASE_URL}/api/tools/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify(payload)
    })
    const result = await res.json()
    btn.disabled = false; btn.innerText = "Create Tool"

    if (!res.ok) { alert("Error: " + (result?.message || "Failed to create tool")); return }

    ;["tool-name","tool-description","tool-url","tool-headers","tool-input-schema","tool-query-fields","tool-body-fields"]
        .forEach(id => document.getElementById(id).value = "")
    document.getElementById("tool-method").value = "GET"
    loadTools()
}

async function deleteTool(id) {
    if (!confirm("Delete this tool?")) return
    await fetch(`${BASE_URL}/api/tools/delete/${id}`, { method: "POST", headers: { token } })
    loadTools()
}


/* ─── CHAT ───────────────────────────────────────────────────────── */

// Source of truth for tool active state — avoids relying on CSS class reads
const toolStateMap = {}

function goToChat() {
    if (!projectId) { alert("Select a project first."); return }
    document.getElementById("chat-project-label").innerText = projectName
    if (!sessionUuid) document.getElementById("chat-box").innerHTML = ""
    showScreen("chat-screen")
    loadChatTools()
}

// Pass session_uuid as query param so backend returns correct is_active per session
async function loadChatTools() {
    const container = document.getElementById("chat-tools")
    container.innerHTML = ""
    const url = sessionUuid
        ? `${BASE_URL}/api/tools/list?session_uuid=${sessionUuid}`
        : `${BASE_URL}/api/tools/list`
    const res  = await fetch(url, { headers: { token } })
    const data = await res.json()
    // Backend now returns project_id as a plain string — simple equality check
    const tools = (data?.data?.tools || []).filter(t => t.project_id === projectId)

    if (tools.length === 0) {
        container.innerHTML = "<p class='empty-msg' style='font-size:12px'>No tools</p>"
        return
    }

    tools.forEach(tool => {
        const tid    = tool.id || tool._id
        // is_active defaults to true when no session state exists yet in backend
        const active = typeof tool.is_active === "boolean" ? tool.is_active : true
        toolStateMap[tid] = active   // store in JS map — single source of truth

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

// toggleTool requires session_uuid in the request BODY — enforced by backend
async function toggleChatTool(id, btn) {
    if (!sessionUuid) {
        alert("Send a message first to start a session, then you can toggle tools.")
        return
    }

    const wasActive  = toolStateMap[id]
    const optimistic = !wasActive

    // Apply optimistic UI immediately
    setToggleBtn(btn, optimistic)
    btn.disabled = true

    try {
        const res  = await fetch(`${BASE_URL}/api/tools/toggle-status/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ session_uuid: sessionUuid })
        })
        const data = await res.json()
        btn.disabled = false

        if (res.ok) {
            const confirmed = typeof data?.data?.is_active === "boolean"
                ? data.data.is_active
                : optimistic
            toolStateMap[id] = confirmed
            setToggleBtn(btn, confirmed)
        } else {
            toolStateMap[id] = wasActive
            setToggleBtn(btn, wasActive)
            console.error("Toggle failed:", data)
        }
    } catch (e) {
        btn.disabled = false
        toolStateMap[id] = wasActive
        setToggleBtn(btn, wasActive)
        console.error("Toggle error:", e)
    }
}

function setToggleBtn(btn, isActive) {
    btn.innerText = isActive ? "ON" : "OFF"
    btn.className = `toggle-btn ${isActive ? "toggle-on" : "toggle-off"}`
}


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
    addMessage(message, "user")

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
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify(body)
        })
        const data = await res.json()
        typing.remove()

        const firstMessage = !sessionUuid
        if (data.data?.session_uuid) sessionUuid = data.data.session_uuid
        if (data.data?.user_uuid)    userUuid    = data.data.user_uuid

        addMessage(data.data?.response || "No response.", "bot")

        // Reload tool sidebar after first message — session now exists
        // so toggle buttons unlock and is_active state is accurate
        if (firstMessage && sessionUuid) loadChatTools()

    } catch {
        typing.remove()
        addMessage("Error: Could not reach the server.", "bot")
    }
}