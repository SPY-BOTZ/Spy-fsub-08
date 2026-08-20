/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Copy, Check, Terminal, FileCode2, Package, Rocket, Activity, BookOpen } from "lucide-react";
import { botCode, reqCode, deployGuide, readmeCode } from "./data";
import Markdown from "react-markdown";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Tab = "readme" | "main" | "req" | "deploy" | "dashboard";

const chartData = [
  { name: "Mon", messages: 1200, referrals: 15 },
  { name: "Tue", messages: 2100, referrals: 38 },
  { name: "Wed", messages: 1800, referrals: 22 },
  { name: "Thu", messages: 3200, referrals: 54 },
  { name: "Fri", messages: 2500, referrals: 41 },
  { name: "Sat", messages: 4300, referrals: 89 },
  { name: "Sun", messages: 3800, referrals: 76 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("readme");
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentContent = 
    activeTab === "readme" ? readmeCode :
    activeTab === "main" ? botCode : 
    activeTab === "req" ? reqCode : 
    deployGuide;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center gap-3 text-emerald-400 mb-2">
            <Terminal size={32} />
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Telegram Group Bot</h1>
          </div>
          <p className="text-slate-400 text-lg max-w-2xl leading-relaxed">
            Your production-ready Python Telegram bot script is generated. 
            It includes Pyrogram for efficient group tracking, SQLite for persistent storage, 
            and a built-in health-check server for Koyeb deployment.
          </p>
        </header>

        {/* Workspace */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
          
          {/* Sidebar Tabs */}
          <div className="w-full md:w-64 bg-slate-900/50 border-b md:border-b-0 md:border-r border-slate-800 p-4 space-y-2 flex flex-row md:flex-col overflow-x-auto">
            <button
              onClick={() => setActiveTab("readme")}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "readme" 
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <BookOpen size={18} />
              README.md
            </button>
            <button
              onClick={() => setActiveTab("main")}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "main" 
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <FileCode2 size={18} />
              main.py
            </button>
            <button
              onClick={() => setActiveTab("req")}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "req" 
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Package size={18} />
              requirements.txt
            </button>
            <button
              onClick={() => setActiveTab("deploy")}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "deploy" 
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Rocket size={18} />
              Deployment Guide
            </button>
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "dashboard" 
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Activity size={18} />
              Demo Dashboard
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0 flex flex-col h-[600px] md:h-[700px] relative bg-[#0d1117]">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm sticky top-0">
              <span className="text-sm font-mono text-slate-400">
                {activeTab === "readme" && "README.md"}
                {activeTab === "main" && "main.py"}
                {activeTab === "req" && "requirements.txt"}
                {activeTab === "deploy" && "Deployment Instructions"}
                {activeTab === "dashboard" && "Activity Visualization"}
              </span>
              {activeTab !== "dashboard" && (
                <button
                  onClick={() => handleCopy(currentContent)}
                  className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy code"}
                </button>
              )}
            </div>
            
            {/* Code/Markdown Scroll Area */}
            <div className="flex-1 overflow-auto p-4 md:p-6 custom-scrollbar">
              {activeTab === "dashboard" ? (
                <div className="flex flex-col h-full space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-white">7-Day Group Activity</h2>
                    <p className="text-sm text-slate-400">Simulated visualization of daily message volume and new referral joins.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                      <div className="text-slate-400 text-sm font-medium mb-1">Total Messages</div>
                      <div className="text-3xl font-bold text-white">18,900</div>
                      <div className="text-emerald-400 text-xs mt-2 font-medium">+12% from last week</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                      <div className="text-slate-400 text-sm font-medium mb-1">Successful Referrals</div>
                      <div className="text-3xl font-bold text-white">335</div>
                      <div className="text-emerald-400 text-xs mt-2 font-medium">+28% from last week</div>
                    </div>
                  </div>

                  <div className="flex-1 min-h-[300px] w-full bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 pt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorReferrals" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val / 1000}k`} />
                        <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
                          itemStyle={{ color: '#f8fafc' }}
                        />
                        <Area yAxisId="left" type="monotone" dataKey="messages" name="Messages" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#colorMessages)" />
                        <Area yAxisId="right" type="monotone" dataKey="referrals" name="Referrals" stroke="#60a5fa" strokeWidth={2} fillOpacity={1} fill="url(#colorReferrals)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : activeTab === "deploy" || activeTab === "readme" ? (
                <div className="prose prose-invert prose-emerald max-w-none prose-h4:text-slate-200 prose-p:text-slate-300 prose-li:text-slate-300 prose-code:text-emerald-300 prose-code:bg-emerald-950/30 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
                  <Markdown>{currentContent}</Markdown>
                </div>
              ) : (
                <pre className="text-[13px] md:text-[14px] leading-relaxed font-mono text-slate-300 whitespace-pre-wrap">
                  <code>{currentContent}</code>
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
