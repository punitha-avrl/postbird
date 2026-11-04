const methodSelect = document.querySelector("#method");
const urlInput = document.querySelector("#url");
const sendButton = document.querySelector("#sendButton");
const paramsTable = document.querySelector("#paramsTable");
const headersTable = document.querySelector("#headersTable");
const responseEmpty = document.querySelector("#responseEmpty");
const responseContent = document.querySelector("#responseContent");
const responseBody = document.querySelector("#responseBody");
const responseHeaders = document.querySelector("#responseHeaders");
const toast = document.querySelector("#toast");
const appDialog = document.querySelector("#appDialog");
const appDialogForm = document.querySelector("#appDialogForm");
const STORAGE_KEYS = {
  history: "postbird.history",
  requests: "postbird.requests",
  collections: "postbird.collections",
};

let activeCollection = "Getting started";
let toastTimer;
let dialogResolve;
let historyItems = readStored(STORAGE_KEYS.history, []);
let savedRequests = readStored(STORAGE_KEYS.requests, []);
let collections = readStored(STORAGE_KEYS.collections, ["Getting started"]);
let collapsedCollections = new Set(
  readStored("postbird.collapsedCollections", []),
);

function readStored(key, fallback) {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    return Array.isArray(stored) ? stored : fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from local storage.`, error);
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Unable to save ${key} to local storage.`, error);
    showToast("Could not save to local storage.");
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2300);
}

function openAppDialog({
  title,
  message = "",
  label = "",
  value = "",
  confirmLabel = "OK",
  danger = false,
}) {
  if (appDialog.open) return Promise.resolve(null);

  const input = document.querySelector("#appDialogInput");
  const fieldLabel = document.querySelector("#appDialogFieldLabel");
  const confirmButton = document.querySelector("#appDialogConfirm");
  document.querySelector("#appDialogTitle").textContent = title;
  document.querySelector("#appDialogMessage").textContent = message;
  fieldLabel.textContent = label;
  fieldLabel.hidden = !label;
  input.hidden = !label;
  input.required = Boolean(label);
  input.value = value;
  confirmButton.textContent = confirmLabel;
  confirmButton.classList.toggle("danger", danger);

  return new Promise((resolve) => {
    dialogResolve = resolve;
    appDialog.showModal();
    if (label) input.focus();
    else confirmButton.focus();
  });
}

function rowsFor(table) {
  return [...table.querySelectorAll(".editor-row")].map((row) => ({
    enabled: row.querySelector('input[type="checkbox"]').checked,
    key: row.querySelector('[data-field="key"]').value.trim(),
    value: row.querySelector('[data-field="value"]').value,
    description: row.querySelector('[data-field="description"]').value,
  }));
}

function updateCounts() {
  const activeParams = rowsFor(paramsTable).filter(
    (row) => row.enabled && row.key,
  ).length;
  const activeHeaders = rowsFor(headersTable).filter(
    (row) => row.enabled && row.key,
  ).length;
  document.querySelector("#paramsCount").textContent = activeParams
    ? `(${activeParams})`
    : "";
  document.querySelector("#headersCount").textContent = activeHeaders;
}

function updateUrlFromParams() {
  try {
    const url = new URL(urlInput.value);
    url.search = "";
    for (const row of rowsFor(paramsTable)) {
      if (row.enabled && row.key) url.searchParams.append(row.key, row.value);
    }
    urlInput.value = url.href;
  } catch {
    // Keep an incomplete URL editable while the user is typing.
  }
}

