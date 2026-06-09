import { Handler } from "@netlify/functions";
import { GoogleGenAI, Type } from "@google/genai";
import dns from "dns";
import fs from "fs";
import path from "path";

// Resolve common Node.js fetch failed/DNS resolution issues by prioritizing IPv4
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

function getEffectiveApiKey(): string | undefined {
  let envKey = process.env.GEMINI_API_KEY;

  console.log("GEMINI_API_KEY Exists:", !!envKey);

  if (!envKey) return undefined;

  envKey = envKey.trim().replace(/^["']|["']$/g, "").trim();

  if (
    envKey === "PLACEHOLDER" ||
    envKey.includes("MY_GEMINI_API") ||
    envKey === "" ||
    envKey === "AIzaSyYourNewApiKeyHere"
  ) {
    return undefined;
  }

  return envKey;
}

async function queryOpenRouter(apiKey: string, systemInstruction: string, contents: any[]): Promise<{ text: string; successfulModel: string }> {
  // Try google models first on OpenRouter, then standard failovers
  const MODELS_TO_TRY = [
    "google/gemini-2.5-flash:free",
    "meta-llama/llama-3-8b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
    "qwen/qwen-2-7b-instruct:free",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
    "meta-llama/llama-3.3-70b-instruct",
    "openai/gpt-4o-mini"
  ];

  let lastError: any = null;
  for (const model of MODELS_TO_TRY) {
    try {
      console.log(`[OpenRouter Chatbot Netlify] Attempting model: ${model}`);
      const openrouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.studio/build",
          "X-Title": "Task Chatbot"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemInstruction },
            ...contents.map((c: any) => ({
              role: c.role === "model" ? "assistant" : c.role,
              content: c.parts?.[0]?.text || ""
            }))
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!openrouterResponse.ok) {
        const errText = await openrouterResponse.text();
        throw new Error(`OpenRouter API failed (${openrouterResponse.status}): ${errText}`);
      }

      const data = await openrouterResponse.json() as any;
      const text = data.choices?.[0]?.message?.content;
      if (text) {
        return { text, successfulModel: model };
      }
    } catch (err: any) {
      console.warn(`[OpenRouter Chatbot Netlify] Model ${model} failed:`, err.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("All OpenRouter models failed to respond.");
}

// Local rule-based task actions parsing engine for offline fallback
function parseTaskActionOffline(message: string, currentTasks: any[]): { reply: string; actions: any[] } {
  const msg = message.toLowerCase();
  const actions: any[] = [];
  let reply = "";

  if (msg.includes("add") || msg.includes("create") || msg.includes("new task") || msg.includes("schedule")) {
    let title = "New Task Item";
    const matches = message.match(/(?:add|create|new task|schedule)(?: called| task)?\s+["']?([^"'\n]+)["']?/i);
    if (matches && matches[1]) {
      title = matches[1].replace(/["']/g, "").trim();
    } else {
      const words = message.split(/\s+/);
      const addIndex = words.findIndex(w => ["add", "create", "new"].includes(w.toLowerCase()));
      if (addIndex !== -1 && addIndex < words.length - 1) {
        title = words.slice(addIndex + 1).join(" ");
      }
    }

    title = title.substring(0, 1).toUpperCase() + title.substring(1);

    actions.push({
      type: "ADD_TASK",
      payload: {
        title,
        description: "Task automatically generated via high-fidelity offline fallback parser.",
        priority: msg.includes("high") || msg.includes("hight") ? "Hight" : msg.includes("low") ? "Low" : "Medium",
        status: "New",
        category: "Chatbot"
      }
    });
    reply = `I have processed your query locally and created the task: "${title}".`;
  } else if (msg.includes("complete") || msg.includes("done") || msg.includes("finish") || msg.includes("solve")) {
    let matchedTask = null;
    const taskList = currentTasks || [];
    for (const task of taskList) {
      if (!task || !task.id) continue;
      const idNum = task.id.replace(/[^\d]/g, "");
      if (
        msg.includes(task.id.toLowerCase()) || 
        (idNum && msg.includes(idNum)) || 
        msg.includes(task.title.toLowerCase())
      ) {
        matchedTask = task;
        break;
      }
    }

    if (matchedTask) {
      actions.push({
        type: "COMPLETE_TASK",
        payload: { id: matchedTask.id }
      });
      reply = `I have marked "${matchedTask.title}" as completed.`;
    } else {
      reply = "I parsed your instruction to complete a task, but could not find a matching item. Please specify the task's numeric code (e.g. 104) or title and I will mark it as complete.";
    }
  } else if (msg.includes("delete") || msg.includes("remove") || msg.includes("purge") || msg.includes("discard")) {
    let matchedTask = null;
    const taskList = currentTasks || [];
    for (const task of taskList) {
      if (!task || !task.id) continue;
      const idNum = task.id.replace(/[^\d]/g, "");
      if (
        msg.includes(task.id.toLowerCase()) || 
        (idNum && msg.includes(idNum)) || 
        msg.includes(task.title.toLowerCase())
      ) {
        matchedTask = task;
        break;
      }
    }

    if (matchedTask) {
      actions.push({
        type: "DELETE_TASK",
        payload: { id: matchedTask.id }
      });
      reply = `I have deleted task "${matchedTask.title}" from your work checklist.`;
    } else {
      reply = "I parsed your request to delete a task, but could not find a matching database entry.";
    }
  } else {
    reply = `I received your message: "${message}". I parsed your input with the offline backup engine. To unlock full, human-like AI assistance and planning capabilities, please set your actual Google Gemini API Key in your Environment Variables.`;
  }

  return { reply, actions };
}

export const handler: Handler = async (event) => {
  const reqPath = event.path || "";
  const method = event.httpMethod;
  const queryParams = event.queryStringParameters || {};
  const isHealthRoute = reqPath.endsWith("/health") || reqPath.includes("/health") || queryParams.route === "health";
  const isChatRoute = reqPath.endsWith("/chat") || reqPath.includes("/chat") || queryParams.route === "chat";
  const isUploadCsvRoute = reqPath.endsWith("/upload-csv") || reqPath.includes("/upload-csv") || queryParams.route === "upload-csv";

  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "CORS preflight OK" }),
    };
  }

  // Health check route
  if (isHealthRoute) {
    const key = process.env.GEMINI_API_KEY;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "ok",
        hasApiKey: !!getEffectiveApiKey(),
        keyExists: !!key,
        keyPrefix: key ? key.substring(0, 6) : null,
        time: new Date().toISOString()
      }),
    };
  }

  // Upload CSV route
  if (isUploadCsvRoute && method === "POST") {
    try {
      if (!event.body) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "No body provided." }),
        };
      }

      const { csvContent, fileName } = JSON.parse(event.body);
      if (!csvContent || typeof csvContent !== "string") {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "No CSV content provided." }),
        };
      }

      // Name of target folder for CSV uploads
      const targetFolder = "DesktopTasksWorkspace";
      const dirPath = path.join(process.cwd(), targetFolder);

      // If the directory does not exist, try to create it
      try {
        if (!fs.existsSync(dirPath)) {
          console.log(`[CSV WORKSPACE] Directory does not exist. Creating folder: ${dirPath}`);
          fs.mkdirSync(dirPath, { recursive: true });
        }
      } catch (fsWriteErr: any) {
        console.warn("[CSV WORKSPACE] Could not create directory (expected in read-only serverless):", fsWriteErr);
      }

      const safeFileName = fileName || "tasks.csv";
      const filePath = path.join(dirPath, safeFileName);

      let savedLocally = false;
      try {
        // Save the file physically (may fail in serverless - we capture it)
        fs.writeFileSync(filePath, csvContent, "utf8");
        console.log(`[CSV WORKSPACE] File successfully uploaded and saved: ${filePath}`);
        savedLocally = true;
      } catch (fsWriteErr: any) {
        console.warn("[CSV WORKSPACE] File save failed (expected in read-only serverless):", fsWriteErr);
      }

      if (savedLocally) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `Successfully saved inside server folder '${targetFolder}' as '${safeFileName}'.`,
            folderPath: dirPath,
            filePath: filePath,
          }),
        };
      } else {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `CSV integrated in client session state. (Server-side storage was bypassed in serverless cloud environment)`,
            serverlessMode: true,
          }),
        };
      }
    } catch (error: any) {
      console.error("[CSV WORKSPACE] Upload error:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: error?.message || "Internal server error" }),
      };
    }
  }

  // Chatbot routing
  if (isChatRoute && method === "POST") {
    let message = "";
    let history: any[] = [];
    let currentTasks: any[] = [];

    try {
      if (!event.body) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing body" }),
        };
      }

      const parsed = JSON.parse(event.body);
      message = parsed.message;
      history = parsed.history || [];
      currentTasks = parsed.currentTasks || [];

      if (!message) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing 'message' field" }),
        };
      }

      const apiKey = getEffectiveApiKey();
      const isPlaceholder = !apiKey || apiKey === "PLACEHOLDER" || apiKey.includes("MY_GEMINI_API") || apiKey === "" || apiKey === "AIzaSyYourNewApiKeyHere";

      if (isPlaceholder) {
        const fallback = parseTaskActionOffline(message, currentTasks || []);
        fallback.reply += " [⚠️ Local Fallback — Set your GEMINI_API_KEY in Netlify Environment Variables to unlock Gemini capabilities]";
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(fallback),
        };
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // Prepare system instructions
      const tasksOverview = JSON.stringify(currentTasks || []);
      const systemInstruction = `You are a highly efficient, friendly Task Management Assistant.
      You help the user capture, organize, break down, edit, delete, and complete work tasks.
      
      Current Task List of the user:
      ${tasksOverview}
      
      Current Date: ${new Date().toLocaleDateString()}
      
      Your goal is to answer the user's message, offer insights, and if requested, generate tasks, update, complete, or delete task structures.
      You MUST output your response in JSON format according to the specified schema containing 'reply' and 'actions'.
      
      Guidelines:
      1. If the user asks you to add, write, create, or schedule a task (e.g., "Add 'buy milk' to my todo list"):
         - Include an action of type 'ADD_TASK'
         - The payload must contain appropriate properties (title, description, priority: "Low" or "Medium" or "High" or "Hight", status: "New" or "In progress" or "code completed" or "waiting for QA" or "ready" or "done", dueDate, category)
      2. If the user asks you to mark a task as done, complete, or finish:
         - Search for the task in the list above by name, keywords, or look at the ID.
         - If found, include an action of type 'COMPLETE_TASK' with the payload of { id: "taskId" }
      3. If the user asks to modify/edit details of an existing task:
         - Find the task id.
         - Include an action of type 'UPDATE_TASK' with { id: "taskId", title, description, priority: "Low" | "Medium" | "High" | "Hight", status: "New" | "In progress" | "code completed" | "waiting for QA" | "ready" | "done" }
      4. If the user asks to delete, remove, or throw away a task:
         - Find the task id.
         - Include an action of type 'DELETE_TASK' with { id: "taskId" }
      5. Always write a meaningful, polite response in the 'reply' field explaining what action was performed or answering the user's question.
      6. If no task actions are requested, 'actions' must be an empty array or actions with type 'NONE'.`;

      const contents: any[] = [];
      if (history && Array.isArray(history)) {
        history.forEach((msg: any) => {
          contents.push({
            role: msg.sender === "user" ? "user" : "model",
            parts: [{ text: msg.text }]
          });
        });
      }

      contents.push({
        role: "user",
        parts: [{ text: message }]
      });

      // Check if this is an OpenRouter API key and route accordingly
      const isOpenRouter = apiKey && (apiKey.startsWith("sk-or-") || apiKey.startsWith("sk-"));
      if (isOpenRouter) {
        try {
          console.log("[TaskChatbot Netlify] Routing requests to OpenRouter...");
          const { text: outputText, successfulModel } = await queryOpenRouter(apiKey, systemInstruction, contents);
          const resultObj = JSON.parse(outputText);
          resultObj.reply = `[⚡ OpenRouter: ${successfulModel}] ` + resultObj.reply;
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(resultObj),
          };
        } catch (orError: any) {
          console.error("OpenRouter API call failed, falling back to rule-based parser:", orError);
          const fallback = parseTaskActionOffline(message, currentTasks || []);
          fallback.reply = `[⚠️ OpenRouter API Offline] ${orError.message || orError}.\n\nUsing local backup:\n${fallback.reply}`;
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(fallback),
          };
        }
      }

      const MODELS_TO_TRY = [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash"
      ];
      let response = null;
      let lastError: any = null;
      let successfulModel = "";

      for (const model of MODELS_TO_TRY) {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            response = await ai.models.generateContent({
              model,
              contents,
              config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    reply: {
                      type: Type.STRING,
                      description: "The spoken response back to the user."
                    },
                    actions: {
                      type: Type.ARRAY,
                      description: "Tasks actions to update state.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          type: {
                            type: Type.STRING,
                            description: "Action type: 'ADD_TASK', 'UPDATE_TASK', 'DELETE_TASK', 'COMPLETE_TASK', or 'NONE'"
                          },
                          payload: {
                            type: Type.OBJECT,
                            description: "Data for the action. For ADD_TASK, payload should have properties like title, description (optional), priority ('Low' | 'Medium' | 'High' | 'Hight'), status ('New' | 'In progress' | 'code completed' | 'waiting for QA' | 'ready' | 'done'), dueDate, category. For COMPLETE_TASK/DELETE_TASK, must have { id }",
                            properties: {
                              id: { type: Type.STRING },
                              title: { type: Type.STRING },
                              description: { type: Type.STRING },
                              status: { type: Type.STRING },
                              priority: { type: Type.STRING },
                              dueDate: { type: Type.STRING },
                              category: { type: Type.STRING }
                            },
                          }
                        },
                        required: ["type"]
                      }
                    }
                  },
                  required: ["reply", "actions"]
                }
              }
            });

            if (response) {
              successfulModel = model;
              break;
            }
          } catch (err: any) {
            lastError = err;
            const errMsg = err.message || JSON.stringify(err);
            console.warn(`[Netlify API Function] Model ${model} failed on attempt ${attempt}. Error: ${errMsg}`);

            const isTransientError = 
              errMsg.includes("503") || 
              errMsg.includes("UNAVAILABLE") || 
              errMsg.includes("429") || 
              errMsg.includes("RESOURCE_EXHAUSTED") || 
              errMsg.includes("high demand") || 
              errMsg.includes("temporary");

            if (attempt < maxAttempts && isTransientError) {
              const isOverloadedOrQuotaExceeded = 
                errMsg.includes("503") || 
                errMsg.includes("429") || 
                errMsg.includes("RESOURCE_EXHAUSTED") || 
                errMsg.includes("high demand") || 
                errMsg.includes("temporary");
              if (isOverloadedOrQuotaExceeded) {
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
            } else {
              break;
            }
          }
        }
        if (response) {
          break;
        }
      }

      if (!response) {
        throw lastError || new Error("All resilience models and retries failed to respond.");
      }

      const outputText = response.text || "{}";
      const resultObj = JSON.parse(outputText);
      if (successfulModel !== MODELS_TO_TRY[0]) {
        resultObj.reply = `[⚡ Failover Active: ${successfulModel}] ` + resultObj.reply;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(resultObj),
      };
    } catch (apiError: any) {
      const fallback = parseTaskActionOffline(message, currentTasks || []);
      
      let errorString = "Unknown error";
      if (apiError) {
        if (typeof apiError === "string") {
          errorString = apiError;
        } else if (apiError.message) {
          errorString = apiError.message;
        } else {
          try {
            errorString = JSON.stringify(apiError);
          } catch (_) {
            errorString = String(apiError);
          }
        }
      }

      if (errorString.includes("UNAUTHENTICATED") || errorString.includes("401") || errorString.includes("invalid authentication credentials") || errorString.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED")) {
        const currentKey = getEffectiveApiKey() || "";
        if (currentKey.startsWith("AQ.") || currentKey.startsWith("ya29.")) {
          errorString = "The GEMINI_API_KEY starting with 'AQ.' in your secrets is an OAuth 2.0 Access Token. Since Google OAuth access tokens typically expire in 1 hour, your token has expired or lacks permissions. Please set a permanent Gemini API Key (starts with 'AIzaSy') in your system environment variables or .env file to restore online AI capabilities";
        } else {
          errorString = `Your configured GEMINI_API_KEY (starts with '${currentKey.substring(0, 6)}') is invalid or lacks permissions. Please configure a valid Gemini API Key starting with 'AIzaSy'`;
        }
      } else if (
        errorString.includes("API key expired") ||
        errorString.includes("API_KEY_INVALID") ||
        errorString.includes("renew the API key") ||
        errorString.includes("expired")
      ) {
        errorString = "Your configured GEMINI_API_KEY has expired. Please open the Settings menu in Google AI Studio, locate the GEMINI_API_KEY secret, and renew or replace it with a fresh active API key starting with 'AIzaSy' to resume live online AI planning";
      }

      fallback.reply = `[⚠️ Gemini API Offline] ${errorString}.\n\nUsing local backup:\n${fallback.reply}`;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(fallback),
      };
    }
  }

  // Handle default fallback
  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ error: `Not Found: ${method} ${reqPath}` }),
  };
};
