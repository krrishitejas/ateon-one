'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import { Sparkles, Send, Bot, User, Search, BookOpen, Lightbulb, BarChart3, FileText, Zap } from 'lucide-react';

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const suggestedQueries = [
  { icon: <BarChart3 size={16} />, label: 'Revenue forecast for Q3', category: 'Analytics' },
  { icon: <BookOpen size={16} />, label: 'Summarize leave policy', category: 'Knowledge Base' },
  { icon: <Lightbulb size={16} />, label: 'Suggest task priorities', category: 'Productivity' },
  { icon: <FileText size={16} />, label: 'Generate monthly report', category: 'Reports' },
  { icon: <Search size={16} />, label: 'Find NDA template', category: 'Legal' },
  { icon: <Zap size={16} />, label: 'Team utilization insights', category: 'Operations' },
];

import { askAIAssistant } from '@/actions/ai';

export default function AIPage() {
  const [messages, setMessages] = useState<AIMessage[]>([
    { id: '1', role: 'assistant', content: "I'm ATEON AI, your enterprise knowledge assistant. I can help with:\n\n- 📊 Analytics & Forecasting\n- 📋 Policy Search\n- 🎯 Task Recommendations\n- 📄 Report Generation\n- 🔍 Knowledge Base\n\nHow can I help you today?", timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isTyping]);

  const handleSend = async (query?: string) => {
    const text = query || input;
    if (!text.trim()) return;

    const userMsg: AIMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await askAIAssistant(text);
      const assistantMsg: AIMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: response, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const assistantMsg: AIMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: 'An error occurred while connecting to the knowledge base.', timestamp: new Date() };
      setMessages(prev => [...prev, assistantMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-6">
      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/50 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">ATEON AI Assistant</h2>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-gray-500">Powered by enterprise knowledge graph</span>
              </div>
            </div>
          </div>
          <Badge variant="purple" size="sm" dot>AI Beta</Badge>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {msg.role === 'assistant' ? (
                <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                  <Bot size={16} className="text-white" />
                </div>
              ) : (
                <Avatar name="Rohan Gupta" size="sm" />
              )}
              <div className={`max-w-[75%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                <div className={`px-4 py-3 rounded-2xl text-sm whitespace-pre-line ${msg.role === 'user' ? 'bg-brand-500/20 text-gray-900 rounded-tr-md' : 'bg-white text-gray-900 rounded-tl-md'}`}>
                  {msg.content}
                </div>
                <span className="text-[10px] text-gray-500 mt-1 inline-block">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </motion.div>
          ))}
          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-white" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-white rounded-tl-md">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Queries */}
        {messages.length <= 1 && (
          <div className="px-6 pb-2">
            <p className="text-xs text-gray-500 mb-2">Suggested queries</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {suggestedQueries.map(q => (
                <button
                  key={q.label}
                  onClick={() => handleSend(q.label)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-brand-400/30 transition-all cursor-pointer text-left"
                >
                  <span className="text-gray-500">{q.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{q.label}</p>
                    <p className="text-[10px] text-gray-500">{q.category}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask ATEON AI anything..."
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-brand-400/50 transition-all"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSend()}
              className="p-3 rounded-xl bg-gray-900 cursor-pointer shadow-lg shadow-brand-500/20"
            >
              <Send size={18} className="text-white" />
            </motion.button>
          </div>
          <p className="text-[10px] text-gray-500 text-center mt-2">
            ATEON AI uses your enterprise knowledge base. Responses are contextual to your organization.
          </p>
        </div>
      </div>
    </div>
  );
}
