const endpointInput = document.querySelector("#endpoint-input");
const saveEndpointButton = document.querySelector("#save-endpoint");
const useLocalButton = document.querySelector("#use-local");
const connectionHelp = document.querySelector("#connection-help");

const defaultEndpoint = window.MTG_RULES_AGENT_ENDPOINT || "";
const endpointStorageKey = "mtg-rules-agent:endpoint";
const conversationStorageKey = "mtg-rules-agent:conversation";

let endpoint = loadEndpoint();

const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const clearButton = document.querySelector("#clear-chat");
const messageTemplate = document.querySelector("#message-template");
const promptButtons = document.querySelectorAll(".prompt-chip");
const connectionStatus = document.querySelector("#connection-status");

const starterMessages = [
    {
        role: "assistant",
        content: "Ask a Magic: The Gathering rules question and I will answer with a concise explanation plus the rule concepts involved. This local prototype is best for general rules guidance, not tournament policy rulings."
    }
];

const knowledgeBase = [
    {
        keywords: ["priority", "respond", "stack", "resolve"],
        answer: "Priority passes between players whenever a spell or ability is put on the stack and again after an object on the stack resolves. If all players pass in succession while the stack is empty, the game moves to the next step or phase. If all players pass while something is on the stack, the top object resolves.",
        references: ["CR 117.3", "CR 117.4", "CR 608.2"]
    },
    {
        keywords: ["triggered", "activated", "ability"],
        answer: "Activated abilities use the pattern 'cost: effect' and are activated when a player chooses to do so. Triggered abilities use words like 'when', 'whenever', or 'at' and trigger automatically when the event happens, then go on the stack the next time a player would receive priority.",
        references: ["CR 602.1", "CR 603.1", "CR 603.3"]
    },
    {
        keywords: ["first strike", "double strike", "combat"],
        answer: "First strike and double strike can create an extra combat damage step. Creatures with first strike or double strike assign and deal damage in the first combat damage step. Then, if any attacking or blocking creatures remain, creatures without first strike and creatures with double strike assign and deal damage in the second combat damage step.",
        references: ["CR 510.1", "CR 702.7", "CR 702.4"]
    },
    {
        keywords: ["layer", "layers", "power", "toughness"],
        answer: "Continuous effects are applied in layers. For power and toughness, the important part is usually: characteristic-defining abilities, then set power and toughness effects, then counters and effects that modify power and toughness, with timestamps and dependency rules breaking ties where relevant. If you have a specific board state, list the permanents and effects in play.",
        references: ["CR 613", "CR 613.1", "CR 613.4"]
    },
    {
        keywords: ["replacement", "instead", "prevent"],
        answer: "Replacement effects change an event before it happens and often use 'instead', 'skip', 'with', or 'as'. They do not use the stack. If multiple replacement effects apply to the same event, the affected player or controller of the affected object usually chooses the order in which to apply them.",
        references: ["CR 614.1", "CR 616.1"]
    },
    {
        keywords: ["state-based", "dies", "lethal", "legend rule"],
        answer: "State-based actions are checked whenever a player would receive priority. They are not triggered abilities and do not use the stack. This is where the game handles things like creatures with lethal damage dying, players losing at 0 life, or the legend rule sending extra legendary permanents with the same name to the graveyard.",
        references: ["CR 704.3", "CR 704.5", "CR 704.5j"]
    },
    {
        keywords: ["summoning sickness", "haste", "tap", "attack"],
        answer: "A creature cannot attack or activate an ability with the tap or untap symbol unless its controller has continuously controlled it since the start of that player's most recent turn. Haste overrides that restriction.",
        references: ["CR 302.6", "CR 702.10"]
    },
    {
        keywords: ["trample", "block", "blocked", "damage"],
        answer: "A creature with trample still has to assign at least lethal damage to each creature blocking it in its damage assignment order before any remaining damage can be assigned to the defending player, planeswalker, or battle. If it has first strike or double strike, that matters in the normal combat damage timing rules.",
        references: ["CR 510.1", "CR 702.19"]
    },
    {
        keywords: ["copy", "copies", "copiable", "token"],
        answer: "Copy effects use the copied object's copiable values, usually what's printed on it plus other copy effects and certain status choices. They normally do not copy counters, damage marked on the permanent, or most other continuous effects that are currently changing it.",
        references: ["CR 707.2", "CR 707.9"]
    }
];

let conversation = loadConversation();

function loadEndpoint() {
    const storedEndpoint = window.localStorage.getItem(endpointStorageKey);
    return storedEndpoint !== null ? storedEndpoint : defaultEndpoint;
}

function loadConversation() {
    const storedConversation = window.localStorage.getItem(conversationStorageKey);

    if (!storedConversation) {
        return [...starterMessages];
    }

    try {
        const parsedConversation = JSON.parse(storedConversation);
        const validConversation = parsedConversation.filter((message) => {
            return message && typeof message.role === "string" && typeof message.content === "string";
        });

        return validConversation.length > 0 ? validConversation : [...starterMessages];
    } catch {
        return [...starterMessages];
    }
}

function persistConversation() {
    window.localStorage.setItem(conversationStorageKey, JSON.stringify(conversation));
}

function persistEndpoint() {
    if (endpoint) {
        window.localStorage.setItem(endpointStorageKey, endpoint);
    } else {
        window.localStorage.removeItem(endpointStorageKey);
    }
}