function addRow(table, values = {}) {
  const row = document.createElement("div");
  row.className = "editor-row";

  const checkCell = document.createElement("span");
  checkCell.className = "row-check";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = values.enabled !== false;
  checkbox.setAttribute("aria-label", "Include row");
  checkCell.append(checkbox);
  row.append(checkCell);

  for (const [field, placeholder] of [
    ["key", "Key"],
    ["value", "Value"],
    ["description", "Description"],
  ]) {
    const input = document.createElement("input");
    input.dataset.field = field;
    input.placeholder = placeholder;
    input.value = values[field] || "";
    input.setAttribute("aria-label", placeholder);
    row.append(input);
  }

  const remove = document.createElement("button");
  remove.className = "remove-row";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Remove row");
  row.append(remove);
  table.append(row);

  const onChange = () => {
    updateCounts();
    if (table === paramsTable) updateUrlFromParams();
  };
  row.addEventListener("input", onChange);
  checkbox.addEventListener("change", onChange);
  row.querySelector('[data-field="key"]').addEventListener("input", () => {
    const isLast = row === table.lastElementChild;
    if (isLast && row.querySelector('[data-field="key"]').value) addRow(table);
  });
  remove.addEventListener("click", () => {
    row.remove();
    if (!table.querySelector(".editor-row")) addRow(table);
    onChange();
  });
  updateCounts();
}

function setRows(table, items) {
  table.querySelectorAll(".editor-row").forEach((row) => row.remove());
  if (items.length) items.forEach((item) => addRow(table, item));
  else addRow(table);
}

function populateParamsFromUrl() {
  try {
    const url = new URL(urlInput.value);
    setRows(
      paramsTable,
      [...url.searchParams.entries()].map(([key, value]) => ({ key, value })),
    );
  } catch {
    setRows(paramsTable, []);
  }
}

function getRequestUrl() {
  const baseUrl = new URL(urlInput.value);
  const params = rowsFor(paramsTable).filter((row) => row.enabled && row.key);
  baseUrl.search = "";
  for (const param of params)
    baseUrl.searchParams.append(param.key, param.value);
  return baseUrl.href;
}

function setRequestMethod(method) {
  methodSelect.value = method;
  methodSelect.className = `method-${method.toLowerCase()}`;
  document.querySelector(".request-tab .method-dot").textContent = method;
  document.querySelector(".request-tab .method-dot").className =
    `method-dot ${method.toLowerCase()}`;
}

function setActiveRequest(name, request) {
  document.querySelector(".breadcrumbs strong").textContent = name;
  document.querySelector(".request-tab span:last-of-type").textContent = name;
  urlInput.value = request.url;
  setRequestMethod(request.method || "GET");
  setRows(headersTable, request.headers || []);
  document.querySelector("#requestBody").value = request.body || "";
  document.querySelectorAll('input[name="bodyType"]')[0].checked =
    !request.body;
  document.querySelectorAll('input[name="bodyType"]')[1].checked = Boolean(
    request.body,
  );
  if (Array.isArray(request.params)) {
    setRows(paramsTable, request.params);
    updateUrlFromParams();
  } else {
    populateParamsFromUrl();
  }
  responseEmpty.classList.remove("hidden");
  responseContent.classList.add("hidden");
  document.querySelector("#responseLabel").textContent = "Ready to send";
  document.querySelector("#responseMeta").textContent = "";
}

