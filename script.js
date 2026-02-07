const App = (function () {
    // --- CONSTANTS ---
    const DEFAULT_MODELS = [
        { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)' },
        { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 (Free)' },
        { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: 'Llama 3.2 (Free)' },
        { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)' }
    ];

    const CODE_MIN_LENGTH = 8;
    const CODE_REGEX = /^[A-Za-z0-9]{8,}$/;
    const STORAGE_PREFIX = 'hareambot_data_';
    const SESSION_KEY = 'hareambot_session';
    const THEME_KEY = 'hareambot_theme';
    const INCOGNITO_KEY = 'hareambot_incognito';

    // --- STATE ---
    let state = {
        apiKey: '',
        systemPrompt: 'You are a helpful AI assistant.',
        activeModels: ['deepseek/deepseek-r1:free'],
        customModels: [],
        history: [], // Current session history
        theme: 'theme-light', // 'theme-light', 'theme-dark', 'theme-snow'
        activeCode: null, // The "access code" for the session
        isIncognito: false
    };

    // --- DOM REFERENCES ---
    const dom = {
        appBody: document.body,
        mainContainer: document.getElementById('chat-container'),
        messages: document.getElementById('messages'),
        welcome: document.getElementById('welcome-screen'),
        welcomeMessage: document.getElementById('welcome-message'),
        input: document.getElementById('user-input'),
        sendBtn: document.getElementById('send-btn'),
        modelList: document.getElementById('model-list'),
        activeCount: document.getElementById('active-count'),
        snowOverlay: document.getElementById('snow-overlay'),
        themeToggle: document.getElementById('theme-toggle'),
        themeMenu: document.getElementById('theme-menu'),
        modals: {
            model: document.getElementById('model-modal'),
            settings: document.getElementById('settings-modal'),
            auth: document.getElementById('auth-modal')
        },
        fields: {
            apiKey: document.getElementById('api-key'),
            sysPrompt: document.getElementById('sys-prompt'),
            customModel: document.getElementById('custom-model-id'),
            authCode: document.getElementById('auth-code')
        },
        incognitoBtn: document.getElementById('incognito-btn'),
        incognitoIcon: document.getElementById('incognito-icon')
    };

    let defaultWelcomeText = '';

    // --- INITIALIZATION ---
    function init() {
        defaultWelcomeText = dom.welcomeMessage ? dom.welcomeMessage.textContent : '';

        // Setup initial listeners
        setupSnowfall();
        setupInputHandlers();
        setupThemeDropdown();

        loadThemePreference();
        loadIncognitoPreference();

        // Check for Active Session
        const sessionCode = sessionStorage.getItem(SESSION_KEY);
        if (sessionCode && !state.isIncognito) {
            loadChatHistory(sessionCode);
        } else {
            // Show Auth Modal
            dom.modals.auth.classList.remove('hidden');
            updateUI();
            updateSendState();
        }

        // Configure Marked with Highlight.js
        if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
            marked.setOptions({
                highlight: function (code, lang) {
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return hljs.highlight(code, { language }).value;
                },
                langPrefix: 'hljs language-'
            });
        }
    }

    function setupInputHandlers() {
        if (!dom.input) return;

        // Auto-expand textarea
        dom.input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            updateSendState();
        });

        // Enter key to send
        dom.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (dom.sendBtn && dom.sendBtn.disabled) return;
                sendMessage();
            }
        });

        updateSendState();
    }

    function updateSendState() {
        if (!dom.sendBtn || !dom.input) return;
        const hasText = dom.input.value.trim().length > 0;
        dom.sendBtn.disabled = !hasText;
        dom.sendBtn.setAttribute('aria-disabled', String(!hasText));
    }

    function setupThemeDropdown() {
        if (!dom.themeToggle || !dom.themeMenu) return;

        dom.themeToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            if (dom.themeMenu.classList.contains('hidden')) {
                openThemeMenu();
            } else {
                closeThemeMenu();
            }
        });

        dom.themeMenu.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        document.addEventListener('click', function (e) {
            if (!dom.themeMenu.contains(e.target) && !dom.themeToggle.contains(e.target)) {
                closeThemeMenu();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeThemeMenu();
            }
        });
    }

    function openThemeMenu() {
        if (!dom.themeMenu || !dom.themeToggle) return;
        dom.themeMenu.classList.remove('hidden');
        dom.themeToggle.setAttribute('aria-expanded', 'true');
    }

    function closeThemeMenu() {
        if (!dom.themeMenu || !dom.themeToggle) return;
        dom.themeMenu.classList.add('hidden');
        dom.themeToggle.setAttribute('aria-expanded', 'false');
    }

    function loadThemePreference() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme) {
            state.theme = savedTheme;
        }
        applyTheme(state.theme);
    }

    function persistTheme(theme) {
        localStorage.setItem(THEME_KEY, theme);
    }

    function loadIncognitoPreference() {
        const incognito = sessionStorage.getItem(INCOGNITO_KEY) === '1';
        if (incognito) {
            state.isIncognito = true;
        }
        updateIncognitoUI();
    }

    function setWelcomeMessage(text) {
        if (!dom.welcomeMessage) return;
        dom.welcomeMessage.textContent = text || defaultWelcomeText;
    }

    function normalizeCode(code) {
        return code.trim();
    }

    function isValidCode(code) {
        return CODE_REGEX.test(code);
    }

    function getStorageKey(code) {
        return `${STORAGE_PREFIX}${code}`;
    }

    // --- CORE LOGIC ---
    function loadChatHistory(code) {
        const cleanCode = normalizeCode(code);

        if (!isValidCode(cleanCode)) {
            alert(`Access code must be at least ${CODE_MIN_LENGTH} characters and contain only letters and numbers.`);
            return;
        }

        state.activeCode = cleanCode;

        // Persist session tab-locally unless Incognito
        if (!state.isIncognito) {
            sessionStorage.setItem(SESSION_KEY, cleanCode);
        } else {
            sessionStorage.removeItem(SESSION_KEY);
        }

        // Hide Auth Modal immediately
        dom.modals.auth.classList.add('hidden');

        if (!state.isIncognito) {
            // Load Data from LocalStorage (unique per code)
            const storageKey = getStorageKey(cleanCode);
            const savedData = localStorage.getItem(storageKey);

            if (savedData) {
                try {
                    const parsed = JSON.parse(savedData);
                    const preserveIncognito = state.isIncognito;
                    state = { ...state, ...parsed, activeCode: cleanCode };
                    state.isIncognito = preserveIncognito;
                } catch (e) {
                    console.error("Failed to parse saved data", e);
                }
            } else {
                // New session defaults
                state.activeCode = cleanCode;
                state.history = [];
                state.activeModels = [...DEFAULT_MODELS.map(m => m.id)];
            }
        } else {
            // Incognito mode: start clean without loading history
            state.history = [];
            state.activeModels = [...DEFAULT_MODELS.map(m => m.id)];
        }

        // Sanity guards
        state.history = Array.isArray(state.history) ? state.history : [];
        state.activeModels = Array.isArray(state.activeModels) ? state.activeModels : [];
        state.customModels = Array.isArray(state.customModels) ? state.customModels : [];

        // Apply persisted theme (global)
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme) {
            state.theme = savedTheme;
        }
        applyTheme(state.theme);

        // Update UI components (Model count, API key field, etc)
        updateUI();
        updateSendState();

        // Render Chat History or Empty State
        if (state.history.length > 0 && !state.isIncognito) {
            dom.welcome.classList.add('hidden');
            dom.messages.classList.remove('hidden');
            setWelcomeMessage(defaultWelcomeText);
            renderHistory();
            scrollToBottom('smooth');
        } else {
            dom.welcome.classList.remove('hidden');
            dom.messages.classList.add('hidden');
            setWelcomeMessage("No previous chats found.");
        }
    }

    function save() {
        if (state.activeCode && !state.isIncognito) {
            const storageKey = getStorageKey(state.activeCode);
            localStorage.setItem(storageKey, JSON.stringify(state));
        }
        updateUI();
    }

    // --- AUTHENTICATION ---
    function generateRandomCode(length = CODE_MIN_LENGTH) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        if (window.crypto && window.crypto.getRandomValues) {
            const array = new Uint32Array(length);
            window.crypto.getRandomValues(array);
            return Array.from(array, n => chars[n % chars.length]).join('');
        }
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function generateCode() {
        const result = generateRandomCode(CODE_MIN_LENGTH);
        dom.fields.authCode.value = result;
        dom.fields.authCode.focus();
    }

    function handleLogin() {
        const code = normalizeCode(dom.fields.authCode.value);
        if (!isValidCode(code)) {
            alert(`Access code must be at least ${CODE_MIN_LENGTH} characters and contain only letters and numbers.`);
            return;
        }
        loadChatHistory(code);
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        state.activeCode = null;
        location.reload(); // Hard reload to clear memory state
    }

    // --- THEMES & UI ---
    function switchTheme(event, newTheme) {
        // Prevent menu click from closing things or bubbling weirdly
        if (event) event.stopPropagation();

        state.theme = newTheme;
        applyTheme(newTheme);
        persistTheme(newTheme);
        save();
        closeThemeMenu();
    }

    function applyTheme(themeName) {
        // Clear all theme classes first
        dom.appBody.classList.remove('theme-light', 'theme-dark', 'theme-snow', 'dark');

        // Add the selected theme class
        dom.appBody.classList.add(themeName);

        // Toggle Tailwind 'dark' class for themes that need dark text/bg
        if (themeName === 'theme-dark' || themeName === 'theme-snow') {
            dom.appBody.classList.add('dark');
        }

        // Handle Snow Overlay Visibility
        if (themeName === 'theme-snow') {
            dom.snowOverlay.style.display = 'block';
        } else {
            dom.snowOverlay.style.display = 'none';
        }

        // Ensure we didn't accidentally hide the UI
        if (state.history && state.history.length > 0) {
            dom.messages.classList.remove('hidden');
            dom.welcome.classList.add('hidden');
        }
    }

    function setupSnowfall() {
        const count = 50;
        for (let i = 0; i < count; i++) {
            const flake = document.createElement('div');
            flake.className = 'snowflake';
            flake.innerHTML = 'ƒ?,';
            flake.style.left = Math.random() * 100 + '%';
            flake.style.animationDuration = (Math.random() * 3 + 2) + 's';
            flake.style.animationDelay = Math.random() * 2 + 's';
            flake.style.fontSize = (Math.random() * 10 + 10) + 'px';
            dom.snowOverlay.appendChild(flake);
        }
    }

    function toggleIncognito(forceState) {
        if (typeof forceState === 'boolean') {
            state.isIncognito = forceState;
        } else {
            state.isIncognito = !state.isIncognito;
        }

        if (state.isIncognito) {
            sessionStorage.setItem(INCOGNITO_KEY, '1');
            sessionStorage.removeItem(SESSION_KEY);
        } else {
            sessionStorage.removeItem(INCOGNITO_KEY);
        }

        updateIncognitoUI();
        updateUI();
    }

    function updateIncognitoUI() {
        if (!dom.incognitoBtn) return;

        dom.incognitoBtn.classList.toggle('bg-red-50', state.isIncognito);
        dom.incognitoBtn.classList.toggle('dark:bg-red-900/20', state.isIncognito);
        dom.incognitoBtn.classList.toggle('animate-pulse', state.isIncognito);

        if (dom.incognitoIcon) {
            dom.incognitoIcon.classList.toggle('text-red-500', state.isIncognito);
            dom.incognitoIcon.classList.toggle('text-gray-500', !state.isIncognito);
            dom.incognitoIcon.classList.toggle('dark:text-gray-300', !state.isIncognito);
        }

        dom.incognitoBtn.setAttribute('aria-pressed', state.isIncognito ? 'true' : 'false');
    }

    function scrollToBottom(behavior = 'smooth') {
        if (dom.mainContainer) {
            requestAnimationFrame(() => {
                dom.mainContainer.scrollTo({
                    top: dom.mainContainer.scrollHeight,
                    behavior
                });
            });
        }
    }

    // --- MODEL MANAGEMENT ---
    function updateUI() {
        if (dom.activeCount) dom.activeCount.textContent = `${state.activeModels.length} Active`;
        renderModelList();

        if (dom.fields.apiKey) dom.fields.apiKey.value = state.apiKey;
        if (dom.fields.sysPrompt) dom.fields.sysPrompt.value = state.systemPrompt;

        if (state.isIncognito && dom.activeCount) {
            dom.activeCount.classList.add('bg-gray-800', 'text-gray-300');
        } else if (dom.activeCount) {
            dom.activeCount.classList.remove('bg-gray-800', 'text-gray-300');
        }

        updateIncognitoUI();
    }

    function renderModelList() {
        if (!dom.modelList) return;
        dom.modelList.innerHTML = '';
        const allModels = [...DEFAULT_MODELS, ...state.customModels];

        allModels.forEach(model => {
            const isChecked = state.activeModels.includes(model.id);
            const div = document.createElement('label');
            const isDefault = DEFAULT_MODELS.find(d => d.id === model.id);

            div.className = `flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isChecked
                ? 'bg-blue-50 border-blue-500 dark:bg-blue-900/20 dark:border-blue-500'
                : 'bg-white border-gray-100 dark:bg-cardbg dark:border-gray-700 hover:border-gray-300'
                }`;

            div.innerHTML = `
                <div class="relative flex items-center">
                    <input type="checkbox" class="peer sr-only" value="${model.id}" ${isChecked ? 'checked' : ''} onchange="App.toggleModel('${model.id}')">
                    <div class="w-5 h-5 border-2 border-gray-300 dark:border-gray-500 rounded peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors"></div>
                    <i class="fa-solid fa-check text-white text-[10px] absolute top-1 left-1 opacity-0 peer-checked:opacity-100"></i>
                </div>
                <div class="flex-1">
                    <div class="text-sm font-bold text-gray-800 dark:text-gray-200">${model.name}</div>
                    <div class="text-[10px] text-gray-400 truncate w-48">${model.id}</div>
                </div>
                ${!isDefault ?
                    `<div class="flex items-center gap-1">
                        <button onclick="App.editCustomModel(event, '${model.id}')" class="text-gray-400 hover:text-blue-500 p-2"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="App.deleteCustomModel(event, '${model.id}')" class="text-gray-400 hover:text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
                     </div>`
                    : ''}
            `;
            dom.modelList.appendChild(div);
        });
    }

    function toggleModel(id) {
        if (state.activeModels.includes(id)) {
            state.activeModels = state.activeModels.filter(m => m !== id);
        } else {
            state.activeModels.push(id);
        }
        save();
    }

    function addCustomModel() {
        const rawId = dom.fields.customModel.value.trim();
        if (!rawId) return;

        if (DEFAULT_MODELS.find(m => m.id === rawId) || state.customModels.find(m => m.id === rawId)) {
            alert('Model already exists!');
            return;
        }

        const name = rawId.split('/')[1] || rawId;
        const newModel = { id: rawId, name: name.charAt(0).toUpperCase() + name.slice(1) };

        state.customModels.push(newModel);
        state.activeModels.push(rawId);
        dom.fields.customModel.value = '';
        save();
    }

    function deleteCustomModel(e, id) {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('Remove this model?')) {
            state.customModels = state.customModels.filter(m => m.id !== id);
            state.activeModels = state.activeModels.filter(m => m !== id);
            save();
        }
    }

    function editCustomModel(e, id) {
        e.preventDefault();
        e.stopPropagation();
        const model = state.customModels.find(m => m.id === id);
        if (!model) return;

        const newName = prompt("Enter new name:", model.name);
        if (newName && newName.trim() !== "") {
            model.name = newName.trim();
            save();
        }
    }

    function resetModels() {
        if (confirm("Reset all custom models?")) {
            state.customModels = [];
            state.activeModels = DEFAULT_MODELS.map(m => m.id);
            save();
        }
    }

    // --- CHAT LOGIC ---
    async function sendMessage() {
        const text = dom.input.value.trim();
        if (!text) {
            updateSendState();
            return;
        }

        if (!state.apiKey) {
            alert("Please set your OpenRouter API Key in settings.");
            openSettings();
            return;
        }
        if (state.activeModels.length === 0) {
            alert("Select at least one model.");
            toggleModelModal();
            return;
        }

        // UI Transition
        dom.input.value = '';
        dom.input.style.height = 'auto';
        updateSendState();
        dom.welcome.classList.add('hidden');
        dom.messages.classList.remove('hidden');

        // 1. Create Turn
        const turnId = Date.now();
        const turn = { id: turnId, user: text, modelIds: [...state.activeModels], responses: {} };

        // 2. Render User Message
        const container = createMessageContainer(turnId, text, state.activeModels);
        dom.messages.appendChild(container);
        scrollToBottom('smooth');

        // 3. Save (if permitted)
        if (!state.isIncognito) {
            state.history.push(turn);
            save();
        }

        // 4. Fire Requests
        state.activeModels.forEach(modelId => {
            streamResponse(modelId, text, `resp-${turnId}-${cleanId(modelId)}`, turnId);
        });
    }

    function createMessageContainer(turnId, text, modelIds) {
        const container = document.createElement('div');
        container.className = "flex flex-col gap-6 animate-fade-in group";

        container.innerHTML = `
            <div class="flex justify-end px-2">
                <div class="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-5 py-3 rounded-2xl rounded-tr-none max-w-[90%] md:max-w-[70%] text-sm md:text-base leading-relaxed shadow-sm">
                    ${DOMPurify.sanitize(marked.parse(text))}
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-${modelIds.length > 1 ? '2' : '1'} xl:grid-cols-${modelIds.length > 2 ? '3' : '1'} gap-4 px-2">
                ${modelIds.map(modelId => {
            const modelName = getModelName(modelId);
            return `
                        <div class="bg-white dark:bg-cardbg border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col shadow-sm overflow-hidden h-full min-h-[150px]">
                            <div class="px-4 py-2 bg-gray-50 dark:bg-black/20 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <span class="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">${modelName}</span>
                                </div>
                            </div>
                            <div id="resp-${turnId}-${cleanId(modelId)}" class="p-4 prose dark:prose-invert text-sm flex-1 max-w-none">
                                <div class="typing-indicator">
                                    <span class="dot"></span>
                                    <span class="dot"></span>
                                    <span class="dot"></span>
                                    <span class="label">Typing</span>
                                </div>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
        return container;
    }

    function renderHistory() {
        // Ensure clean rendering
        if (!dom.messages) return;
        dom.messages.innerHTML = '';

        state.history.forEach(turn => {
            const modelIds = turn.modelIds || [];
            if (modelIds.length === 0) return;

            const container = createMessageContainer(turn.id, turn.user, modelIds);
            dom.messages.appendChild(container);

            modelIds.forEach(modelId => {
                const elId = `resp-${turn.id}-${cleanId(modelId)}`;
                const el = document.getElementById(elId);

                if (el && turn.responses && turn.responses[modelId]) {
                    // Render saved response
                    el.innerHTML = DOMPurify.sanitize(marked.parse(turn.responses[modelId]));

                    // Apply Syntax Highlighting
                    if (window.hljs) {
                        el.querySelectorAll('pre code').forEach((block) => {
                            hljs.highlightElement(block);
                        });
                    }
                } else if (el) {
                    el.innerHTML = '<span class="text-gray-400 italic">No response saved.</span>';
                }
            });
        });
    }

    async function streamResponse(modelId, prompt, elementId, turnId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        let fullText = "";

        try {
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${state.apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.href,
                    "X-Title": "HareamBot"
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: "system", content: state.systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    stream: true
                })
            });

            if (!res.ok) throw new Error("API Error: " + res.status);
            if (!res.body) throw new Error("Empty response stream.");

            el.innerHTML = ""; // Clear loader
            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const json = line.slice(6);
                        if (json === '[DONE]') break;
                        try {
                            const parsed = JSON.parse(json);
                            const content = parsed.choices[0]?.delta?.content || "";
                            fullText += content;

                            // Streaming Render
                            el.innerHTML = DOMPurify.sanitize(marked.parse(fullText));
                            scrollToBottom('smooth');
                        } catch (e) { }
                    }
                }
            }

            // Final highlight after stream
            if (window.hljs) {
                el.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
            }

        } catch (err) {
            el.innerHTML = `<span class="text-red-500 font-bold text-xs">Error: ${err.message}</span>`;
            fullText = `Error: ${err.message}`;
        }

        // Save final response
        if (!state.isIncognito) {
            const turn = state.history.find(t => t.id === turnId);
            if (turn) {
                if (!turn.responses) turn.responses = {};
                turn.responses[modelId] = fullText;
                save();
            }
        }
    }

    // --- HELPERS ---
    function getModelName(id) {
        const m = [...DEFAULT_MODELS, ...state.customModels].find(x => x.id === id);
        return m ? m.name : id;
    }
    function cleanId(id) { return id.replace(/[^a-zA-Z0-9]/g, ''); }

    // Modal controls
    function toggleModelModal() { dom.modals.model.classList.toggle('hidden'); }
    function openSettings() {
        dom.fields.apiKey.value = state.apiKey;
        dom.fields.sysPrompt.value = state.systemPrompt;
        dom.modals.settings.classList.remove('hidden');
    }
    function closeSettings() { dom.modals.settings.classList.add('hidden'); }

    function saveSettings() {
        state.apiKey = dom.fields.apiKey.value.trim();
        state.systemPrompt = dom.fields.sysPrompt.value.trim();
        save();
        closeSettings();
    }

    function resetData() {
        if (confirm("Reset current session data?")) {
            localStorage.removeItem(getStorageKey(state.activeCode));
            location.reload();
        }
    }

    // Export public methods
    return {
        init, toggleModelModal, toggleModel, addCustomModel, deleteCustomModel, editCustomModel, resetModels,
        openSettings, closeSettings, saveSettings, resetData, sendMessage,
        generateCode, handleLogin, logout, switchTheme, toggleIncognito, loadChatHistory
    };

})();

window.onload = App.init;
