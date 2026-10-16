import React, { useState } from "react";
import { 
  Workflow, 
  Copy, 
  Check, 
  Play, 
  Globe, 
  Layers, 
  ExternalLink, 
  Bot, 
  Cpu, 
  ArrowRight, 
  Database, 
  Terminal, 
  CheckCircle2, 
  Sparkles,
  Zap,
  HelpCircle,
  Code2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface N8nIntegrationPanelProps {
  onClose?: () => void;
  onAddLog?: (log: string) => void;
}

export default function N8nIntegrationPanel({ onClose, onAddLog }: N8nIntegrationPanelProps) {
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const [activeTab, setActiveTab] = useState<"n8n-node" | "ai-tool" | "curl" | "tester">("n8n-node");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live tester states
  const [testMessage, setTestMessage] = useState("What are my highest priority tasks?");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
    if (onAddLog) {
      onAddLog(`[N8N INTEGRATION] Copied ${key} to clipboard.`);
    }
  };

  const chatEndpointUrl = `${currentOrigin}/api/chat`;
  const tasksEndpointUrl = `${currentOrigin}/api/tasks`;

  // Pre-configured n8n node JSON snippet that can be directly pasted into n8n canvas via Ctrl+V
  const n8nNodeJson = JSON.stringify({
    nodes: [
      {
        parameters: {
          method: "POST",
          url: chatEndpointUrl,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Content-Type",
                value: "application/json"
              }
            ]
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={\n  \"message\": \"={{ $json.chatInput || $json.output || $json.text || $json.query || 'What are my tasks?' }}\"\n}",
          options: {}
        },
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [480, 240],
        id: "aichatbotoli-http-node",
        name: "HTTP Request - AICHATBOTOLI"
      }
    ],
    connections: {}
  }, null, 2);

  const curlCommand = `curl -X POST "${chatEndpointUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "What tasks do I have scheduled?",
    "currentTasks": []
  }'`;

  const handleRunTest = async () => {
    if (!testMessage.trim()) return;
    setIsTesting(true);
    setTestError(null);
    setTestResult(null);
    const startTime = performance.now();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testMessage
        })
      });

      const elapsed = Math.round(performance.now() - startTime);
      setTestLatency(elapsed);

      const data = await res.json();
      setTestResult(data);
      if (onAddLog) {
        onAddLog(`[N8N TEST] POST /api/chat responded with HTTP ${res.status} in ${elapsed}ms.`);
      }
    } catch (err: any) {
      setTestError(err.message || "Failed to make HTTP request");
      if (onAddLog) {
        onAddLog(`[N8N TEST ERROR] ${err.message}`);
      }
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#090B0E] text-[#E0E0E0] overflow-hidden select-text">
      
      {/* Top Banner Header */}
      <div className="p-4 md:p-5 bg-[#161B22] border-b border-[#2D3139] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#EA4B71] to-[#FF6B4A] flex items-center justify-center text-white shadow-md shadow-orange-500/20 font-black text-lg">
            n8n
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">n8n Agent & HTTP API Setup</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-bold">
                CORS Enabled
              </span>
            </div>
            <p className="text-xs text-[#8B949E] mt-0.5">
              Connect your n8n workflow, AI Agent, or Groq/Gemini pipeline directly to this application.
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="self-end sm:self-auto px-3 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] border border-[#2D3139] text-xs font-mono text-white transition-colors cursor-pointer"
          >
            Close Guide ✕
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* Visual Workflow Diagram Matching User's Image */}
        <div className="bg-[#12161F] border border-[#2D3139] rounded-xl p-4 md:p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-mono font-bold text-[#8B949E] uppercase tracking-wider flex items-center gap-1.5">
              <Workflow className="w-4 h-4 text-orange-400" />
              Workflow Architecture (From your n8n canvas)
            </span>
            <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
              Ready to Connect
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            {/* Step 1: Chat Message Received */}
            <div className="bg-[#161B22] border border-[#2D3139] rounded-lg p-3 text-left relative group">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                  💬
                </div>
                <span className="text-xs font-bold text-white">When chat message received</span>
              </div>
              <p className="text-[11px] text-[#8B949E]">
                n8n Chat Trigger captures user prompt into:
              </p>
              <div className="mt-1.5 px-2 py-1 bg-[#090B0E] rounded font-mono text-[10px] text-amber-400">
                {"{{ $json.chatInput }}"}
              </div>
            </div>

            {/* Step 2: AI Agent */}
            <div className="bg-[#161B22] border border-[#2D3139] rounded-lg p-3 text-left">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                  🤖
                </div>
                <span className="text-xs font-bold text-white">AI Agent (Groq / Gemini)</span>
              </div>
              <p className="text-[11px] text-[#8B949E]">
                Processes conversation with Memory and routes request to:
              </p>
              <div className="mt-1.5 px-2 py-1 bg-[#090B0E] rounded font-mono text-[10px] text-blue-400">
                {"Groq Chat Model + Simple Memory"}
              </div>
            </div>

            {/* Step 3: Red Boxed HTTP Request Node */}
            <div className="bg-rose-500/5 border-2 border-rose-500 rounded-lg p-3 text-left shadow-lg shadow-rose-500/10">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">
                    🌐
                  </div>
                  <span className="text-xs font-bold text-white">HTTP Request Node</span>
                </div>
                <span className="text-[9px] bg-rose-500 text-white font-mono px-1.5 py-0.2 rounded font-bold uppercase">
                  Target
                </span>
              </div>
              <p className="text-[11px] text-[#E0E0E0]">
                Calls AICHATBOTOLI API to execute tasks & chat.
              </p>
              <div className="mt-1.5 px-2 py-1 bg-[#090B0E] rounded font-mono text-[10px] text-emerald-400 truncate">
                POST {chatEndpointUrl}
              </div>
            </div>
          </div>
        </div>

        {/* Live Detected API Endpoints */}
        <div className="bg-[#12161F] border border-[#2D3139] rounded-xl p-4 md:p-5 space-y-3">
          <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            Your Live API Endpoint URLs
          </h3>

          <div className="space-y-2">
            {/* Chat Endpoint */}
            <div className="bg-[#161B22] border border-[#2D3139] rounded-lg p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    POST
                  </span>
                  <span className="text-xs font-bold text-white font-mono truncate">{chatEndpointUrl}</span>
                </div>
                <span className="text-[11px] text-[#8B949E] block mt-0.5">
                  Primary chatbot endpoint. Accepts <code className="text-amber-400">message</code> or <code className="text-amber-400">chatInput</code> and returns AI response + task actions.
                </span>
              </div>
              <button
                onClick={() => copyToClipboard(chatEndpointUrl, "chat-url")}
                className="shrink-0 px-3 py-1 bg-[#21262D] hover:bg-[#30363D] border border-[#2D3139] rounded-md text-xs font-mono text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedKey === "chat-url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === "chat-url" ? "Copied!" : "Copy URL"}</span>
              </button>
            </div>

            {/* Tasks Endpoint */}
            <div className="bg-[#161B22] border border-[#2D3139] rounded-lg p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    GET / POST
                  </span>
                  <span className="text-xs font-bold text-white font-mono truncate">{tasksEndpointUrl}</span>
                </div>
                <span className="text-[11px] text-[#8B949E] block mt-0.5">
                  Fetch current work items (GET) or insert new tasks directly (POST) from your n8n workflow.
                </span>
              </div>
              <button
                onClick={() => copyToClipboard(tasksEndpointUrl, "tasks-url")}
                className="shrink-0 px-3 py-1 bg-[#21262D] hover:bg-[#30363D] border border-[#2D3139] rounded-md text-xs font-mono text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedKey === "tasks-url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === "tasks-url" ? "Copied!" : "Copy URL"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[#2D3139] pb-2 font-mono text-xs">
          <button
            onClick={() => setActiveTab("n8n-node")}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeTab === "n8n-node"
                ? "bg-blue-600/15 border border-[#3B82F6] text-[#3B82F6] font-bold"
                : "text-[#8B949E] hover:text-white hover:bg-[#161B22]"
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>1. HTTP Request Node Config</span>
          </button>

          <button
            onClick={() => setActiveTab("ai-tool")}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeTab === "ai-tool"
                ? "bg-blue-600/15 border border-[#3B82F6] text-[#3B82F6] font-bold"
                : "text-[#8B949E] hover:text-white hover:bg-[#161B22]"
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>2. AI Agent Tool Option</span>
          </button>

          <button
            onClick={() => setActiveTab("curl")}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeTab === "curl"
                ? "bg-blue-600/15 border border-[#3B82F6] text-[#3B82F6] font-bold"
                : "text-[#8B949E] hover:text-white hover:bg-[#161B22]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>3. cURL & JSON Spec</span>
          </button>

          <button
            onClick={() => setActiveTab("tester")}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeTab === "tester"
                ? "bg-emerald-600/15 border border-emerald-500 text-emerald-400 font-bold"
                : "text-[#8B949E] hover:text-white hover:bg-[#161B22]"
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>4. Live API Tester</span>
          </button>
        </div>

        {/* Tab 1: HTTP Request Node */}
        {activeTab === "n8n-node" && (
          <div className="space-y-4">
            <div className="bg-[#12161F] border border-[#2D3139] rounded-xl p-4 md:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">How to Configure the n8n HTTP Request Node</h4>
                  <p className="text-xs text-[#8B949E] mt-0.5">
                    Enter these exact fields into your red-boxed HTTP Request node in n8n:
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(n8nNodeJson, "n8n-node-json")}
                  className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow cursor-pointer"
                  title="Copy ready-to-paste n8n node JSON"
                >
                  {copiedKey === "n8n-node-json" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy n8n Node JSON (Ctrl+V into Canvas)</span>
                </button>
              </div>

              {/* Table of settings */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border border-[#2D3139] rounded-lg">
                  <thead>
                    <tr className="bg-[#161B22] text-[#8B949E] border-b border-[#2D3139]">
                      <th className="p-2.5">Field in n8n Node</th>
                      <th className="p-2.5">Recommended Value</th>
                      <th className="p-2.5">Explanation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2D3139] text-[#E0E0E0]">
                    <tr>
                      <td className="p-2.5 font-bold text-white">Method</td>
                      <td className="p-2.5 text-blue-400 font-bold">POST</td>
                      <td className="p-2.5 text-[#8B949E]">HTTP POST request to process conversation</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-white">URL</td>
                      <td className="p-2.5 text-emerald-400 select-all">{chatEndpointUrl}</td>
                      <td className="p-2.5 text-[#8B949E]">The API URL of this application</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-white">Authentication</td>
                      <td className="p-2.5 text-gray-400">None</td>
                      <td className="p-2.5 text-[#8B949E]">Direct open endpoint with built-in CORS</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-white">Send Headers</td>
                      <td className="p-2.5 text-white">Toggle ON</td>
                      <td className="p-2.5 text-[#8B949E]">Set <code className="text-amber-400">Content-Type: application/json</code></td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-white">Send Body</td>
                      <td className="p-2.5 text-emerald-400">Toggle ON</td>
                      <td className="p-2.5 text-[#8B949E]">Must send payload containing your chat input</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-white">Specify Body</td>
                      <td className="p-2.5 text-white">Using JSON</td>
                      <td className="p-2.5 text-[#8B949E]">Raw JSON format</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-white">JSON</td>
                      <td className="p-2.5 text-amber-400 font-bold select-all whitespace-pre">
                        {`{\n  "message": "={{ $json.chatInput }}"\n}`}
                      </td>
                      <td className="p-2.5 text-[#8B949E]">
                        Or if receiving from AI Agent node: <code className="text-amber-400">{"{{ $json.output }}"}</code>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Response Extraction Guide */}
              <div className="bg-[#161B22] border border-blue-500/20 rounded-lg p-3 space-y-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  How to extract and display the reply in n8n:
                </span>
                <p className="text-xs text-[#8B949E] leading-relaxed">
                  The API returns a clean JSON object containing both <code className="text-emerald-400 font-mono">reply</code> and <code className="text-emerald-400 font-mono">output</code> keys. In any subsequent n8n node (like Respond to Webhook or n8n Chat output), reference it as:
                </p>
                <div className="flex flex-wrap gap-2 font-mono text-xs">
                  <div className="px-2.5 py-1 bg-[#090B0E] border border-[#2D3139] rounded text-emerald-400">
                    {"={{ $json.reply }}"}
                  </div>
                  <div className="px-2.5 py-1 bg-[#090B0E] border border-[#2D3139] rounded text-blue-400">
                    {"={{ $json.output }}"}
                  </div>
                  <div className="px-2.5 py-1 bg-[#090B0E] border border-[#2D3139] rounded text-amber-400">
                    {"={{ $json.actions }}"} <span className="text-[#8B949E]">(Task operations array)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: AI Agent Custom Tool */}
        {activeTab === "ai-tool" && (
          <div className="space-y-4">
            <div className="bg-[#12161F] border border-[#2D3139] rounded-xl p-4 md:p-5 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-white">Using this Application as a Custom Tool in n8n AI Agent</h4>
                <p className="text-xs text-[#8B949E] mt-0.5">
                  In your screenshot, notice the <span className="text-white font-bold">&quot;Tool +&quot;</span> connector under the AI Agent. You can connect a Custom Tool so your Groq model can call this chatbot on demand!
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#161B22] border border-[#2D3139] rounded-lg p-3 space-y-2">
                  <span className="text-xs font-mono font-bold text-blue-400 uppercase">Tool Configuration</span>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div>
                      <span className="text-[#8B949E] block text-[10px]">Tool Name:</span>
                      <span className="text-white">task_manager_assistant</span>
                    </div>
                    <div>
                      <span className="text-[#8B949E] block text-[10px]">Description:</span>
                      <span className="text-white">Call this tool to ask questions about tasks, list pending work items, or create/update/delete tasks.</span>
                    </div>
                    <div>
                      <span className="text-[#8B949E] block text-[10px]">HTTP Method:</span>
                      <span className="text-emerald-400 font-bold">POST</span>
                    </div>
                    <div>
                      <span className="text-[#8B949E] block text-[10px]">URL:</span>
                      <span className="text-white select-all">{chatEndpointUrl}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#161B22] border border-[#2D3139] rounded-lg p-3 space-y-2">
                  <span className="text-xs font-mono font-bold text-emerald-400 uppercase">Input Payload Expression</span>
                  <div className="p-2.5 bg-[#090B0E] rounded font-mono text-xs text-amber-300">
                    {`{\n  "message": "{input}"\n}`}
                  </div>
                  <p className="text-[11px] text-[#8B949E]">
                    n8n replaces <code className="text-white">{`{input}`}</code> with whatever prompt the Groq AI agent decides to query. The assistant returns the answer directly to the agent.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: cURL & Raw Spec */}
        {activeTab === "curl" && (
          <div className="space-y-4">
            <div className="bg-[#12161F] border border-[#2D3139] rounded-xl p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">cURL Command for Testing / Terminal</h4>
                <button
                  onClick={() => copyToClipboard(curlCommand, "curl-cmd")}
                  className="px-2.5 py-1 bg-[#21262D] hover:bg-[#30363D] border border-[#2D3139] rounded text-xs font-mono text-white flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === "curl-cmd" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === "curl-cmd" ? "Copied!" : "Copy cURL"}</span>
                </button>
              </div>

              <pre className="p-3 bg-[#090B0E] border border-[#2D3139] rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto leading-relaxed">
                {curlCommand}
              </pre>

              <div className="mt-4">
                <h5 className="text-xs font-mono font-bold text-[#8B949E] uppercase mb-1.5">Expected JSON Response</h5>
                <pre className="p-3 bg-[#090B0E] border border-[#2D3139] rounded-lg font-mono text-xs text-blue-300 overflow-x-auto">
{`{
  "reply": "I have created the new task 'Prepare Q3 Report' for you.",
  "output": "I have created the new task 'Prepare Q3 Report' for you.",
  "text": "I have created the new task 'Prepare Q3 Report' for you.",
  "actions": [
    {
      "type": "ADD_TASK",
      "payload": {
        "title": "Prepare Q3 Report",
        "priority": "High",
        "status": "New"
      }
    }
  ]
}`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Interactive Live API Tester */}
        {activeTab === "tester" && (
          <div className="space-y-4">
            <div className="bg-[#12161F] border border-[#2D3139] rounded-xl p-4 md:p-5 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-400" />
                  Live API Test Runner
                </h4>
                <p className="text-xs text-[#8B949E] mt-0.5">
                  Send a live request to <code className="text-white font-mono">POST /api/chat</code> right now to verify how n8n will interact with it:
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Enter message (e.g., 'What are my pending tasks?' or 'Create task: Test n8n webhook')"
                    className="flex-1 bg-[#090B0E] border border-[#2D3139] focus:border-[#3B82F6] rounded-lg px-3 py-2 text-xs text-white outline-none font-sans"
                    onKeyDown={(e) => e.key === "Enter" && handleRunTest()}
                  />
                  <button
                    onClick={handleRunTest}
                    disabled={isTesting || !testMessage.trim()}
                    className="px-4 py-2 bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    {isTesting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Send Test Request</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Quick Prompts */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                  <span className="text-[#8B949E]">Quick tests:</span>
                  {[
                    "What are my highest priority tasks?",
                    "Add a new task: Connect n8n webhook",
                    "Complete task 104"
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTestMessage(preset)}
                      className="px-2 py-0.5 rounded bg-[#161B22] border border-[#2D3139] hover:border-blue-500/50 text-[#8B949E] hover:text-white transition-colors cursor-pointer text-[10px]"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Result Preview */}
              {testError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs font-mono">
                  Error: {testError}
                </div>
              )}

              {testResult && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                        HTTP 200 OK
                      </span>
                      {testLatency && (
                        <span className="text-[#8B949E]">Latency: {testLatency}ms</span>
                      )}
                    </div>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(testResult, null, 2), "test-json")}
                      className="text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === "test-json" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === "test-json" ? "Copied" : "Copy Result"}</span>
                    </button>
                  </div>

                  <div className="p-3 bg-[#090B0E] border border-[#2D3139] rounded-lg font-mono text-xs overflow-x-auto max-h-[300px]">
                    <pre className="text-emerald-400 whitespace-pre-wrap">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