function renderCollections() {
  const content = document.querySelector("#sidebarContent");
  content.replaceChildren();
  for (const [index, collectionName] of collections.entries()) {
    const collapsed = collapsedCollections.has(collectionName);
    const requestListId = `collection-requests-${index}`;
    const heading = document.createElement("div");
    heading.className = `collection-heading${collapsed ? " collapsed" : ""}`;
    const toggle = document.createElement("button");
    toggle.className = "collection-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-controls", requestListId);
    const chevron = document.createElement("span");
    chevron.className = "collection-chevron";
    chevron.setAttribute("aria-hidden", "true");
    const folder = document.createElement("span");
    folder.className = "folder-icon";
    folder.textContent = "▱";
    const label = document.createElement("span");
    label.className = "collection-toggle-label";
    label.textContent = collectionName;
    toggle.append(chevron, folder, label);
    toggle.addEventListener("click", () => {
      document
        .querySelectorAll(".collection-menu")
        .forEach((item) => item.classList.add("hidden"));
      document
        .querySelectorAll(".more-button")
        .forEach((item) => item.setAttribute("aria-expanded", "false"));
      toggleCollection(collectionName);
    });
    heading.append(toggle);

    const options = document.createElement("button");
    options.className = "more-button";
    options.type = "button";
    options.textContent = "···";
    options.setAttribute("aria-label", `${collectionName} options`);
    options.setAttribute("aria-haspopup", "menu");
    options.setAttribute("aria-expanded", "false");
    heading.append(options);

    const menu = document.createElement("div");
    menu.className = "collection-menu hidden";
    menu.setAttribute("role", "menu");
    for (const [action, actionLabel, danger] of [
      ["add-request", "Add request", false],
      ["rename", "Rename collection", false],
      ["export", "Export collection", false],
      ["delete", "Delete collection", true],
    ]) {
      const menuItem = document.createElement("button");
      menuItem.type = "button";
      menuItem.setAttribute("role", "menuitem");
      menuItem.dataset.collectionAction = action;
      menuItem.textContent = actionLabel;
      if (danger) menuItem.classList.add("danger");
      menuItem.addEventListener("click", () => {
        menu.classList.add("hidden");
        options.setAttribute("aria-expanded", "false");
        handleCollectionAction(action, collectionName);
      });
      menu.append(menuItem);
    }
    options.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldOpen = menu.classList.contains("hidden");
      document
        .querySelectorAll(".collection-menu")
        .forEach((item) => item.classList.add("hidden"));
      document
        .querySelectorAll(".more-button")
        .forEach((item) => item.setAttribute("aria-expanded", "false"));
      menu.classList.toggle("hidden", !shouldOpen);
      options.setAttribute("aria-expanded", String(shouldOpen));
    });
    heading.append(menu);
    content.append(heading);

    const requestList = document.createElement("div");
    requestList.className = "collection-requests";
    requestList.id = requestListId;
    requestList.classList.toggle("hidden", collapsed);
    const requests = getCollectionRequests(collectionName);
    for (const request of requests) {
      const button = document.createElement("button");
      button.className = "sidebar-request";
      const method = document.createElement("span");
      method.className = `method-dot ${request.method.toLowerCase()}`;
      method.textContent = request.method;
      const requestName = document.createElement("span");
      requestName.textContent = request.name;
      button.append(method, requestName);
      button.addEventListener("click", () => {
        activeCollection = collectionName;
        setActiveRequest(request.name, request);
        document
          .querySelectorAll(".sidebar-request")
          .forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
      });
      requestList.append(button);
    }
    if (!requests.length) {
      const empty = document.createElement("p");
      empty.className = "collection-empty";
      empty.textContent = "No requests yet";
      requestList.append(empty);
    }
    content.append(requestList);
  }
  const promo = document.createElement("div");
  promo.className = "sidebar-promo";
  promo.innerHTML =
    '<div class="promo-icon">✦</div><strong>Your workspace, your way</strong><p>Save requests into collections to keep your API work organized.</p>';
  const createLink = document.createElement("button");
  createLink.className = "text-button";
  createLink.textContent = "Create a collection →";
  createLink.addEventListener("click", createCollection);
  promo.append(createLink);
  content.append(promo);
}

function getCollectionRequests(collectionName) {
  const starterRequests =
    collectionName === "Getting started"
      ? [
          {
            name: "Get a todo",
            method: "GET",
            url: "https://jsonplaceholder.typicode.com/todos/1",
            headers: [],
            body: "",
          },
          {
            name: "Create a todo",
            method: "POST",
            url: "https://jsonplaceholder.typicode.com/todos",
            headers: [],
            body: '{"title":"New todo","completed":false}',
          },
        ]
      : [];
  return [
    ...starterRequests,
    ...savedRequests.filter((item) => item.collection === collectionName),
  ];
}

function toggleCollection(collectionName) {
  if (collapsedCollections.has(collectionName)) {
    collapsedCollections.delete(collectionName);
  } else {
    collapsedCollections.add(collectionName);
  }
  writeStored("postbird.collapsedCollections", [...collapsedCollections]);
  renderCollections();
}

