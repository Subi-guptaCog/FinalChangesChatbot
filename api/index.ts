import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import dns from "dns";
import fs from "fs";
import path from "path";

// Resolve common Node.js fetch failed/DNS resolution issues by prioritizing IPv4
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

dotenv.config({ override: true });

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
      console.log(`[OpenRouter Chatbot Vercel] Attempting model: ${model}`);
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
      console.warn(`[OpenRouter Chatbot Vercel] Model ${model} failed:`, err.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("All OpenRouter models failed to respond.");
}

// On-demand Gemini client creation to ensure any API key changes take effect immediately
function getGeminiClient(): GoogleGenAI {
  const key = getEffectiveApiKey() || "";
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
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
        priority: msg.includes("high") ? "High" : msg.includes("low") ? "Low" : "Medium",
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
    reply = `I received your message: "${message}". I parsed your input with the offline backup engine. To unlock full, human-like AI assistance and planning capabilities, please set your actual Google Gemini API Key in your deployment environment variables.`;
  }

  return { reply, actions };
}

// Health check route
app.get(["/api/health", "/health", "/api/", "/"], (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  res.json({
    status: "ok",
    hasApiKey: !!getEffectiveApiKey(),
    keyExists: !!key,
    keyPrefix: key ? key.substring(0, 6) : null,
    time: new Date().toISOString(),
    platform: "Vercel Serverless"
  });
});

// Endpoint to upload CSV file: checks if folder exists, if not creates it, and saves the file
app.post("/api/upload-csv", (req, res) => {
  try {
    const { csvContent, fileName } = req.body;
    if (!csvContent || typeof csvContent !== "string") {
      res.status(400).json({ error: "No CSV content provided." });
      return;
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
      res.json({
        success: true,
        message: `Successfully saved inside server folder '${targetFolder}' as '${safeFileName}'.`,
        folderPath: dirPath,
        filePath: filePath,
      });
    } else {
      // In serverless/read-only environments, we still succeed or provide a graceful notification because tasks are loaded in client state.
      res.json({
        success: true,
        message: `CSV integrated in client session state. (Server-side storage was bypassed in serverless cloud environment)`,
        serverlessMode: true
      });
    }
  } catch (error: any) {
    console.error("[CSV WORKSPACE] Upload error:", error);
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

// Chatbot routing route
app.post(["/api/chat", "/chat"], async (req, res) => {
  try {
    const { message, history, currentTasks } = req.body;

    if (!message) {
      res.status(400).json({ error: "Missing 'message' field" });
      return;
    }

    const apiKey = getEffectiveApiKey();
    const isPlaceholder = !apiKey || apiKey === "PLACEHOLDER" || apiKey.includes("MY_GEMINI_API") || apiKey === "" || apiKey === "AIzaSyYourNewApiKeyHere";

    if (isPlaceholder) {
      const fallback = parseTaskActionOffline(message, currentTasks || []);
      fallback.reply += " [⚠️ Local Fallback — Set your GEMINI_API_KEY in Vercel to unlock Gemini capabilities]";
      res.json(fallback);
      return;
    }

    try {
      const ai = getGeminiClient();

      // Prepare system instructions with the current task list
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
         - The payload must contain appropriate properties (title, description, priority: "Low" or "Medium" or "High", status: "New" or "In progress" or "code completed" or "waiting for QA" or "ready" or "done", dueDate, category)
      2. If the user asks you to mark a task as done, complete, or finish:
         - Search for the task in the list above by name, keywords, or look at the ID.
         - If found, include an action of type 'COMPLETE_TASK' with the payload of { id: "taskId" }
      3. If the user asks to modify/edit details of an existing task:
         - Find the task id.
         - Include an action of type 'UPDATE_TASK' with { id: "taskId", title, description, priority: "Low" | "Medium" | "High", status: "New" | "In progress" | "code completed" | "waiting for QA" | "ready" | "done" }
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
          console.log("[TaskChatbot Vercel] Routing requests to OpenRouter...");
          const { text: outputText, successfulModel } = await queryOpenRouter(apiKey, systemInstruction, contents);
          const resultObj = JSON.parse(outputText);
          resultObj.reply = `[⚡ OpenRouter: ${successfulModel}] ` + resultObj.reply;
          res.json(resultObj);
          return;
        } catch (orError: any) {
          console.error("OpenRouter API call failed, falling back to rule-based parser:", orError);
          const fallback = parseTaskActionOffline(message, currentTasks || []);
          fallback.reply = `[⚠️ OpenRouter API Offline] ${orError.message || orError}.\n\nUsing local backup:\n${fallback.reply}`;
          res.json(fallback);
          return;
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
                            description: "Data for the action. For ADD_TASK, payload should have properties like title, description (optional), priority ('Low' | 'Medium' | 'High'), status ('New' | 'In progress' | 'code completed' | 'waiting for QA' | 'ready' | 'done'), dueDate, category. For COMPLETE_TASK/DELETE_TASK, must have { id }",
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
            console.warn(`[Vercel Serverless API] Model ${model} failed on attempt ${attempt}. Error: ${errMsg}`);

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
      res.json(resultObj);
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
      res.json(fallback);
    }
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Internal Server Error" });
  }
});

export default app;
