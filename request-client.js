const axios = require("axios");

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;
const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function validateRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Invalid HTTP request.");
  }
  const { method, url, headers, body } = request;
  if (typeof method !== "string" || !ALLOWED_METHODS.has(method)) {
    throw new Error("Unsupported HTTP method.");
  }
  if (typeof url !== "string" || url.length > 8192) {
    throw new Error("The request URL is invalid or too long.");
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS URL.");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    throw new Error("Invalid request headers.");
  }
  for (const [name, value] of Object.entries(headers)) {
    if (
      !HEADER_NAME_PATTERN.test(name) ||
      typeof value !== "string" ||
      /[\r\n]/.test(value)
    ) {
      throw new Error(`Invalid request header: ${name}`);
    }
  }
  if (body !== undefined && typeof body !== "string") {
    throw new Error("The request body must be text.");
  }
}

async function sendHttpRequest(request) {
  validateRequest(request);
  const { method, url, headers, body } = request;
  const startedAt = Date.now();
  try {
    const response = await axios({
      method,
      url,
      headers,
      data: body && !["GET", "HEAD"].includes(method) ? body : undefined,
      responseType: "arraybuffer",
      timeout: REQUEST_TIMEOUT_MS,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxRedirects: 20,
      validateStatus: () => true,
    });
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers.toJSON(),
      body: Buffer.from(response.data).toString("utf8"),
      duration: Date.now() - startedAt,
    };
  } catch (error) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error("Request timed out after 30 seconds.");
    }
    if (error.message.includes("maxContentLength")) {
      throw new Error("Response is larger than the 10 MB limit.");
    }
    throw new Error(error.message || "The request could not be completed.");
  }
}

module.exports = { sendHttpRequest };