function updateConnectionUi() {
    endpointInput.value = endpoint;

    if (endpoint) {
        connectionStatus.textContent = `External API mode enabled: ${endpoint}`;
        connectionHelp.textContent = "Requests will be sent to the configured endpoint until you switch back to local mode.";
        return;
    }

    connectionStatus.textContent = "Local rules helper enabled.";
    connectionHelp.textContent = "The selected mode is stored in your browser.";
}

function autoResizeTextarea() {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
}

function appendFormattedContent(container, content) {
    const lines = content.split("\n");
    let paragraphLines = [];
    let listElement = null;

    const flushParagraph = () => {
        if (paragraphLines.length === 0) {
            return;
        }

        const paragraph = document.createElement("p");
        paragraph.textContent = paragraphLines.join(" ");
        container.appendChild(paragraph);
        paragraphLines = [];
    };

    const flushList = () => {
        if (listElement) {
            container.appendChild(listElement);
            listElement = null;
        }
    };

    lines.forEach((line) => {
        const trimmedLine = line.trim();

        if (!trimmedLine) {
            flushParagraph();
            flushList();
            return;
        }

        if (trimmedLine.startsWith("- ")) {
            flushParagraph();
            if (!listElement) {
                listElement = document.createElement("ul");
            }

            const listItem = document.createElement("li");
            listItem.textContent = trimmedLine.slice(2);
            listElement.appendChild(listItem);
            return;
        }

        flushList();
        paragraphLines.push(trimmedLine);
    });

    flushParagraph();
    flushList();
}

function renderMessage(role, content) {
    const fragment = messageTemplate.content.cloneNode(true);
    const message = fragment.querySelector(".message");
    const speaker = fragment.querySelector(".speaker");
    const bubble = fragment.querySelector(".bubble");

    message.classList.toggle("user", role === "user");
    speaker.textContent = role === "user" ? "You" : "MTG Rules Agent";
    appendFormattedContent(bubble, content);

    chatLog.appendChild(fragment);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function renderConversation() {
    chatLog.innerHTML = "";
    conversation.forEach((message) => renderMessage(message.role, message.content));
}

function setBusyState(isBusy) {
    sendButton.disabled = isBusy;
    messageInput.disabled = isBusy;
}

function getLocalResponse(userMessage) {
    const normalized = userMessage.toLowerCase();
    const matchingEntry = knowledgeBase
        .map((entry) => ({
            entry,
            score: entry.keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0)
        }))
        .sort((left, right) => right.score - left.score)[0];

    if (matchingEntry && matchingEntry.score > 0) {
        return [
            matchingEntry.entry.answer,
            `Relevant rules: ${matchingEntry.entry.references.join(", ")}.`,
            "If you want a more exact ruling, send the full game state, the cards involved, and the exact sequence of actions."
        ].join("\n\n");
    }

    return [
        "I can help, but this prototype does not have the comprehensive Oracle card database or the full Comprehensive Rules indexed yet.",
        "Try a topic like priority, combat damage, layers, replacement effects, summoning sickness, copy effects, or state-based actions.",
        "If you want card-specific or edge-case rulings, connect this UI to a backend endpoint."
    ].join("\n\n");
}

async function getAssistantResponse(userMessage) {
    if (!endpoint) {
        return getLocalResponse(userMessage);
    }

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: userMessage,
            conversation
        })
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();

    if (typeof payload.answer !== "string" || payload.answer.trim() === "") {
        throw new Error("Endpoint response did not include an answer string.");
    }

    return payload.answer.trim();
}

async function submitMessage(userMessage) {
    conversation.push({ role: "user", content: userMessage });
    persistConversation();
    renderConversation();
    setBusyState(true);

    try {
        const answer = await getAssistantResponse(userMessage);
        conversation.push({ role: "assistant", content: answer });
    } catch (error) {
        conversation.push({
            role: "assistant",
            content: `The chatbox could not reach the MTG Rules Agent backend. ${error.message} Use the local mode or point window.MTG_RULES_AGENT_ENDPOINT at a working API.`
        });
    } finally {
        persistConversation();
        setBusyState(false);
        renderConversation();
        messageInput.focus();
    }
}

chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const userMessage = messageInput.value.trim();
    if (!userMessage) {
        return;
    }

    messageInput.value = "";
    autoResizeTextarea();
    await submitMessage(userMessage);
});

messageInput.addEventListener("input", autoResizeTextarea);

messageInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        chatForm.requestSubmit();
    }
});

clearButton.addEventListener("click", () => {
    conversation = [...starterMessages];
    persistConversation();
    renderConversation();
    messageInput.focus();
});

promptButtons.forEach((button) => {
    button.addEventListener("click", () => {
        messageInput.value = button.dataset.prompt || "";
        autoResizeTextarea();
        messageInput.focus();
    });
});

saveEndpointButton.addEventListener("click", () => {
    endpoint = endpointInput.value.trim();
    persistEndpoint();
    updateConnectionUi();
    messageInput.focus();
});

useLocalButton.addEventListener("click", () => {
    endpoint = "";
    persistEndpoint();
    updateConnectionUi();
    messageInput.focus();
});

renderConversation();
updateConnectionUi();
autoResizeTextarea();