async function handleCollectionAction(action, collectionName) {
  if (action === "add-request") {
    activeCollection = collectionName;
    setActiveRequest("New request", {
      method: "GET",
      url: "",
      headers: [],
      body: "",
    });
    urlInput.focus();
    return;
  }

  if (action === "rename") {
    const result = await openAppDialog({
      title: "Rename collection",
      label: "Collection name",
      value: collectionName,
      confirmLabel: "Rename",
    });
    if (!result?.confirmed) return;
    const nextName = result.value.trim();
    if (!nextName) {
      showToast("Collection name cannot be empty.");
      return;
    }
    if (
      nextName !== collectionName &&
      collections.some((name) => name.toLowerCase() === nextName.toLowerCase())
    ) {
      showToast("A collection with that name already exists.");
      return;
    }
    collections = collections.map((name) =>
      name === collectionName ? nextName : name,
    );
    savedRequests = savedRequests.map((request) =>
      request.collection === collectionName
        ? { ...request, collection: nextName }
        : request,
    );
    if (activeCollection === collectionName) activeCollection = nextName;
    if (collapsedCollections.delete(collectionName)) {
      collapsedCollections.add(nextName);
      writeStored("postbird.collapsedCollections", [...collapsedCollections]);
    }
    writeStored(STORAGE_KEYS.collections, collections);
    writeStored(STORAGE_KEYS.requests, savedRequests);
    renderCollections();
    showToast("Collection renamed.");
    return;
  }

  if (action === "export") {
    exportCollection(collectionName);
    return;
  }

  if (action === "delete") {
    const result = await openAppDialog({
      title: "Delete collection?",
      message: `“${collectionName}” and its saved requests will be removed. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!result?.confirmed) return;
    collections = collections.filter((name) => name !== collectionName);
    savedRequests = savedRequests.filter(
      (request) => request.collection !== collectionName,
    );
    collapsedCollections.delete(collectionName);
    if (activeCollection === collectionName) {
      activeCollection = collections[0] || "";
    }
    writeStored(STORAGE_KEYS.collections, collections);
    writeStored(STORAGE_KEYS.requests, savedRequests);
    writeStored("postbird.collapsedCollections", [...collapsedCollections]);
    renderCollections();
    showToast("Collection deleted.");
  }
}

function exportCollection(collectionName) {
  const items = getCollectionRequests(collectionName).map((request) => {
    let rawUrl = request.url;
    let query = [];
    try {
      const url = new URL(request.url);
      const params = Array.isArray(request.params)
        ? request.params
        : [...url.searchParams.entries()].map(([key, value]) => ({
            enabled: true,
            key,
            value,
            description: "",
          }));
      url.search = "";
      for (const param of params) {
        if (param.enabled && param.key) {
          url.searchParams.append(param.key, param.value);
        }
      }
      rawUrl = url.href;
      query = params.map((param) => ({
        key: param.key,
        value: String(param.value ?? ""),
        description: param.description || undefined,
        disabled: param.enabled === false || undefined,
      }));
    } catch (error) {
      console.error(`Cannot export invalid URL in "${request.name}".`, error);
    }

    const item = {
      name: request.name,
      request: {
        method: request.method || "GET",
        header: (request.headers || []).map((header) => ({
          key: header.key,
          value: header.value,
          description: header.description || undefined,
          disabled: header.enabled === false || undefined,
        })),
        url: { raw: rawUrl, query },
      },
    };
    if (request.body) {
      item.request.body = { mode: "raw", raw: request.body };
    }
    return item;
  });
  const collection = {
    info: {
      name: collectionName,
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
  };
  const blob = new Blob([JSON.stringify(collection, null, 2)], {
    type: "application/json",
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `${collectionName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")}.postman_collection.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast(`Exported "${collectionName}".`);
}

function renderHistory() {
  const content = document.querySelector("#sidebarContent");
  content.replaceChildren();
  if (!historyItems.length) {
    const empty = document.createElement("p");
    empty.className = "request-description";
    empty.textContent = "Requests you send will appear here.";
    content.append(empty);
    return;
  }
  for (const item of historyItems) {
    const button = document.createElement("div");
    button.className = "sidebar-history-item";
    button.tabIndex = 0;
    button.setAttribute("role", "button");
    const method = document.createElement("span");
    method.className = `method-dot ${item.method.toLowerCase()}`;
    method.textContent = item.method;
    const requestUrl = document.createElement("span");
    requestUrl.textContent = item.url;
    button.append(method, requestUrl);
    button.addEventListener("click", () => {
      setActiveRequest("History request", item);
      document.querySelector("#sidebarSearch").value = "";
      document.querySelector("#sidebarSearch").placeholder = "Filter history";
    });
    content.append(button);
  }
}

async function createCollection() {
  const result = await openAppDialog({
    title: "Create a collection",
    label: "Collection name",
    confirmLabel: "Create",
  });
  if (!result?.confirmed) return;
  const normalized = result.value.trim();
  if (!normalized) {
    showToast("Collection name cannot be empty.");
    return;
  }
  if (
    collections.some((name) => name.toLowerCase() === normalized.toLowerCase())
  ) {
    showToast("A collection with that name already exists.");
    return;
  }
  collections.push(normalized);
  activeCollection = normalized;
  writeStored(STORAGE_KEYS.collections, collections);
  document.querySelector('[data-sidebar-view="collections"]').click();
  renderCollections();
  showToast(`Created "${normalized}".`);
}

function postmanUrl(url) {
  if (typeof url === "string") {
    try {
      const parsed = new URL(url);
      const params = [...parsed.searchParams.entries()].map(([key, value]) => ({
        enabled: true,
        key,
        value,
        description: "",
      }));
      parsed.search = "";
      return { raw: parsed.href, params };
    } catch {
      return { raw: url, params: [] };
    }
  }
  if (!url || typeof url !== "object") return null;

  let query = Array.isArray(url.query)
    ? url.query
        .filter((param) => param && typeof param.key === "string")
        .map((param) => ({
          enabled: !param.disabled,
          key: param.key,
          value: String(param.value ?? ""),
          description:
            typeof param.description === "string" ? param.description : "",
        }))
    : [];
  let raw = typeof url.raw === "string" ? url.raw : "";
  if (!raw) {
    const protocol =
      typeof url.protocol === "string" ? `${url.protocol}://` : "";
    const host = Array.isArray(url.host)
      ? url.host.join(".")
      : String(url.host || "");
    const pathname = Array.isArray(url.path)
      ? url.path.map(encodeURIComponent).join("/")
      : String(url.path || "");
    raw = `${protocol}${host}${pathname ? `/${pathname}` : ""}`;
  }

  if (!raw) return null;
  if (!query.length) {
    try {
      const parsed = new URL(raw);
      query = [...parsed.searchParams.entries()].map(([key, value]) => ({
        enabled: true,
        key,
        value,
        description: "",
      }));
    } catch {
      query = [];
    }
  }
  if (query.length) {
    try {
      const parsed = new URL(raw);
      parsed.search = "";
      return { raw: parsed.href, params: query };
    } catch {
      return { raw, params: query };
    }
  }
  return { raw, params: [] };
}

function importPostmanCollection(collection) {
  if (
    !collection ||
    typeof collection !== "object" ||
    !collection.info ||
    !Array.isArray(collection.item)
  ) {
    throw new Error(
      "This file is not a supported Postman collection v2 JSON file.",
    );
  }

  const collectionName =
    typeof collection.info.name === "string" && collection.info.name.trim()
      ? collection.info.name.trim()
      : "Imported collection";
  const importedRequests = [];

  function visit(items, folders = []) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      if (Array.isArray(item.item)) {
        visit(item.item, item.name ? [...folders, String(item.name)] : folders);
        continue;
      }

      const postmanRequest = item.request;
      if (!postmanRequest || typeof postmanRequest !== "object") continue;
      const requestUrl = postmanUrl(postmanRequest.url);
      if (!requestUrl) continue;

      const headers = Array.isArray(postmanRequest.header)
        ? postmanRequest.header
            .filter((header) => header && typeof header.key === "string")
            .map((header) => ({
              enabled: !header.disabled,
              key: header.key,
              value: String(header.value ?? ""),
              description:
                typeof header.description === "string"
                  ? header.description
                  : typeof header.description?.content === "string"
                    ? header.description.content
                    : "",
            }))
        : [];
      const requestName = String(item.name || "Untitled request");
      importedRequests.push({
        name: [...folders, requestName].join(" / "),
        collection: collectionName,
        method: String(postmanRequest.method || "GET").toUpperCase(),
        url: requestUrl.raw,
        params: requestUrl.params,
        headers,
        body:
          postmanRequest.body?.mode === "raw" &&
          typeof postmanRequest.body.raw === "string"
            ? postmanRequest.body.raw
            : "",
      });
    }
  }

  visit(collection.item);
  if (!importedRequests.length) {
    throw new Error("No requests were found in this Postman collection.");
  }

  if (!collections.includes(collectionName)) collections.push(collectionName);
  savedRequests = savedRequests.filter(
    (request) => request.collection !== collectionName,
  );
  savedRequests.push(...importedRequests);
  writeStored(STORAGE_KEYS.collections, collections);
  writeStored(STORAGE_KEYS.requests, savedRequests);
  activeCollection = collectionName;
  document.querySelector('[data-sidebar-view="collections"]').click();
  showToast(
    `Imported ${importedRequests.length} request${importedRequests.length === 1 ? "" : "s"} from "${collectionName}".`,
  );
}

async function readCollectionFile(file) {
  if (!file) return;
  try {
    const contents = await file.text();
    importPostmanCollection(JSON.parse(contents));
  } catch (error) {
    console.error("Unable to import the selected collection.", error);
    showToast(
      error instanceof SyntaxError
        ? "The collection file contains invalid JSON."
        : error.message || "Could not import this collection.",
    );
  }
}

async function sendRequest() {
  let requestUrl;
  try {
    requestUrl = getRequestUrl();
  } catch {
    showToast("Enter a valid HTTP or HTTPS URL.");
    urlInput.focus();
    return;
  }
  if (!window.apiClient?.sendRequest) {
    showToast(
      "The request bridge is unavailable. Restart the app and try again.",
    );
    return;
  }

  const method = methodSelect.value;
  const headers = {};
  for (const row of rowsFor(headersTable)) {
    if (row.enabled && row.key) headers[row.key] = row.value;
  }
  const bodyType = document
    .querySelector('input[name="bodyType"]:checked')
    ?.nextSibling?.textContent.trim();
  const body =
    bodyType === "none" ? "" : document.querySelector("#requestBody").value;
  if (
    body &&
    !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
  ) {
    headers["Content-Type"] = "application/json";
  }

  sendButton.disabled = true;
  sendButton.querySelector("span").textContent = "Sending";
  document.querySelector("#responseLabel").textContent = "Sending request...";
  document.querySelector("#responseMeta").textContent = "";
  responseEmpty.classList.add("hidden");
  responseContent.classList.remove("hidden");
  responseBody.textContent = "";

  const historyEntry = {
    method,
    url: requestUrl,
    headers: rowsFor(headersTable),
    body,
  };
  try {
    const result = await window.apiClient.sendRequest({
      method,
      url: requestUrl,
      headers,
      body,
    });
    const statusClass =
      result.status >= 200 && result.status < 400 ? "" : "bad";
    document.querySelector("#responseLabel").innerHTML =
      `<span class="status-pill ${statusClass}">${result.status} ${escapeHtml(result.statusText)}</span>`;
    const size = new TextEncoder().encode(result.body).length;
    document.querySelector("#responseMeta").innerHTML =
      `<span class="status-pill ${statusClass}">${result.status >= 200 && result.status < 400 ? "●" : "●"} ${result.status >= 200 && result.status < 400 ? "OK" : "Error"}</span><span>${result.duration} ms</span><span>${formatBytes(size)}</span>`;
    displayResponse(result);
    historyItems.unshift(historyEntry);
    historyItems = historyItems.slice(0, 40);
    writeStored(STORAGE_KEYS.history, historyItems);
  } catch (error) {
    document.querySelector("#responseLabel").textContent = "Request failed";
    document.querySelector("#responseMeta").innerHTML =
      '<span class="status-pill bad">● Error</span>';
    responseBody.textContent =
      error.message || "The request could not be completed.";
    document.querySelector("#responseFormat").textContent = "Text";
    responseHeaders.replaceChildren();
    document.querySelector("#responseHeaderCount").textContent = "0";
    historyItems.unshift(historyEntry);
    historyItems = historyItems.slice(0, 40);
    writeStored(STORAGE_KEYS.history, historyItems);
  } finally {
    sendButton.disabled = false;
    sendButton.querySelector("span").textContent = "Send";
  }
}

function displayResponse(result) {
  let displayBody = result.body;
  let format = "Text";
  const contentType = String(result.headers["content-type"] || "");
  if (contentType.includes("json") || /^[\s]*[{[]/.test(displayBody)) {
    try {
      displayBody = JSON.stringify(JSON.parse(displayBody), null, 2);
      format = "JSON";
    } catch {
      format = "JSON";
    }
  } else if (contentType.includes("xml")) {
    format = "XML";
  }
  responseBody.textContent = displayBody || "(empty response body)";
  document.querySelector("#responseFormat").textContent = format;
  responseHeaders.replaceChildren();
  const headerEntries = Object.entries(result.headers);
  document.querySelector("#responseHeaderCount").textContent =
    headerEntries.length;
  for (const [key, value] of headerEntries) {
    const row = document.createElement("div");
    row.className = "response-header-row";
    const name = document.createElement("strong");
    name.textContent = key;
    const content = document.createElement("span");
    content.textContent = Array.isArray(value)
      ? value.join(", ")
      : String(value);
    row.append(name, content);
    responseHeaders.append(row);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

document.querySelectorAll(".option-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".option-tab")
      .forEach((item) => item.classList.toggle("active", item === tab));
    document
      .querySelectorAll(".option-panel")
      .forEach((panel) =>
        panel.classList.toggle(
          "hidden",
          panel.id !== `panel-${tab.dataset.tab}`,
        ),
      );
  });
});

document.querySelectorAll(".response-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".response-tab")
      .forEach((item) => item.classList.toggle("active", item === tab));
    const showHeaders = tab.dataset.responseView === "headers";
    responseBody.classList.toggle("hidden", showHeaders);
    responseHeaders.classList.toggle("hidden", !showHeaders);
  });
});

