'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass } from '@/components/ui/Modal';
import { listGroups, getMessages, sendMessage, createGroup, createDirectMessage } from '@/actions/chat';
import { listUsers } from '@/actions/auth';
import { useAuth } from '@/context/AuthContext';
import { useSocket, useSocketEvent } from '@/context/SocketContext';
import CallRoom from '@/components/call/CallRoom';
import { Send, Paperclip, Smile, Search, Hash, Lock, Phone, Video, MoreVertical, Users, Shield, Plus, X, Image as ImageIcon, FileAudio, FileVideo, FileText } from 'lucide-react';

export default function ChatPage() {
  const { user } = useAuth();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<{name: string, url: string, type: string} | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastTypingRef = useRef(0);

  // ── Calls ──
  const [callRoomId, setCallRoomId] = useState<string | null>(null);
  const [callWithVideo, setCallWithVideo] = useState(true);
  const [incoming, setIncoming] = useState<{ roomId: string; groupId: string; from: { name: string } } | null>(null);

  const startCall = (withVideo: boolean) => {
    if (!activeGroupId) return;
    setCallWithVideo(withVideo);
    setCallRoomId(`chat:${activeGroupId}`);
  };

  // Someone started a call in a conversation you belong to.
  useSocketEvent('rtc:incoming', (payload: any) => {
    if (!payload?.roomId) return;
    // Ignore if we're already in that call.
    if (callRoomId === payload.roomId) return;
    setIncoming(payload);
  });

  const acceptCall = () => {
    if (!incoming) return;
    setActiveGroupId(incoming.groupId);
    setCallWithVideo(true);
    setCallRoomId(incoming.roomId);
    setIncoming(null);
  };

  const { connected, emit, isOnline } = useSocket();

  // Realtime pushes replace polling. The intervals below are a slow safety net
  // for when the socket is down (e.g. running under `next start`).
  const { data: groups = [], mutate: mutateGroups } = useSWR('chat_groups', listGroups, {
    refreshInterval: connected ? 0 : 5000,
  });

  const { data: messages = [], mutate: mutateMessages } = useSWR(
    activeGroupId ? `chat_messages_${activeGroupId}` : null,
    () => getMessages(activeGroupId!),
    { refreshInterval: connected ? 0 : 3000 }
  );

  // Join/leave the active conversation's room.
  useEffect(() => {
    if (!connected || !activeGroupId) return;
    emit('chat:join', activeGroupId);
    return () => emit('chat:leave', activeGroupId);
  }, [connected, activeGroupId, emit]);

  // A message arrived in the open conversation.
  useSocketEvent('chat:message', (msg: any) => {
    if (!msg || msg.groupId !== activeGroupId) return;
    mutateMessages(
      (current: any[] = []) => {
        if (current.some((m) => m.id === msg.id)) return current;
        // Drop the optimistic placeholder now the real row has arrived.
        return [...current.filter((m) => !String(m.id).startsWith('temp-')), msg];
      },
      { revalidate: false }
    );
  });

  // A message arrived somewhere else — refresh the conversation list.
  useSocketEvent('chat:inbox', () => { mutateGroups(); });

  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  useSocketEvent('chat:typing', ({ groupId, userId, name }: any) => {
    if (groupId !== activeGroupId) return;
    setTypingUsers((prev) => ({ ...prev, [userId]: name }));
    setTimeout(() => {
      setTypingUsers((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 3000);
  });

  // Fetch employees for group creation
  const { data: employees = [] } = useSWR('users', listUsers);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const getGroupDisplayName = (group: any) => {
    if (group?.type === 'direct') {
      const otherMember = group.members.find((m: any) => m.userId !== user?.id);
      return otherMember?.user?.name || 'Direct Message';
    }
    return group?.name || '';
  };

  // Set default active group
  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups, activeGroupId]);

  const activeGroup = groups.find((g: any) => g.id === activeGroupId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // File size limit (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachment({
        name: file.name,
        url: event.target?.result as string,
        type: file.type
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async () => {
    if ((!message.trim() && !attachment) || !activeGroupId) return;
    
    const tempMessage = message;
    const tempAttachment = attachment;
    
    setMessage('');
    setAttachment(null);
    
    // Optimistic update
    mutateMessages([...messages, { 
      id: 'temp-' + Date.now(), 
      content: tempMessage, 
      fileUrl: tempAttachment?.url,
      fileType: tempAttachment?.type,
      senderId: user?.id, 
      sender: { id: user?.id, name: user?.name },
      timestamp: new Date()
    } as any], false);
    
    await sendMessage(activeGroupId, tempMessage, tempAttachment?.url, tempAttachment?.type);
    mutateMessages();
    mutateGroups();
  };

  const handleCreateGroup = async () => {
    if (selectedUserIds.length === 0) return;
    
    let newGroup;
    if (selectedUserIds.length === 1 && !newGroupName.trim()) {
      newGroup = await createDirectMessage(selectedUserIds[0]);
    } else {
      if (!newGroupName.trim()) {
        alert("Group name is required for team chats.");
        return;
      }
      newGroup = await createGroup(newGroupName, selectedUserIds);
    }
    
    setNewGroupName('');
    setSelectedUserIds([]);
    setShowCreateModal(false);
    mutateGroups();
    setActiveGroupId(newGroup.id);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const renderAttachment = (msg: any) => {
    if (!msg.fileUrl) return null;
    
    if (msg.fileType?.startsWith('image/')) {
      return <img src={msg.fileUrl} alt="attachment" className="max-w-xs rounded-lg mt-2 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(msg.fileUrl, '_blank')} />;
    }
    if (msg.fileType?.startsWith('audio/')) {
      return <audio controls src={msg.fileUrl} className="mt-2 w-64 max-w-full" />;
    }
    if (msg.fileType?.startsWith('video/')) {
      return <video controls src={msg.fileUrl} className="max-w-xs rounded-lg mt-2" />;
    }
    return (
      <a href={msg.fileUrl} download="attachment" target="_blank" rel="noreferrer" className="flex items-center gap-2 mt-2 p-2 bg-black/5 rounded-lg hover:bg-black/10 transition-colors">
        <FileText size={16} />
        <span className="text-sm underline">Download File</span>
      </a>
    );
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-6 bg-surface-primary">
      {/* Channel List */}
      <div className="w-80 border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Messages</h2>
            <button onClick={() => setShowCreateModal(true)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer" title="New Group">
              <Plus size={16} className="text-gray-600" />
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-gray-400 transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {groups.map((group: any) => {
            const lastMsg = group.messages[0];
            return (
              <button
                key={group.id}
                onClick={() => setActiveGroupId(group.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-all cursor-pointer border-b border-gray-100 ${activeGroupId === group.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50 border-l-2 border-l-transparent'}`}
              >
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 border border-gray-200">
                  {group.type === 'direct' ? <Avatar name={getGroupDisplayName(group)} size="sm" /> : group.type === 'department' ? <Hash size={18} className="text-gray-500" /> : <Users size={18} className="text-gray-500" />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{getGroupDisplayName(group)}</span>
                    {lastMsg && (
                      <span className="text-[10px] text-gray-500 ml-2 flex-shrink-0">
                        {new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-gray-500 truncate">{lastMsg?.fileUrl ? 'Sent a file' : (lastMsg?.content || 'No messages yet')}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {groups.length === 0 && (
            <div className="p-6 text-center text-gray-500 text-sm">No groups yet. Create one to start chatting!</div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeGroup ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Lock size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Select a group to start messaging</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gray-50/50 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-gray-200">
                  {activeGroup.type === 'direct' ? <Avatar name={getGroupDisplayName(activeGroup)} size="sm" /> : activeGroup.type === 'department' ? <Hash size={18} className="text-gray-500" /> : <Users size={18} className="text-gray-500" />}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{getGroupDisplayName(activeGroup)}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {activeGroup.type === 'direct'
                        ? (activeGroup.members.some((m: any) => m.userId !== user?.id && isOnline(m.userId)) ? 'Online' : 'Offline')
                        : `${activeGroup.members.length} members`}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <span className={`text-[10px] ${connected ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {connected ? 'Live' : 'Reconnecting…'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startCall(false)}
                  disabled={!connected}
                  title={connected ? 'Start an audio call' : 'Realtime unavailable'}
                  className="p-2 rounded-xl hover:bg-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Phone size={18} className="text-gray-500" />
                </button>
                <button
                  onClick={() => startCall(true)}
                  disabled={!connected}
                  title={connected ? 'Start a video call' : 'Realtime unavailable'}
                  className="p-2 rounded-xl hover:bg-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Video size={18} className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Lock size={40} className="mb-3 opacity-30" />
                  <p className="text-sm">Messages are end-to-end encrypted</p>
                  <p className="text-xs mt-1">Start a conversation</p>
                </div>
              )}
              {messages.map((msg: any, i: number) => {
                const isOwn = msg.senderId === user?.id;
                const showAvatar = i === 0 || messages[i - 1]?.senderId !== msg.senderId;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
                  >
                    {showAvatar ? (
                      <Avatar name={msg.sender?.name || 'Unknown'} size="sm" />
                    ) : (
                      <div className="w-8 flex-shrink-0" />
                    )}
                    <div className={`max-w-[70%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                      {showAvatar && (
                        <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                          <span className="text-xs font-medium">{msg.sender?.name || 'Unknown'}</span>
                          <span className="text-[10px] text-gray-500">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm ${isOwn ? 'bg-gray-900 text-white rounded-tr-md' : 'bg-white text-gray-900 rounded-tl-md border border-gray-100 shadow-sm'}`}>
                        {msg.content && <p>{msg.content}</p>}
                        {renderAttachment(msg)}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50 backdrop-blur-xl flex flex-col">
              {Object.keys(typingUsers).length > 0 && (
                <p className="text-xs text-gray-500 mb-2 italic">
                  {Object.values(typingUsers).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing…
                </p>
              )}
              {attachment && (
                <div className="mb-2 p-2 bg-gray-100 rounded-lg flex items-center justify-between w-max border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    {attachment.type.startsWith('image/') ? <ImageIcon size={14} className="text-gray-500" /> : attachment.type.startsWith('audio/') ? <FileAudio size={14} className="text-gray-500" /> : attachment.type.startsWith('video/') ? <FileVideo size={14} className="text-gray-500" /> : <FileText size={14} className="text-gray-500" />}
                    <span className="text-xs font-medium text-gray-700 max-w-[150px] truncate">{attachment.name}</span>
                  </div>
                  <button onClick={() => setAttachment(null)} className="ml-3 p-1 hover:bg-gray-200 rounded-full text-gray-500">
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <label className="p-2 rounded-xl hover:bg-white transition-all cursor-pointer">
                  <input type="file" className="hidden" accept="image/*, audio/*, video/*" onChange={handleFileUpload} />
                  <Paperclip size={18} className="text-gray-500" />
                </label>
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      const now = Date.now();
                      if (activeGroupId && connected && now - lastTypingRef.current > 2000) {
                        lastTypingRef.current = now;
                        emit('chat:typing', activeGroupId);
                      }
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..."
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-gray-400 transition-all"
                  />
                </div>
                <button className="p-2 rounded-xl hover:bg-white transition-all cursor-pointer"><Smile size={18} className="text-gray-500" /></button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendMessage}
                  disabled={!message.trim() && !attachment}
                  className="p-2.5 rounded-xl bg-gray-900 cursor-pointer shadow-lg disabled:opacity-50"
                >
                  <Send size={18} className="text-white" />
                </motion.button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Incoming call */}
      {incoming && (
        <div className="fixed bottom-6 right-6 z-[90] w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={incoming.from?.name ?? 'Someone'} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {incoming.from?.name ?? 'Someone'}
              </p>
              <p className="text-xs text-gray-500">Incoming call…</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" fullWidth onClick={acceptCall}>Join</Button>
            <Button size="sm" variant="secondary" fullWidth onClick={() => setIncoming(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      <CallRoom
        roomId={callRoomId}
        video={callWithVideo}
        title={activeGroup ? getGroupDisplayName(activeGroup) : 'Call'}
        open={!!callRoomId}
        onClose={() => setCallRoomId(null)}
      />

      {/* Create Group Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="New Message"
        description="Select members to add to the new team conversation or direct message."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={selectedUserIds.length === 0}>Start Chat</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Group Name (Optional for Direct Messages)">
            <input 
              type="text" 
              className={inputClass} 
              placeholder="e.g. Engineering Team" 
              value={newGroupName} 
              onChange={e => setNewGroupName(e.target.value)} 
            />
          </FormField>
          
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Select Members</p>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
              {employees.filter((e: any) => e.email !== user?.email).map((emp: any) => (
                <label key={emp.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedUserIds.includes(emp.id)} 
                    onChange={() => toggleUserSelection(emp.id)} 
                    className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <Avatar name={emp.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-500">{emp.designation}</p>
                  </div>
                </label>
              ))}
              {employees.length <= 1 && (
                <div className="p-4 text-center text-sm text-gray-500">No other employees available to add.</div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
