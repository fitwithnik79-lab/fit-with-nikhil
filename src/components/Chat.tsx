import { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Message, UserProfile, MessageTemplate } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { triggerPushNotification } from '../lib/notifications';
import { Send, MessageSquare, Bell, Sparkles, X, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn, getAvatarUrl } from '../lib/utils';

interface ChatProps {
  currentUser: { uid: string; role: string };
  otherUser: UserProfile;
  onClose?: () => void;
}

export default function Chat({ currentUser, otherUser, onClose }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch specialized templates if admin
  useEffect(() => {
    if (currentUser.role !== 'admin') return;
    const q = query(collection(db, 'messageTemplates'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as MessageTemplate));
    });
    return () => unsubscribe();
  }, [currentUser.role]);

  useEffect(() => {
    const q = query(
      collection(db, 'messages'),
      where('senderId', 'in', [currentUser.uid, otherUser.uid]),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Message))
        .filter(m => 
          (m.senderId === currentUser.uid && m.receiverId === otherUser.uid) ||
          (m.senderId === otherUser.uid && m.receiverId === currentUser.uid)
        )
        .sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
          return timeA - timeB;
        });
      setMessages(msgs);
      setLoading(false);
      
      // Mark received messages as read
      snapshot.docs.forEach(d => {
        const data = d.data();
        if (data.receiverId === currentUser.uid && data.senderId === otherUser.uid && !data.isRead) {
          updateDoc(doc(db, 'messages', d.id), { isRead: true }).catch(() => {});
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });

    return () => unsubscribe();
  }, [currentUser.uid, otherUser.uid]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  const sendMessage = async (textOverride?: string, type: 'chat' | 'motivation' | 'reminder' | 'general' = 'chat') => {
    const text = textOverride || newMessage;
    if (!text.trim()) return;

    if (!textOverride) setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        senderId: currentUser.uid,
        receiverId: otherUser.uid,
        participants: [currentUser.uid, otherUser.uid],
        text,
        type,
        isRead: false,
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'messages'));

      if (currentUser.role === 'admin') {
        const title = `Message from Coach Nik`;
        triggerPushNotification(otherUser.uid, title, text, { type: 'chat', senderId: currentUser.uid });
      } else if (otherUser.role === 'admin') {
        const title = `New message from ${currentUser.uid === otherUser.uid ? 'Client' : 'Client'}`;
        triggerPushNotification(otherUser.uid, `Message from client`, text, { type: 'chat', senderId: currentUser.uid });
      }

    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const useTemplate = (template: MessageTemplate) => {
    sendMessage(template.content, template.category);
    setShowTemplates(false);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center font-bold text-white shadow-lg shadow-zinc-800/20">
            <img 
              src={getAvatarUrl(otherUser.email, otherUser.gender, otherUser.photoURL)} 
              alt={otherUser.displayName}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h3 className="font-bold text-sm">{otherUser.displayName || 'Chat'}</h3>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
              {otherUser.role === 'admin' ? 'Coach' : 'Client'}
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 space-y-2">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn(
                  "flex flex-col max-w-[80%]",
                  isMe ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div className={cn(
                  "px-4 py-2 rounded-2xl text-sm shadow-sm",
                  isMe 
                    ? "bg-orange-500 text-white rounded-tr-none" 
                    : msg.type === 'motivation' 
                      ? "bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-tl-none"
                      : msg.type === 'reminder'
                        ? "bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-tl-none"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none"
                )}>
                  {msg.type !== 'chat' && (
                    <div className="flex items-center gap-1.5 mb-1 opacity-70">
                      {msg.type === 'motivation' ? <Sparkles className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {msg.type}
                      </span>
                    </div>
                  )}
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
                <span className="text-[9px] text-zinc-600 mt-1 font-bold uppercase">
                  {msg.createdAt ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}
                </span>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="flex items-center gap-2">
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-orange-500 transition-all"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!newMessage.trim()}
            className="p-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/20"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        {currentUser.role === 'admin' && (
          <div className="space-y-2 mt-3">
            <div className="relative">
              <AnimatePresence>
                {showTemplates && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-[300px] flex flex-col"
                  >
                    <div className="p-3 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Select Template</span>
                      <button onClick={() => setShowTemplates(false)} className="text-zinc-500 hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="overflow-y-auto custom-scrollbar p-2 space-y-2">
                      {templates.map(t => (
                        <button
                          key={t.id}
                          onClick={() => useTemplate(t)}
                          className="w-full text-left p-3 rounded-xl bg-zinc-950 border border-white/5 hover:border-orange-500/50 transition-all group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 italic">{t.title}</span>
                            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded border border-white/5">{t.category}</span>
                          </div>
                          <p className="text-xs text-zinc-400 group-hover:text-zinc-300 line-clamp-2 italic">"{t.content}"</p>
                        </button>
                      ))}
                      {templates.length === 0 && (
                        <div className="p-8 text-center text-zinc-600">
                          <p className="text-xs italic">No templates available. Create some in the dashboard.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="w-full flex items-center justify-between px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-all group"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-orange-500" />
                  Quick Templates
                </div>
                {showTemplates ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => sendMessage(undefined, 'motivation')}
                disabled={!newMessage.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg text-[10px] font-bold uppercase hover:bg-purple-500/20 transition-all"
              >
                <Sparkles className="w-3 h-3" />
                Motivation
              </button>
              <button
                onClick={() => sendMessage(undefined, 'reminder')}
                disabled={!newMessage.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-[10px] font-bold uppercase hover:bg-blue-500/20 transition-all"
              >
                <Bell className="w-3 h-3" />
                Reminder
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