document.querySelectorAll(".sidebar-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".sidebar-tab")
      .forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelector("#sidebarSearch").placeholder =
      tab.dataset.sidebarView === "history"
        ? "Filter history"
        : "Filter collections";
    if (tab.dataset.sidebarView === "history") renderHistory();
    else renderCollections();
  });
});

document.querySelectorAll("[data-clear]").forEach((button) => {
  button.addEventListener("click", () => {
    const table =
      button.dataset.clear === "params" ? paramsTable : headersTable;
    setRows(table, []);
    if (table === paramsTable) updateUrlFromParams();
  });
});

document
  .querySelector("[data-goto-headers]")
  .addEventListener("click", () =>
    document.querySelector('[data-tab="headers"]').click(),
  );
document.querySelector("#sendButton").addEventListener("click", sendRequest);
urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendRequest();
});
urlInput.addEventListener("change", populateParamsFromUrl);
methodSelect.addEventListener("change", () =>
  setRequestMethod(methodSelect.value),
);
document.querySelector("#newRequestTab").addEventListener("click", () => {
  setActiveRequest("New request", {
    method: "GET",
    url: "",
    headers: [],
    body: "",
  });
  urlInput.focus();
});
document
  .querySelector("#newCollection")
  .addEventListener("click", createCollection);
