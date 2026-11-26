import PostalMime from "postal-mime";

function htmlToPlainText(html = "") {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHashtags(text = "") {
  const matches = text.match(/#([a-zA-Z0-9_-]+)/g) || [];
  const unique = new Set(
    matches.map((tag) => tag.slice(1).trim().toUpperCase()).filter(Boolean)
  );
  return Array.from(unique);
}

function stripRecognizedHashtags(title = "", recognizedLabels = new Set()) {
  if (!title || recognizedLabels.size === 0) return title;

  const cleaned = title
    .replace(/(^|\s)#([a-zA-Z0-9_-]+)(?=\s|$|[.,!?;:])/g, (fullMatch, prefix, tagName) => {
      const normalized = tagName.trim().toUpperCase();
      if (recognizedLabels.has(normalized)) {
        return prefix === " " ? "" : prefix;
      }
      return fullMatch;
    })
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || title;
}

async function fetchExistingLabelsMap(baseUrl, token) {
  const res = await fetch(`${baseUrl}/api/v1/labels`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Labels ophalen mislukt (${res.status}): ${errText}`);
    return new Map();
  }

  const labels = await res.json();
  const labelMap = new Map();

  if (Array.isArray(labels)) {
    for (const label of labels) {
      const normalized = (label.title || "").trim().toUpperCase();
      if (normalized && label.id) {
        labelMap.set(normalized, label.id);
      }
    }
  }

  return labelMap;
}

export default {
  async email(message, env) {
    const allowedSenders = (env.ALLOWED_SENDERS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const sender = (message.from || "").trim().toLowerCase();
    if (allowedSenders.length > 0 && !allowedSenders.includes(sender)) {
      message.setReject("Sender not authorized for Vikunja inbox");
      return;
    }

    const token = (env.VIKUNJA_TOKEN || "").trim();
    const baseUrl = env.VIKUNJA_URL.replace(/\/+$/, "");

    const parsed = await PostalMime.parse(message.raw);
    const subject = (parsed.subject || "").trim();
    const rawTitle = subject || `E-mail van ${sender || "onbekend"}`;
    const description = (parsed.text || "").trim() || htmlToPlainText(parsed.html || "");

    const titleTags = extractHashtags(rawTitle);
    const bodyTags = extractHashtags(description);
    const candidateTags = Array.from(new Set([...titleTags, ...bodyTags]));

    const existingLabels =
      candidateTags.length > 0
        ? await fetchExistingLabelsMap(baseUrl, token)
        : new Map();

    const matchedTitleLabels = new Set(
      titleTags.filter((tag) => existingLabels.has(tag))
    );
    const finalTitle = stripRecognizedHashtags(rawTitle, matchedTitleLabels);

    const labelsToAttach = candidateTags.filter((tag) => existingLabels.has(tag));

    const endpoint = `${baseUrl}/api/v1/projects/${env.VIKUNJA_INBOX_PROJECT_ID}/tasks`;

    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: finalTitle,
        description,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Vikunja API error ${response.status}: ${errBody}`);
      message.setReject("Failed to create task in Vikunja");
      return;
    }

    const createdTask = await response.json();
    const taskId = createdTask.id;

    for (const labelTitle of labelsToAttach) {
      const labelId = existingLabels.get(labelTitle);
      if (!labelId) continue;

      const attachRes = await fetch(`${baseUrl}/api/v1/tasks/${taskId}/labels`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ label_id: labelId }),
      });

      if (!attachRes.ok) {
        const attachErr = await attachRes.text();
        console.error(
          `Label '${labelTitle}' koppelen aan taak ${taskId} mislukt (${attachRes.status}): ${attachErr}`
        );
      }
    }
  },
};