document
  .querySelector("#promoCreate")
  .addEventListener("click", createCollection);
document.querySelector("#importCollection").addEventListener("click", () => {
  document.querySelector("#collectionFile").click();
});
document
  .querySelector("#collectionFile")
  .addEventListener("change", (event) => {
    const [file] = event.currentTarget.files;
    readCollectionFile(file);
    event.currentTarget.value = "";
  });
document.querySelector("#minimizeWindow").addEventListener("click", () => {
  window.apiClient.minimizeWindow().catch((error) => {
    console.error("Unable to minimize the application window.", error);
    showToast("Could not minimize the window.");
  });
});
document
  .querySelector("#maximizeWindow")
  .addEventListener("click", async (event) => {
    try {
      const isMaximized = await window.apiClient.toggleMaximizeWindow();
      event.currentTarget.title = isMaximized ? "Restore" : "Maximize";
      event.currentTarget.setAttribute(
        "aria-label",
        isMaximized ? "Restore window" : "Maximize window",
      );
    } catch (error) {
      console.error("Unable to maximize the application window.", error);
      showToast("Could not resize the window.");
    }
  });
document.querySelector("#closeWindow").addEventListener("click", () => {
  window.apiClient.closeWindow().catch((error) => {
    console.error("Unable to close the application window.", error);
    showToast("Could not close the window.");
  });
});
document.querySelector("#saveRequest").addEventListener("click", async () => {
  if (!collections.includes(activeCollection)) {
    showToast("Create a collection before saving a request.");
    return;
  }
  const result = await openAppDialog({
    title: "Save request",
    label: "Request name",
    value: document.querySelector(".breadcrumbs strong").textContent,
    confirmLabel: "Save",
  });
  if (!result?.confirmed) return;
  const name = result.value.trim();
  if (!name) {
    showToast("Request name cannot be empty.");
    return;
  }
  const request = {
    name,
    collection: activeCollection,
    method: methodSelect.value,
    url: urlInput.value,
    params: rowsFor(paramsTable),
    headers: rowsFor(headersTable),
    body: document.querySelector("#requestBody").value,
  };
  savedRequests = savedRequests.filter(
    (item) =>
      !(item.name === request.name && item.collection === activeCollection),
  );
  savedRequests.push(request);
  writeStored(STORAGE_KEYS.requests, savedRequests);
  document.querySelector('[data-sidebar-view="collections"]').click();
  showToast("Request saved to your collection.");
});
appDialogForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!appDialogForm.reportValidity()) return;
  appDialog.close("confirm");
});
appDialog.addEventListener("close", () => {
  if (!dialogResolve) return;
  const result =
    appDialog.returnValue === "confirm"
      ? {
          confirmed: true,
          value: document.querySelector("#appDialogInput").value,
        }
      : null;
  const resolve = dialogResolve;
  dialogResolve = undefined;
  resolve(result);
});
document.querySelector("#appDialogCancel").addEventListener("click", () => {
  appDialog.close("cancel");
});
document.querySelector(".dialog-close").addEventListener("click", () => {
  appDialog.close("cancel");
});
document.querySelector("#copyResponse").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(responseBody.textContent);
    showToast("Response copied.");
  } catch (error) {
    console.error("Unable to copy the response.", error);
    showToast("Could not copy the response.");
  }
});
document.querySelector("#wrapResponse").addEventListener("click", () => {
  responseBody.classList.toggle("no-wrap");
});
document.querySelector("#sidebarSearch").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase();
  document
    .querySelectorAll(
      ".sidebar-request, .sidebar-history-item, .collection-heading",
    )
    .forEach((item) => {
      item.classList.toggle(
        "hidden",
        !item.textContent.toLowerCase().includes(query),
      );
    });
});
document.addEventListener("click", (event) => {
  if (event.target.closest(".collection-heading")) return;
  document.querySelectorAll(".collection-menu").forEach((menu) => {
    menu.classList.add("hidden");
  });
  document
    .querySelectorAll(".more-button")
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
});

populateParamsFromUrl();
setRows(headersTable, []);
renderCollections();
