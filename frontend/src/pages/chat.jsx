
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./chat.css";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDoc, getDocs, setDoc, orderBy } from "firebase/firestore";
import * as Icons from "../components/Icons";
import EmojiPicker from 'emoji-picker-react';
import { ToastConfig } from "../components/ToastConfig";
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from "framer-motion";
import { useContext } from "react";
import { CallContext } from "../context/CallContext";
import { io } from "socket.io-client";

const socket = io.connect("http://localhost:5000");

// Helper to normalize phone numbers for comparison
const normalizePhone = (phone) => {
  if (!phone) return "";
  const cleaned = phone.toString().replace(/\D/g, "");
  return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned; // Use last 10 digits as the standard
};

const isPhoneMatch = (p1, p2) => {
  const n1 = normalizePhone(p1);
  const n2 = normalizePhone(p2);
  return n1 && n2 && n1 === n2;
};

// Debug logs
socket.on("connect", () => console.log("Socket connected:", socket.id));
socket.on("connect_error", (err) => console.error("Socket error:", err.message));

// Helper: Group messages by date
const groupMessagesByDate = (messages) => {
  const groups = [];
  let currentDate = null;

  messages.forEach((msg) => {
    const msgDate = msg.createdAt ? new Date(msg.createdAt.seconds * 1000) : new Date();
    const dateKey = msgDate.toDateString();

    if (dateKey !== currentDate) {
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();

      let label;
      if (dateKey === today) label = "Today";
      else if (dateKey === yesterday) label = "Yesterday";
      else label = msgDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      groups.push({ type: 'date', label });
      currentDate = dateKey;
    }

    groups.push({ type: 'message', data: msg });
  });

  return groups;
};

const Chat = () => {
  const rawPhone = localStorage.getItem("phone");
  const currentPhone = normalizePhone(rawPhone);
  const navigate = useNavigate();
  const [chats, setChats] = useState(() => {
    try {
      const normalized = normalizePhone(rawPhone);
      const saved = localStorage.getItem(`chats_${normalized}`);
      let chatList = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(chatList)) chatList = [];

      // Map wallpapers for persistence
      return chatList.map(c => ({
        ...c,
        wallpaper: localStorage.getItem(`wallpaper_${normalized}_${c?.id}`) || null
      }));
    } catch (e) {
      console.error("Chats initialization error:", e);
      return [];
    }
  });
  const [messages, setMessages] = useState(() => {
    try {
      if (db) return {};
      const normalized = normalizePhone(rawPhone);
      const saved = localStorage.getItem(`messages_${normalized}`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Messages initialization error:", e);
      return {};
    }
  });
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  // Advanced Features
  const [searchQuery, setSearchQuery] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState("online");

  // Call Context
  const {
    startCall,
    endCall,
    answerCall,
    call,
    incomingCall,
    callLogs,
    isCurrentCallVideo,
    myVideoRef,
    remoteVideoRef
  } = useContext(CallContext);

  // New Features
  const [callStatus, setCallStatus] = useState(null);
  const [view, setView] = useState("chat-list"); // 'chat-list', 'profile', 'multi-select'
  const [typingUsers, setTypingUsers] = useState({}); // { [phone]: boolean }
  const typingTimeoutRef = useRef({});
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const saved = localStorage.getItem(`profile_${currentPhone}`);
      return saved ? JSON.parse(saved) : { name: currentPhone || "User", status: "Available", avatar: "ME", avatarImage: null };
    } catch (e) {
      console.error("Profile initialization error:", e);
      return { name: currentPhone || "User", status: "Available", avatar: "ME", avatarImage: null };
    }
  });
  // Edit State
  const [editName, setEditName] = useState("");
  const [editAbout, setEditAbout] = useState("");
  const [tempProfileImage, setTempProfileImage] = useState(null);

  const [showContactInfo, setShowContactInfo] = useState(false);

  // Selection Mode State
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);

  // Mass Message State
  const [multiSelectedIds, setMultiSelectedIds] = useState([]);
  const [showMassMessageCompose, setShowMassMessageCompose] = useState(false);
  const [massMessageInput, setMassMessageInput] = useState("");

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const profilePicInputRef = useRef(null);
  const statusInputRef = useRef(null);
  const wallpaperInputRef = useRef(null);

  // Auth & Storage Key
  const [dataLoaded, setDataLoaded] = useState(false);

  // Authority (Password) State
  const [lockPassword, setLockPassword] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false); // Added missing state
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [errorPassword, setErrorPassword] = useState("");
  const [pendingLockId, setPendingLockId] = useState(null);

  // Status State
  const [statusList, setStatusList] = useState([
    { id: 'me', name: 'My Status', time: 'Tap to add status update', avatar: 'P', isMe: true, avatarImage: null },
    { id: 1, name: 'Aman', phone: '9876543210', time: 'Just now', avatar: 'A', viewed: false, avatarImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100' },
    { id: 2, name: 'Sagar', phone: '8888888888', time: '12 minutes ago', avatar: 'S', viewed: false, avatarImage: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100' },
    { id: 3, name: 'Neha', phone: '7777777777', time: '1 hour ago', avatar: 'N', viewed: false, avatarImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100' },
    { id: 4, name: 'Rohan', phone: '9999999999', time: 'Yesterday', avatar: 'R', viewed: true, avatarImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100' },
  ]);
  const [activeViewingStatus, setActiveViewingStatus] = useState(null);

  // Text Status State
  const [isWritingTextStatus, setIsWritingTextStatus] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [statusBg, setStatusBg] = useState("#663399"); // Initial purple
  const statusBgs = ["#663399", "#2196F3", "#F44336", "#4CAF50", "#FFC107", "#00BCD4", "#E91E63", "#607D8B"];

  // Status Preview State
  const [statusPreviewImage, setStatusPreviewImage] = useState(null);
  const [statusCaption, setStatusCaption] = useState("");

  // Mood Sync State
  const MOOD_OPTIONS = [
    { id: 'happy', label: 'Happy', icon: '😊', color: '#FFD700' },
    { id: 'busy', label: 'Busy', icon: '⛔', color: '#F44336' },
    { id: 'coding', label: 'Coding', icon: '💻', color: '#2196F3' },
    { id: 'sick', label: 'Sick', icon: '🤒', color: '#9E9E9E' },
    { id: 'vibe', label: 'Vibe', icon: '✨', color: '#E91E63' },
    { id: 'none', label: 'None', icon: '', color: 'transparent' }
  ];
  const [userMoods, setUserMoods] = useState({}); // { [phone]: moodObj }

  // Community State
  const [communityList, setCommunityList] = useState([
    { id: 1, name: 'Tech Community', last: 'Announcements: New project start!', time: '12:30', avatar: 'TC', groups: ['React Devs', 'Design Squad'] },
    { id: 2, name: 'Office Hub', last: 'Lunch is ready!', time: '1:45', avatar: 'OH', groups: ['General', 'HR Updates'] },
  ]);

  // Settings State
  const [securityNotifications, setSecurityNotifications] = useState(() => localStorage.getItem(`sec_notif_${currentPhone}`) === 'true');
  const [readReceipts, setReadReceipts] = useState(() => localStorage.getItem(`read_receipts_${currentPhone}`) !== 'false'); // Default true
  const [enterIsSend, setEnterIsSend] = useState(() => localStorage.getItem(`enter_send_${currentPhone}`) === 'true');
  const [conversationTones, setConversationTones] = useState(() => localStorage.getItem(`conv_tones_${currentPhone}`) !== 'false'); // Default true

  // Reply UI State
  const [replyingTo, setReplyingTo] = useState(null);

  // Scheduler State
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedulerInput, setSchedulerInput] = useState({ date: "", time: "" });

  // Wallpapers State
  const wallpaperColors = [
    "#efeae2", "#e3f2fd", "#fce4ec", "#f1f8e9", "#fff3e0",
    "#e8eaf6", "#f3e5f5", "#efebe9", "#212121", "#333333"
  ];

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Initial Sync & Setup ---
  useEffect(() => {
    if (!currentPhone) {
      navigate('/Personal');
      return;
    }

    const syncUser = async () => {
      console.log("Syncing User for:", currentPhone);
      if (!db) {
        const saved = localStorage.getItem(`profile_${currentPhone}`);
        if (saved) {
          try {
            const data = JSON.parse(saved);
            setUserProfile(data);
            setEditName(data.name);
            setEditAbout(data.status);
          } catch (e) { console.error(e); }
        }
        setDataLoaded(true);
        return;
      }
      try {
        const userRef = doc(db, "users", currentPhone);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            name: userProfile.name || "User",
            status: userProfile.status || "Available",
            phone: currentPhone,
            avatar: (userProfile.name || "U")[0].toUpperCase(),
            avatarImage: userProfile.avatarImage || null,
            createdAt: serverTimestamp()
          });
        } else {
          const data = userSnap.data();
          setUserProfile(data);
          setEditName(data.name);
          setEditAbout(data.status);
        }
      } catch (err) {
        console.error("Firestore User Sync Error:", err);
      } finally {
        setDataLoaded(true);
      }
    };
    syncUser();

    let unsubscribeChats;
    if (db) {
      console.log("Querying Chats for:", currentPhone);
      const q = query(
        collection(db, "chats"),
        where("participants", "array-contains", currentPhone),
        orderBy("timestamp", "desc")
      );
      unsubscribeChats = onSnapshot(q, (snapshot) => {
        const chatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setChats(chatList);
      }, (err) => console.error("Chats error:", err));
    }

    const savedTheme = localStorage.getItem(`theme_${currentPhone}`);
    if (savedTheme === "dark") setDarkMode(true);

    return () => {
      if (typeof unsubscribeChats === 'function') unsubscribeChats();
    };
  }, [currentPhone, navigate, db]); // Removed chats, messages, dataLoaded from deps

  // --- Persistence Side Effect ---
  useEffect(() => {
    if (dataLoaded && currentPhone) {
      localStorage.setItem(`chats_${currentPhone}`, JSON.stringify(chats));
      localStorage.setItem(`messages_${currentPhone}`, JSON.stringify(messages));
    }
  }, [chats, messages, dataLoaded, currentPhone]);

  // --- Listen to Statuses ---
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "statuses"), orderBy("timestamp", "desc"));
    const unsubscribeStatus = onSnapshot(q, (snapshot) => {
      const allStatuses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        time: doc.data().timestamp ? new Date(doc.data().timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently"
      }));

      // Merge with default/me status
      setStatusList(prev => {
        const myStatus = prev.find(s => s.isMe) || { id: 'me', name: 'My Status', time: 'Tap to add status update', avatar: 'P', isMe: true, avatarImage: null };
        const myFirestoreStatus = allStatuses.find(s => isPhoneMatch(s.phone, currentPhone));

        const finalMe = myFirestoreStatus ? {
          ...myStatus,
          time: `Just now (${myFirestoreStatus.time})`,
          isText: myFirestoreStatus.isText,
          text: myFirestoreStatus.text,
          bg: myFirestoreStatus.bg,
          avatarImage: myFirestoreStatus.avatarImage
        } : myStatus;

        const otherStatuses = allStatuses.filter(s => !isPhoneMatch(s.phone, currentPhone)).map(s => ({
          id: s.id,
          name: s.name || s.phone,
          phone: s.phone,
          time: s.time,
          avatar: (s.name || s.phone)[0].toUpperCase(),
          viewed: false,
          avatarImage: s.avatarImage,
          isText: s.isText,
          text: s.text,
          bg: s.bg
        }));

        return [finalMe, ...otherStatuses];
      });
    });
    return () => unsubscribeStatus();
  }, [currentPhone, db]);

  // --- Listen to Messages ---
  useEffect(() => {
    if (!activeChatId) return;

    if (!db) return; // Safeguard

    const q = query(
      collection(db, "chats", activeChatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          time: data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "just now",
          type: data.senderId === currentPhone ? "sent" : "received"
        };
      });
      setMessages(prev => ({
        ...prev,
        [activeChatId]: msgs
      }));
    });

    return () => unsubscribeMessages();
  }, [activeChatId, currentPhone, db]);

  // --- Scheduled Messages Timer ---
  useEffect(() => {
    const checkScheduledMessages = () => {
      const now = Date.now();
      let hasUpdates = false;
      const updatedMessages = {};

      Object.entries(messages).forEach(([chatId, msgs]) => {
        let chatUpdated = false;
        const newMsgs = msgs.map(msg => {
          if (msg.status === 'pending' && msg.scheduledTime && now >= msg.scheduledTime) {
            chatUpdated = true;
            hasUpdates = true;
            if (conversationTones) {
              const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
              audio.play().catch(e => console.log("Audio play failed", e));
            }
            return { ...msg, status: 'sent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
          }
          return msg;
        });
        if (chatUpdated) updatedMessages[chatId] = newMsgs;
      });

      if (hasUpdates) {
        setMessages(prev => ({ ...prev, ...updatedMessages }));
      }
    };
    const interval = setInterval(checkScheduledMessages, 5000);
    return () => clearInterval(interval);
  }, [messages, conversationTones]);

  // Persistence (Per User)
  useEffect(() => {
    if (!currentPhone || !dataLoaded) return;
    localStorage.setItem(`theme_${currentPhone}`, darkMode ? "dark" : "light");
    if (lockPassword) localStorage.setItem(`lockPassword_${currentPhone}`, lockPassword);

    // Persist Settings
    localStorage.setItem(`sec_notif_${currentPhone}`, securityNotifications);
    localStorage.setItem(`read_receipts_${currentPhone}`, readReceipts);
    localStorage.setItem(`enter_send_${currentPhone}`, enterIsSend);
    localStorage.setItem(`conv_tones_${currentPhone}`, conversationTones);
  }, [darkMode, currentPhone, dataLoaded, lockPassword, securityNotifications, readReceipts, enterIsSend, conversationTones]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChatId, showEmojiPicker]);

  // Handle Typing Emission
  useEffect(() => {
    if (!activeChatId || !input.trim()) {
      if (activeChatId) {
        const targetChat = chats.find(c => c.id === activeChatId);
        if (targetChat?.phone) {
          socket.emit("stop_typing", { senderId: currentPhone, receiverId: targetChat.phone });
        }
      }
      return;
    }

    const targetChat = chats.find(c => c.id === activeChatId);
    if (!targetChat?.phone) return;

    socket.emit("typing", { senderId: currentPhone, receiverId: targetChat.phone });

    // Auto-stop typing after 3 seconds of inactivity
    const timeoutId = setTimeout(() => {
      socket.emit("stop_typing", { senderId: currentPhone, receiverId: targetChat.phone });
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [input, activeChatId, currentPhone, chats]);




  useEffect(() => {
    const handleReceiveMessage = (data) => {
      console.log("Message received via socket:", data);
      const { chatId, ...msg } = data;

      if (isPhoneMatch(msg.senderId, currentPhone)) return;
      if (msg.receiverId && !isPhoneMatch(msg.receiverId, currentPhone)) return;

      // Calculate target chat ID by checking the latest chats state snapshot
      setChats(prevChats => {
        const matchingChat = prevChats.find(c =>
          isPhoneMatch(c.phone, msg.senderId) || c.participants?.some(p => isPhoneMatch(p, msg.senderId))
        );

        const targetId = matchingChat ? matchingChat.id : `chat_${normalizePhone(msg.senderId)}`;

        // Update messages using THIS targetId immediately in a separate update
        setMessages(prevMsgs => {
          const list = prevMsgs[targetId] || [];
          if (list.some(m => m.id === msg.id)) return prevMsgs;
          return { ...prevMsgs, [targetId]: [...list, { ...msg, type: 'received' }] };
        });

        if (matchingChat) {
          return prevChats.map(c =>
            c.id === matchingChat.id
              ? { ...c, last: msg.text, timestamp: Date.now(), unread: (String(c.id) !== String(activeChatId) ? (c.unread || 0) + 1 : 0) }
              : c
          );
        } else {
          const newChat = {
            id: targetId,
            name: msg.senderName || msg.senderId,
            participants: [currentPhone, msg.senderId],
            last: msg.text,
            timestamp: Date.now(),
            avatar: (msg.senderName || msg.senderId)[0].toUpperCase(),
            phone: msg.senderId,
            about: "Hey there! I am using WhatsApp.",
            pinned: false, muted: false, unread: 1, archived: false, locked: false
          };
          return [newChat, ...prevChats];
        }
      });
    };

    const handleUserTyping = (data) => {
      if (isPhoneMatch(data.receiverId, currentPhone)) {
        setTypingUsers(prev => ({ ...prev, [normalizePhone(data.senderId)]: true }));
      }
    };

    const handleMoodChanged = (data) => {
      console.log("Mood changed for user:", data.phone, data.mood);
      setUserMoods(prev => ({ ...prev, [normalizePhone(data.phone)]: data }));
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("user_typing", handleUserTyping);
    socket.on("user_stop_typing", (data) => {
      if (isPhoneMatch(data.receiverId, currentPhone)) {
        setTypingUsers(prev => ({ ...prev, [normalizePhone(data.senderId)]: false }));
      }
    });
    socket.on("mood_changed", handleMoodChanged);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("user_typing", handleUserTyping);
      socket.off("user_stop_typing", (data) => {
        if (isPhoneMatch(data.receiverId, currentPhone)) {
          setTypingUsers(prev => ({ ...prev, [normalizePhone(data.senderId)]: false }));
        }
      }); // Note: This off call might not correctly remove the anonymous function listener.
      socket.off("mood_changed", handleMoodChanged);
    };
  }, [activeChatId, currentPhone]); // Only depend on IDs needed for logic


  const getTime = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const renderAvatar = (chat) => {
    if (!chat) return <div className="group-avatar-bg"><Icons.DefaultAvatar /></div>;
    if (chat.isGroup) return <div className="group-avatar-bg"><Icons.Users /></div>;
    // Handle potential corrupted state from localStorage where avatar was saved as an object
    if (typeof chat.avatar === 'object' && chat.avatar !== null) return <div className="group-avatar-bg"><Icons.Users /></div>;
    return chat.avatar || <Icons.DefaultAvatar />;
  };

  const handleSendMessage = async (content = input, type = "text", targetChatId = activeChatId, scheduledTimestamp = null) => {
    if (!content.trim() && type === "text") return;

    const targetChat = chats.find(c => String(c.id) === String(targetChatId));
    const messageId = Date.now().toString();
    const commonMsg = {
      id: messageId,
      text: content,
      senderId: currentPhone,
      senderName: userProfile?.name || "User",
      receiverId: targetChat?.phone || null,
      dataType: type,
      createdAt: { seconds: Date.now() / 1000 },
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      chatId: targetChatId,
      status: scheduledTimestamp ? 'pending' : 'sent',
      scheduledTime: scheduledTimestamp,
      quotedMsg: replyingTo ? { sender: replyingTo.senderName, text: replyingTo.text } : null,
    };

    // Reset replyingTo after send
    setReplyingTo(null);

    if (scheduledTimestamp) {
      setMessages(prev => ({
        ...prev,
        [targetChatId]: [...(prev[targetChatId] || []), { ...commonMsg, type: 'sent' }]
      }));
      setInput("");
      toast.success("Message Scheduled!");
      setShowScheduler(false);
      return;
    }

    socket.emit("send_message", commonMsg);

    if (!db) {
      // Demo Mode: Local Message
      const newMessage = {
        ...commonMsg,
        type: 'sent'
      };

      setMessages(prev => {
        const currentMsgs = prev[targetChatId] || [];
        if (currentMsgs.some(m => m.id === messageId)) return prev;
        return {
          ...prev,
          [targetChatId]: [...currentMsgs, newMessage]
        };
      });

      setChats(prev => {
        const chatExists = prev.some(c => c.id === targetChatId);
        if (!chatExists) return prev; // Should not happen but safety first

        return prev.map(c =>
          c.id === targetChatId ? { ...c, last: type === 'image' ? '📷 Photo' : content, timestamp: Date.now() } : c
        );
      });

      if (targetChatId === activeChatId) {
        setInput("");
        setShowEmojiPicker(false);
      }
      return;
    }

    const messageData = {
      text: content,
      senderId: currentPhone,
      senderName: userProfile.name,
      dataType: type,
      createdAt: serverTimestamp()
    };

    try {
      // Add message to subcollection
      await addDoc(collection(db, "chats", targetChatId, "messages"), messageData);

      // Update chat preview
      const chatRef = doc(db, "chats", targetChatId);
      await updateDoc(chatRef, {
        last: type === 'image' ? '📷 Photo' : content,
        timestamp: serverTimestamp()
      });

      if (targetChatId === activeChatId) {
        setInput("");
        setShowEmojiPicker(false);
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleSendMessage(reader.result, 'image', activeChatId);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfilePicUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Store in temp state until "Save" is clicked
        setTempProfileImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateMood = (moodObj) => {
    setUserProfile(prev => ({ ...prev, mood: moodObj }));
    const data = { phone: currentPhone, ...moodObj };
    socket.emit("update_mood", data);

    // Save locally
    const saved = localStorage.getItem(`profile_${currentPhone}`);
    if (saved) {
      const p = JSON.parse(saved);
      p.mood = moodObj;
      localStorage.setItem(`profile_${currentPhone}`, JSON.stringify(p));
    }
    toast.success(`Mood set to ${moodObj.label}`);
  };

  const handleWallpaperUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageUrl = reader.result;
        setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, wallpaper: imageUrl } : c));
        localStorage.setItem(`wallpaper_${currentPhone}_${activeChatId}`, imageUrl);
        toast.success("Wallpaper updated!");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    const updatedProfile = {
      ...userProfile,
      name: editName,
      status: editAbout,
      avatarImage: tempProfileImage || userProfile.avatarImage
    };

    if (!db) {
      // Demo Mode: Save Locally
      localStorage.setItem(`profile_${currentPhone}`, JSON.stringify(updatedProfile));
      setUserProfile(updatedProfile);
      setTempProfileImage(null);
      toast.success("Profile Saved Locally!");
      setView('chat-list');
      return;
    }

    try {
      const userRef = doc(db, "users", currentPhone);
      await updateDoc(userRef, updatedProfile);
      setUserProfile(updatedProfile);
      setTempProfileImage(null);
      toast.success("Profile Saved!");
      setView('chat-list');
    } catch (err) {
      console.error("Error saving profile:", err);
      toast.error("Error saving profile");
    }
  };

  const onEmojiClick = (emojiObject) => {
    setInput(prev => prev + emojiObject.emoji);
  };

  const handleAddContact = async () => {
    console.log("handleAddContact called"); // Debug
    if (!newContactName.trim() || !newContactPhone.trim()) {
      console.log("Validation failed", newContactName, newContactPhone); // Debug
      toast.error("Please enter both name and phone number");
      return;
    }

    // 10-digit validation
    if (!/^[0-9]{10}$/.test(newContactPhone)) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    const targetPhone = normalizePhone(newContactPhone);

    if (!db) {
      // Demo Mode: Add Chat Locally
      const demoChat = {
        id: Date.now().toString(),
        name: newContactName,
        participants: [currentPhone, targetPhone],
        last: "Tap to start chatting",
        timestamp: Date.now(),
        avatar: newContactName[0].toUpperCase(),
        phone: targetPhone,
        about: "Hey there! I am using WhatsApp.",
        pinned: false, muted: false, unread: 0, archived: false, locked: false
      };
      setChats(prev => [demoChat, ...prev]);
      setActiveChatId(demoChat.id);
      setIsAddingContact(false);
      setShowContactInfo(false);
      setNewContactName("");
      setNewContactPhone("");

      return;
    }

    try {
      // Check if chat already exists
      const existingQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", currentPhone)
      );
      const snap = await getDocs(existingQuery);
      const existing = snap.docs.find(doc => doc.data().participants.includes(targetPhone));

      if (existing) {
        setActiveChatId(existing.id);
        setIsAddingContact(false);
        setNewContactName("");
        setNewContactPhone("");
        return;
      }

      // Create new chat
      const newChatRef = await addDoc(collection(db, "chats"), {
        name: newContactName,
        participants: [currentPhone, targetPhone],
        last: "Tap to start chatting",
        timestamp: serverTimestamp(),
        avatar: newContactName[0].toUpperCase(),
        phone: targetPhone,
        about: "Hey there! I am using WhatsApp.",
        pinned: false,
        muted: false,
        unread: 0,
        archived: false,
        locked: false
      });

      setActiveChatId(newChatRef.id);
      setIsAddingContact(false);
      setShowContactInfo(false); // Do not auto-open profile
      setNewContactName("");
      setNewContactPhone("");
    } catch (err) {
      console.error("Error adding contact:", err);
      toast.error("Error adding contact: " + err.message);
    }
  };

  // --- SELECTION & ACTION LOGIC ---
  const handleChatContextMenu = (e, chatId) => {
    e.preventDefault();
    setSelectedChatId(chatId);
    setShowSelectionMenu(false);
  };

  const handleClearSelection = () => {
    setSelectedChatId(null);
    setShowSelectionMenu(false);
  };

  const handlePinChat = () => {
    if (!selectedChatId) return;
    setChats(prev => prev.map(c => c.id === selectedChatId ? { ...c, pinned: !c.pinned } : c));
    handleClearSelection();
  };

  const handleMuteChat = () => {
    if (!selectedChatId) return;
    setChats(prev => prev.map(c => c.id === selectedChatId ? { ...c, muted: !c.muted } : c));
    handleClearSelection();
  };

  const handleDeleteChat = () => {
    if (selectedChatId && window.confirm("Delete this chat?")) {
      setChats(prev => prev.filter(c => c.id !== selectedChatId));
      if (activeChatId === selectedChatId) {
        setActiveChatId(null);
        setShowContactInfo(false);
      }
      handleClearSelection();
    }
  };

  const handleArchiveChat = (id = selectedChatId) => {
    if (!id) return;
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    const isArchived = chat.archived;

    setChats(prev => prev.map(c => c.id === id ? { ...c, archived: !c.archived } : c));

    // Optional: stay in archived view or go back
    if (activeChatId === id) setActiveChatId(null);
    if (selectedChatId === id) handleClearSelection();
  };

  const handleStatusUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageUrl = event.target.result;
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (db) {
        try {
          const normalizedMe = normalizePhone(currentPhone);
          await setDoc(doc(db, "statuses", normalizedMe), {
            phone: normalizedMe,
            name: userProfile.name,
            avatarImage: imageUrl,
            isText: false,
            timestamp: serverTimestamp()
          });
        } catch (err) {
          console.error("Status upload error:", err);
        }
      }

      setStatusList(prev => prev.map(s =>
        s.isMe ? { ...s, time: `Just now (${timeStr})`, avatarImage: imageUrl } : s
      ));
      setActiveViewingStatus({ name: 'My Status', avatarImage: imageUrl, time: `Just now (${timeStr})` });
      toast.success("Status updated successfully!");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTextStatus = async () => {
    if (!statusText.trim()) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (db) {
      try {
        const normalizedMe = normalizePhone(currentPhone);
        await setDoc(doc(db, "statuses", normalizedMe), {
          phone: normalizedMe,
          name: userProfile.name,
          isText: true,
          text: statusText,
          bg: statusBg,
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.error("Text status upload error:", err);
      }
    }

    setStatusList(prev => prev.map(s =>
      s.isMe ? { ...s, time: `Just now (${timeStr})`, isText: true, text: statusText, bg: statusBg, avatarImage: null } : s
    ));
    setIsWritingTextStatus(false);
    setStatusText("");
    toast.success("Text status updated!");
  };

  const handleMarkUnread = () => {
    if (!selectedChatId) return;
    setChats(prev => prev.map(c => c.id === selectedChatId ? { ...c, unread: c.unread ? 0 : 1 } : c));
    handleClearSelection();
  };

  const handleLockChat = (id = selectedChatId) => {
    if (!id) return;
    const chat = chats.find(c => c.id === id);
    if (!chat) return;

    if (chat.locked) {
      // Unlock instantly (per user "only when I lock" request)
      setChats(prev => prev.map(c => c.id === id ? { ...c, locked: false } : c));
      return;
    }

    // Locking requires password authority
    setPendingLockId(id);
    setAuthPasswordInput("");
    setErrorPassword("");

    if (!lockPassword || lockPassword === "null") {
      setIsSettingPassword(true);
    } else {
      setIsSettingPassword(false);
    }
    setIsAuthenticating(true);
  };

  const handleAuthLockedChats = () => {
    if (isSettingPassword) {
      if (authPasswordInput.length < 4) {
        setErrorPassword("Password must be at least 4 digits");
        return;
      }
      setLockPassword(authPasswordInput);
      setIsSettingPassword(false);
      if (pendingLockId) {
        setChats(prev => prev.map(c => c.id === pendingLockId ? { ...c, locked: true } : c));
        if (selectedChatId === pendingLockId) handleClearSelection();
        if (activeChatId === pendingLockId) setActiveChatId(null);
      }
      setIsAuthenticating(false);
      setAuthPasswordInput("");
      setPendingLockId(null);
      toast.success("Authority Setup Complete!");
    } else {
      if (authPasswordInput === lockPassword) {
        if (pendingLockId) {
          setChats(prev => prev.map(c => c.id === pendingLockId ? { ...c, locked: true } : c));
          if (selectedChatId === pendingLockId) handleClearSelection();
          if (activeChatId === pendingLockId) setActiveChatId(null);
        }
        setIsAuthenticating(false);
        setAuthPasswordInput("");
        setPendingLockId(null);
        setErrorPassword("");
      } else {
        setErrorPassword("Incorrect Password");
      }
    }
  };

  const handleResetPassword = () => {
    if (window.confirm("Forgot Password? Resetting will UNLOCK all currently locked chats for security. Continue?")) {
      setLockPassword(null);
      localStorage.removeItem(`lockPassword_${currentPhone}`);
      setChats(prev => prev.map(c => ({ ...c, locked: false })));
      setIsAuthenticating(false);
      setIsSettingPassword(false);
      setAuthPasswordInput("");
      setPendingLockId(null);
      setErrorPassword("");
      toast.success("Password Reset Successfully. You can now set a new one.");
    }
  };

  const handleBlockChat = (chatIdToBlock) => {
    const id = chatIdToBlock || selectedChatId || activeChatId;
    if (!id) return;

    setChats(prev => prev.map(c => c.id === id ? { ...c, blocked: !c.blocked } : c));
    if (showSelectionMenu) handleClearSelection();
  };

  // --- MASS MESSAGE (ONE-OFF) LOGIC ---
  const handleToggleMultiSelection = (chatId) => {
    setMultiSelectedIds(prev =>
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  };

  const handleExecuteMassMessage = () => {
    if (!massMessageInput.trim() || multiSelectedIds.length === 0) return;

    // Send to each recipient individually
    multiSelectedIds.forEach(id => {
      handleSendMessage(massMessageInput, 'text', id);
    });

    toast.success(`Message sent to ${multiSelectedIds.length} chats!`);

    // Reset
    setMassMessageInput("");
    setMultiSelectedIds([]);
    setShowMassMessageCompose(false);
    setView('chat-list');
  };

  // --- REACTION & REPLY LOGIC ---
  const handleMessageDoubleClick = (msgIndex) => {
    const chatMsgs = messages[activeChatId] || [];
    const msg = chatMsgs[msgIndex];
    if (!msg) return;

    // Heart reaction
    setMessages(prev => {
      const newMsgs = [...(prev[activeChatId] || [])];
      newMsgs[msgIndex] = { ...newMsgs[msgIndex], reaction: newMsgs[msgIndex].reaction === '❤️' ? null : '❤️' };
      return { ...prev, [activeChatId]: newMsgs };
    });

    // Also set as replyingTo
    setReplyingTo(msg);
  };

  // Sorting & Filtering
  const sortedChats = [...chats].sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    // Use timestamp for recency (descending: newest first)
    const timeA = a.timestamp || 0;
    const timeB = b.timestamp || 0;
    return timeB - timeA;
  });

  const filteredChats = sortedChats.filter(c => {
    const matchesSearch = (c.name || "").toLowerCase().includes((searchQuery || "").toLowerCase());
    if (view === 'archived') return matchesSearch && c.archived;
    if (view === 'locked') return matchesSearch && c.locked;
    // Hide archived AND locked from main list
    return matchesSearch && !c.archived && !c.locked;
  });

  console.log("Chat Rendering, View:", view, "FilteredChats Count:", filteredChats.length);

  const activeChat = chats.find(c => String(c.id) === String(activeChatId));
  const currentMessages = activeChatId ? (messages[activeChatId] || []) : [];
  const selectedChat = chats.find(c => c.id === selectedChatId);

  return (
    <div className={`chat-container ${darkMode ? "dark-mode" : ""} ${activeChatId ? "chat-open" : ""}`}>
      <ToastConfig />

      {/* Status Viewer Overlay */}
      {activeViewingStatus && (
        <div className="status-viewer-overlay" onClick={() => setActiveViewingStatus(null)}>
          <div className="status-viewer-header">
            <div className="status-viewer-user">
              <button className="back-btn-white" onClick={() => setActiveViewingStatus(null)}><Icons.Back /></button>
              <div className="status-viewer-info">
                <div className="sv-name">{activeViewingStatus.name}</div>
                <div className="sv-time">{activeViewingStatus.time}</div>
              </div>
            </div>
            <button className="close-viewer" onClick={() => setActiveViewingStatus(null)}><Icons.Close /></button>
          </div>
          <div className="status-progress-container">
            <div className="status-progress-bar active"></div>
          </div>
          <div className="status-viewer-body" onClick={(e) => e.stopPropagation()}>
            {activeViewingStatus.isText ? (
              <div className="status-text-content" style={{ backgroundColor: activeViewingStatus.bg }}>
                <h1>{activeViewingStatus.text}</h1>
              </div>
            ) : (
              <img src={activeViewingStatus.avatarImage} alt="Status Content" />
            )}
          </div>
        </div>
      )}

      {/* Text Status Composer */}
      {isWritingTextStatus && (
        <div className="status-composer-overlay" style={{ backgroundColor: statusBg }}>
          <div className="composer-header">
            <button className="icon-btn-white" onClick={() => setIsWritingTextStatus(false)}><Icons.Close /></button>
            <div className="composer-actions">
              <button
                className="icon-btn-white"
                onClick={() => {
                  const currentIndex = statusBgs.indexOf(statusBg);
                  const nextIndex = (currentIndex + 1) % statusBgs.length;
                  setStatusBg(statusBgs[nextIndex]);
                }}
              >
                <Icons.Palette />
              </button>
              <button className="icon-btn-white" onClick={handleSaveTextStatus}><Icons.Send /></button>
            </div>
          </div>
          <div className="composer-body">
            <textarea
              placeholder="Type a status"
              autoFocus
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
            />
          </div>
        </div>
      )}



      {/* Authority (Password) Modal */}
      {isAuthenticating && (
        <div className="mass-message-overlay" style={{ zIndex: 5000 }}>
          <div className="mass-message-box" style={{ width: '350px', padding: '30px', textAlign: 'center' }}>
            <div style={{ fontSize: '50px', color: 'var(--teal-green)', marginBottom: '15px' }}><Icons.Lock /></div>
            <h3>{isSettingPassword ? "Set Authority Password" : "Confirm Authority"}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
              {isSettingPassword ? "Set a password to gain authority to lock chats" : "Enter your password to lock this chat"}
            </p>
            <input
              type="password"
              className="otp-field"
              style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '10px', fontSize: '20px', textAlign: 'center' }}
              placeholder="••••"
              value={authPasswordInput}
              onChange={(e) => setAuthPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuthLockedChats()}
              autoFocus
            />
            {errorPassword && <p style={{ color: '#ea0038', fontSize: '13px', margin: '5px 0 15px' }}>{errorPassword}</p>}

            {!isSettingPassword && (
              <button
                onClick={handleResetPassword}
                style={{ background: 'none', border: 'none', color: 'var(--teal-green)', cursor: 'pointer', fontSize: '13px', marginBottom: '15px', textDecoration: 'underline' }}
              >
                Forgot Password? Reset Authority
              </button>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="primary-btn" onClick={handleAuthLockedChats} style={{ flex: 1 }}>Confirm</button>
              <button className="back-btn" onClick={() => { setIsAuthenticating(false); setIsSettingPassword(false); setAuthPasswordInput(""); setErrorPassword(""); setPendingLockId(null); }} style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Call Overlay */}
      {(call || incomingCall) && (
        <div className="call-overlay">
          <div className="call-bg-blur" style={{ backgroundImage: `url(${activeChat?.avatarImage || 'https://via.placeholder.com/800'})` }}></div>
          <div className="call-overlay-content">
            <div className="call-header">
              <span className="call-lock-icon">🔒 End-to-end encrypted</span>
            </div>

            <div className="call-info">
              {/* Video Streams */}
              {isCurrentCallVideo && (
                <div className="video-streams" style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
                  <video ref={myVideoRef} autoPlay muted style={{ width: '150px', borderRadius: '10px', transform: 'scaleX(-1)' }} />
                  <video ref={remoteVideoRef} autoPlay style={{ width: '150px', borderRadius: '10px' }} />
                </div>
              )}

              <div className="call-avatar-container">
                {renderAvatar(activeChat || {})}
              </div>
              <h2>{incomingCall ? 'Incoming Call...' : (activeChat?.name || 'Calling...')}</h2>
              <p className="call-ringing">{incomingCall ? 'Someone is calling you' : 'Ringing...'}</p>
            </div>

            <div className="call-bottom-actions">
              {incomingCall && !call && (
                <button className="call-btn-answer" onClick={answerCall} style={{ backgroundColor: '#008069', width: '60px', height: '60px', borderRadius: '50%', border: 'none', color: 'white', marginRight: '20px', cursor: 'pointer' }}>
                  <Icons.Phone />
                </button>
              )}

              <button className="call-btn-end-large" onClick={endCall}>
                <Icons.Phone />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mass Message Compose Modal */}
      {showMassMessageCompose && (
        <div className="mass-message-overlay">
          <div className="mass-message-box">
            <div className="mass-header">
              <h3>Broadcasting to {multiSelectedIds.length} contacts</h3>
              <button onClick={() => setShowMassMessageCompose(false)}><Icons.Close /></button>
            </div>

            {/* Recipient Preview */}
            <div className="mass-recipients">
              {chats.filter(c => multiSelectedIds.includes(c.id)).map(c => (
                <div key={c.id} className="recipient-chip">
                  <small>{c.name}</small>
                </div>
              ))}
            </div>

            <div className="mass-body">
              <textarea
                placeholder="Type your message..."
                value={massMessageInput}
                onChange={(e) => setMassMessageInput(e.target.value)}
                autoFocus
              />
            </div>
            <div className="mass-footer">
              <button className="send-mass-btn" onClick={handleExecuteMassMessage}>
                Send Now <Icons.Send />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar">


        {['starred', 'new-group'].includes(view) ? (
          <div className="sidebar-view-header">
            <button onClick={() => setView('chat-list')}><Icons.Back /></button>
            <span style={{ textTransform: 'capitalize' }}>{view === 'new-group' ? 'New group' : view}</span>
          </div>
        ) : view === 'multi-select' ? (
          <div className="sidebar-header selection-mode">
            <div className="selection-left">
              <button className="icon-btn" onClick={() => setView('chat-list')}><Icons.Back /></button>
              <span>Select Contacts</span>
            </div>
            <div className="selection-right">
              <span>{multiSelectedIds.length} selected</span>
            </div>
          </div>
        ) : selectedChatId ? (
          /* Selection Header */
          <div className="sidebar-header selection-mode">
            <div className="selection-left">
              <button className="icon-btn" onClick={handleClearSelection}><Icons.Back /></button>
              <span>1</span>
            </div>
            <div className="selection-right">
              <button className="icon-btn" title={selectedChat?.pinned ? "Unpin" : "Pin"} onClick={handlePinChat}>
                {selectedChat?.pinned ? <Icons.Unpin /> : <Icons.Pin />}
              </button>
              <button className="icon-btn" title="Delete" onClick={handleDeleteChat}><Icons.Delete /></button>
              <button className="icon-btn" title={selectedChat?.muted ? "Unmute" : "Mute"} onClick={handleMuteChat}>
                {selectedChat?.muted ? <Icons.Unmute /> : <Icons.Mute />}
              </button>
              <button className="icon-btn" title={selectedChat?.archived ? "Unarchive" : "Archive"} onClick={() => handleArchiveChat()}>
                {selectedChat?.archived ? <Icons.Unarchive /> : <Icons.Archive />}
              </button>

              <div className="menu-container">
                <button className="icon-btn" onClick={() => setShowSelectionMenu(!showSelectionMenu)}><Icons.Menu /></button>
                {showSelectionMenu && (
                  <div className="dropdown-menu">
                    <div className="dropdown-item" onClick={handleMarkUnread}>
                      {selectedChat?.unread ? "Mark as read" : "Mark as unread"}
                    </div>
                    <div className="dropdown-item" onClick={() => handleArchiveChat()}>
                      {selectedChat?.archived ? "Unarchive Chat" : "Archive Chat"}
                    </div>
                    <div className="dropdown-item" onClick={() => handleLockChat()}>
                      {selectedChat?.locked ? "Unlock Chat" : "Lock Chat"}
                    </div>
                    <div className="dropdown-item">Add to favorites</div>
                    <div className="dropdown-item" onClick={() => handleBlockChat(selectedChat.id)}>
                      {selectedChat?.blocked ? "Unblock" : "Block"} {selectedChat?.name}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Normal Header & Tabs */
          <>
            <div className="sidebar-header">
              <div
                className={`user-avatar ${view === 'profile' ? 'active' : ''}`}
                onClick={() => setView(view === 'chat-list' ? 'profile' : 'chat-list')}
                title="My Profile"
              >
                {userProfile.avatarImage ? (
                  <img src={userProfile.avatarImage} alt="Profile" className="user-avatar-img" />
                ) : (
                  <div style={{ padding: '8px', color: '#cfd8dc' }}>
                    <Icons.DefaultAvatar />
                  </div>
                )}
              </div>

              <div className="sidebar-app-name">
                WhatsApp Web
              </div>

              <div className="header-icons">
                <button onClick={() => setDarkMode(!darkMode)} title="Theme">
                  <Icons.Theme />
                </button>
                <button onClick={() => setIsAddingContact(!isAddingContact)} title="New Chat"><Icons.Plus /></button>

                <div className="menu-container">
                  <button title="Menu" onClick={() => setShowSelectionMenu(!showSelectionMenu)}><Icons.Menu /></button>
                  {showSelectionMenu && (
                    <div className="dropdown-menu">
                      <div className="dropdown-item" onClick={() => {
                        setView('multi-select');
                        setShowSelectionMenu(false);
                      }}>Message to multiple</div>
                      <div className="dropdown-item" onClick={() => { setView('new-group'); setShowSelectionMenu(false); }}>New group</div>
                      <div className="dropdown-item" onClick={() => { setView('starred'); setShowSelectionMenu(false); }}>Starred messages</div>
                      <div className="dropdown-item" onClick={() => { setView('settings'); setShowSelectionMenu(false); }}>Settings</div>
                      <div className="dropdown-item" onClick={() => {
                        if (window.confirm("Log out?")) {
                          localStorage.removeItem("phone");
                          navigate('/Personal');
                        }
                      }}>Log out</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation tabs moved to bottom */}
          </>
        )}

        {view === 'profile' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('settings')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Profile</h3>
            </div>

            <div className="profile-edit-view">
              <div className="profile-pic-large-edit" onClick={() => profilePicInputRef.current?.click()}>
                {tempProfileImage || userProfile.avatarImage ? (
                  <img src={tempProfileImage || userProfile.avatarImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', backgroundColor: '#cfd8dc', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '48px', color: '#fff' }}>
                    {userProfile.avatar}
                  </div>
                )}
                <div className="profile-overlay-edit">
                  <Icons.Camera style={{ width: '24px', height: '24px', marginBottom: '5px' }} />
                  <span>CHANGE</span>
                  <span>PROFILE PHOTO</span>
                </div>
                <input type="file" ref={profilePicInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleProfilePicUpload} />
              </div>

              <div className="profile-input-group">
                <label className="profile-input-label">Your Name</label>
                <div className="profile-input-field">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your name"
                  />
                  <Icons.Edit style={{ width: '20px' }} />
                </div>
                <p className="profile-help-text">This is not your username or pin. This name will be visible to your WhatsApp contacts.</p>
              </div>

              <div className="profile-input-group">
                <label className="profile-input-label">My Mood ✨</label>
                <div className="mood-selection-grid">
                  {MOOD_OPTIONS.map(m => (
                    <div
                      key={m.id}
                      className={`mood-option-item ${userProfile.mood?.id === m.id ? 'active' : ''}`}
                      style={{ borderLeft: `4px solid ${m.color}` }}
                      onClick={() => handleUpdateMood(m)}
                    >
                      <span className="mood-icon">{m.icon || 'Clear'}</span>
                      <span className="mood-label">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="profile-input-group">
                <label className="profile-input-label">About</label>
                <div className="profile-input-field">
                  <input
                    value={editAbout}
                    onChange={(e) => setEditAbout(e.target.value)}
                    placeholder="Enter your status"
                  />
                  <Icons.Edit style={{ width: '20px' }} />
                </div>
              </div>

              <div className="profile-input-group">
                <label className="profile-input-label">Phone Number</label>
                <div className="profile-input-field">
                  <div style={{ flex: 1, fontSize: '16px', color: 'var(--text-secondary)' }}>{currentPhone}</div>
                </div>
              </div>

              <div className="profile-actions" style={{ width: '100%', marginTop: 'auto' }}>
                <button className="save-btn" onClick={handleSaveProfile} style={{ backgroundColor: 'var(--teal-green)', color: 'white', width: '100%', padding: '12px', border: 'none', borderRadius: '24px', fontSize: '15px', fontWeight: '500', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'multi-select' && (
          <div className="chat-list broadcast-list-select">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-item ${multiSelectedIds.includes(chat.id) ? "selected" : ""}`}
                onClick={() => handleToggleMultiSelection(chat.id)}
              >
                <div className="avatar">{renderAvatar(chat)}</div>
                <div className="chat-info">
                  <div className="chat-top"><span className="name">{chat.name}</span></div>
                  <div className="chat-bottom"><span className="time">{chat.about || "Available"}</span></div>
                </div>
                {multiSelectedIds.includes(chat.id) && <div className="selection-check">✔️</div>}
              </div>
            ))}

            {multiSelectedIds.length > 0 && (
              <div className="broadcast-fab" onClick={() => setShowMassMessageCompose(true)}>
                <Icons.Next />
              </div>
            )}
          </div>
        )}

        {view === 'settings' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('chat-list')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Settings</h3>
            </div>

            <div className="settings-scroll-area modern-scroll">
              {/* Hero Profile Card */}
              <div className="settings-hero" onClick={() => setView('profile')}>
                <div className="settings-hero-avatar">
                  {userProfile.avatarImage ?
                    <img src={userProfile.avatarImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Profile" /> :
                    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '28px', color: '#fff', backgroundColor: '#ccc' }}>{userProfile.avatar}</div>
                  }
                </div>
                <div className="settings-hero-info">
                  <div className="settings-hero-name">{userProfile.name}</div>
                  <div className="settings-hero-status">{userProfile.status}</div>
                </div>
              </div>

              <div className="settings-list">
                <div className="setting-item-premium" onClick={() => setView('settings-account')}>
                  <div className="setting-icon-wrapper"><Icons.Key /></div>
                  <div className="setting-info-premium">
                    <div className="setting-title">Account</div>
                    <div className="setting-subtitle">Security notifications, change number</div>
                  </div>
                </div>

                <div className="setting-item-premium" onClick={() => setView('settings-privacy')}>
                  <div className="setting-icon-wrapper"><Icons.Lock /></div>
                  <div className="setting-info-premium">
                    <div className="setting-title">Privacy</div>
                    <div className="setting-subtitle">Block contacts, disappearing messages</div>
                  </div>
                </div>

                <div className="setting-item-premium" onClick={() => setView('settings-chats')}>
                  <div className="setting-icon-wrapper"><Icons.Chat /></div>
                  <div className="setting-info-premium">
                    <div className="setting-title">Chats</div>
                    <div className="setting-subtitle">Theme, wallpapers, chat history</div>
                  </div>
                </div>

                <div className="setting-item-premium" onClick={() => setView('settings-notifications')}>
                  <div className="setting-icon-wrapper"><Icons.Bell /></div>
                  <div className="setting-info-premium">
                    <div className="setting-title">Notifications</div>
                    <div className="setting-subtitle">Message, group & call tones</div>
                  </div>
                </div>

                <div className="setting-separator"></div>

                <div className="setting-item-premium" onClick={() => setView('settings-help')}>
                  <div className="setting-icon-wrapper"><Icons.Help /></div>
                  <div className="setting-info-premium">
                    <div className="setting-title">Help</div>
                    <div className="setting-subtitle">Help center, contact us, privacy policy</div>
                  </div>
                </div>

                <div className="setting-item-premium" onClick={() => {
                  if (window.confirm("Log out?")) {
                    localStorage.removeItem("phone");
                    navigate('/Personal');
                  }
                }}>
                  <div className="setting-icon-wrapper" style={{ color: '#ea0038' }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                  </div>
                  <div className="setting-info-premium">
                    <div className="setting-title" style={{ color: '#ea0038' }}>Log out</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- SETTINGS SUB-VIEWS --- */}

        {view === 'settings-account' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('settings')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Account</h3>
            </div>
            <div className="settings-list">
              <div className="setting-item-premium" onClick={() => setSecurityNotifications(!securityNotifications)}>
                <div className="setting-info-premium"><div className="setting-title">Security notifications</div></div>
                <input type="checkbox" className="toggle-switch" checked={securityNotifications} onChange={() => { }} />
              </div>
              <div className="setting-item-premium" onClick={() => setView('settings-two-step')}>
                <div className="setting-info-premium"><div className="setting-title">Two-step verification</div></div>
                <Icons.Next style={{ width: '16px', color: 'var(--text-secondary)' }} />
              </div>
              <div className="setting-item-premium" onClick={() => setView('settings-change-num')}>
                <div className="setting-info-premium"><div className="setting-title">Change number</div></div>
                <Icons.Next style={{ width: '16px', color: 'var(--text-secondary)' }} />
              </div>
              <div className="setting-item-premium" onClick={() => setView('settings-account-info')}>
                <div className="setting-info-premium"><div className="setting-title">Request account info</div></div>
                <Icons.Next style={{ width: '16px', color: 'var(--text-secondary)' }} />
              </div>
              <div className="setting-separator"></div>
              <div className="setting-item-premium" onClick={() => {
                if (window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
                  toast.loading("Deleting account...");
                  setTimeout(() => {
                    toast.dismiss();
                    navigate('/Personal');
                  }, 2000);
                }
              }}>
                <div className="setting-info-premium"><div className="setting-title" style={{ color: '#ea0038' }}>Delete my account</div></div>
              </div>
            </div>
          </div>
        )}

        {/* Two-Step Verification Sub-View */}
        {view === 'settings-two-step' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('settings-account')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Two-step verification</h3>
            </div>
            <div style={{ padding: '40px 30px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '100px', height: '100px', background: '#e9edef', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '40px' }}>🔐</span>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '30px' }}>
                For extra security, turn on two-step verification, which will require a PIN when registering your phone number with WhatsApp again.
              </p>
              <button
                onClick={() => toast.success("Two-step verification turned on!")}
                style={{ backgroundColor: 'var(--teal-green)', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '24px', fontWeight: '500', cursor: 'pointer' }}>
                Turn on
              </button>
            </div>
          </div>
        )}

        {/* Change Number Sub-View */}
        {view === 'settings-change-num' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('settings-account')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Change number</h3>
            </div>
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <div style={{ width: '80px', height: '80px', background: '#e9edef', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <span style={{ fontSize: '30px' }}>🔄</span>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '30px' }}>
                Changing your phone number will migrate your account info, groups & settings.
              </p>

              <div style={{ textAlign: 'left', marginBottom: '15px' }}>
                <label style={{ fontSize: '12px', color: 'var(--teal-green)', fontWeight: '500', display: 'block', marginBottom: '5px' }}>Old phone number</label>
                <input type="tel" placeholder="Phone number" style={{ width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid var(--border-color)', outline: 'none', background: 'transparent' }} />
              </div>

              <div style={{ textAlign: 'left', marginBottom: '30px' }}>
                <label style={{ fontSize: '12px', color: 'var(--teal-green)', fontWeight: '500', display: 'block', marginBottom: '5px' }}>New phone number</label>
                <input type="tel" placeholder="Phone number" style={{ width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid var(--border-color)', outline: 'none', background: 'transparent' }} />
              </div>

              <button
                onClick={() => { toast.success("Number change request sent"); setView('settings-account'); }}
                style={{ backgroundColor: 'var(--teal-green)', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '3px', fontWeight: '500', cursor: 'pointer' }}>
                NEXT
              </button>
            </div>
          </div>
        )}

        {/* Request Account Info Sub-View */}
        {view === 'settings-account-info' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('settings-account')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Request account info</h3>
            </div>
            <div style={{ padding: '30px', display: 'flex', flexDirection: 'column' }}>
              <div className="setting-item-premium" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <div style={{ width: '24px', marginRight: '20px', display: 'flex', justifyContent: 'center' }}>📄</div>
                <div className="setting-info-premium">
                  <div className="setting-title" style={{ fontSize: '15px' }}>Request report</div>
                  <div className="setting-subtitle">Create a report of your WhatsApp account information and settings.</div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border-color)', margin: '15px 0' }}></div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Your report will be ready in about 3 days. You'll have a few weeks to download it after it's ready.
              </p>
              <button
                onClick={() => toast.success("Request sent. Ready by " + new Date(Date.now() + 259200000).toLocaleDateString())}
                style={{ backgroundColor: 'transparent', color: 'var(--teal-green)', border: 'none', padding: '15px 0', textAlign: 'left', fontWeight: '500', cursor: 'pointer', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icons.Plus /> Request report
              </button>
            </div>
          </div>
        )}

        {view === 'settings-privacy' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('settings')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Privacy</h3>
            </div>
            <div className="settings-scroll-area modern-scroll">
              <p style={{ padding: '20px 24px 10px', fontSize: '14px', color: 'var(--teal-green)', fontWeight: '500' }}>Who can see my personal info</p>

              <div className="setting-item-premium" onClick={() => toast("Privacy: Last seen set to Nobody")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Last seen and online</div>
                  <div className="setting-subtitle">Nobody</div>
                </div>
              </div>
              <div className="setting-item-premium" onClick={() => toast("Privacy: Profile photo set to My contacts")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Profile photo</div>
                  <div className="setting-subtitle">My contacts</div>
                </div>
              </div>
              <div className="setting-item-premium" onClick={() => toast("Privacy: About info set to Everyone")}>
                <div className="setting-info-premium">
                  <div className="setting-title">About</div>
                  <div className="setting-subtitle">Everyone</div>
                </div>
              </div>
              <div className="setting-item-premium" onClick={() => setReadReceipts(!readReceipts)}>
                <div className="setting-info-premium">
                  <div className="setting-title">Read receipts</div>
                  <div className="setting-subtitle">If turned off, you won't send or receive Read receipts.</div>
                </div>
                <input type="checkbox" className="toggle-switch" checked={readReceipts} onChange={() => { }} />
              </div>

              <div className="setting-separator"></div>

              <div className="setting-item-premium" onClick={() => toast("Privacy: Default message timer is Off")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Default message timer</div>
                  <div className="setting-subtitle">Off</div>
                </div>
              </div>

              <div className="setting-item-premium" onClick={() => toast("Privacy: Groups set to Everyone")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Groups</div>
                  <div className="setting-subtitle">Everyone</div>
                </div>
              </div>

              <div className="setting-item-premium" onClick={() => toast("You have 2 blocked contacts")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Blocked contacts</div>
                  <div className="setting-subtitle">2</div>
                </div>
              </div>

              <div className="setting-item-premium" onClick={() => toast("Live location: None")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Live location</div>
                  <div className="setting-subtitle">None</div>
                </div>
              </div>

              <div className="setting-item-premium" onClick={() => toast("Calls: Silence unknown callers")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Calls</div>
                  <div className="setting-subtitle">Silence unknown callers</div>
                </div>
              </div>

              <div className="setting-separator"></div>

              <div className="setting-item-premium" onClick={() => toast("Fingerprint lock details")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Fingerprint lock</div>
                  <div className="setting-subtitle">Disabled</div>
                </div>
              </div>

              <div className="setting-item-premium" onClick={() => toast("App lock details")}>
                <div className="setting-info-premium">
                  <div className="setting-title">App lock</div>
                  <div className="setting-subtitle">Off</div>
                </div>
              </div>

              <div style={{ height: '20px' }}></div>
            </div>
          </div>
        )}

        {view === 'settings-chats' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('settings')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Chats</h3>
            </div>
            <div className="settings-list">
              <div className="setting-item-premium">
                <div className="setting-info-premium">
                  <div className="setting-title">Theme</div>
                  <div className="setting-subtitle">{darkMode ? 'Dark' : 'Light'}</div>
                </div>
                <input type="checkbox" className="toggle-switch" checked={darkMode} onChange={() => {
                  const newMode = !darkMode;
                  setDarkMode(newMode);
                  document.body.classList.toggle("dark-mode", newMode);
                }} />
              </div>
              <div className="setting-item-premium" onClick={() => toast("Wallpaper customization coming soon")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Wallpaper</div>
                </div>
                <Icons.Next style={{ width: '16px', color: 'var(--text-secondary)' }} />
              </div>
              <div className="setting-item-premium" onClick={() => setEnterIsSend(!enterIsSend)}>
                <div className="setting-info-premium">
                  <div className="setting-title">Enter is send</div>
                  <div className="setting-subtitle">Enter key will send your message</div>
                </div>
                <input type="checkbox" className="toggle-switch" checked={enterIsSend} onChange={() => { }} />
              </div>

              <div className="setting-separator"></div>

              <div className="setting-item-premium" onClick={() => toast.loading("Backing up chats...", { duration: 2000 })}>
                <div className="setting-info-premium"><div className="setting-title">Chat backup</div></div>
              </div>
              <div className="setting-item-premium" onClick={() => toast("Chat history options")}>
                <div className="setting-info-premium"><div className="setting-title">Chat history</div></div>
              </div>
            </div>
          </div>
        )}

        {view === 'settings-notifications' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('settings')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Notifications</h3>
            </div>
            <div className="settings-list">
              <div className="setting-item-premium" onClick={() => setConversationTones(!conversationTones)}>
                <div className="setting-info-premium">
                  <div className="setting-title">Conversation tones</div>
                  <div className="setting-subtitle">Play sounds for incoming and outgoing messages.</div>
                </div>
                <input type="checkbox" className="toggle-switch" checked={conversationTones} onChange={() => { }} />
              </div>
              <div className="setting-separator"></div>
              <p style={{ padding: '10px 24px', fontSize: '14px', color: 'var(--teal-green)', fontWeight: '500' }}>Messages</p>
              <div className="setting-item-premium">
                <div className="setting-info-premium">
                  <div className="setting-title">Notification tone</div>
                  <div className="setting-subtitle">Default</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'settings-help' && (
          <div className="sidebar-view-content">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('settings')} title="Back"><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Help</h3>
            </div>
            <div className="settings-list">
              <div className="setting-item-premium" onClick={() => window.open('https://faq.whatsapp.com/', '_blank')}>
                <div className="setting-info-premium">
                  <div className="setting-title">Help Center</div>
                </div>
                <Icons.Next style={{ width: '16px', color: 'var(--text-secondary)' }} />
              </div>
              <div className="setting-item-premium" onClick={() => toast("Contacting support...")}>
                <div className="setting-info-premium">
                  <div className="setting-title">Contact us</div>
                  <div className="setting-subtitle">Questions? Need help?</div>
                </div>
                <Icons.Next style={{ width: '16px', color: 'var(--text-secondary)' }} />
              </div>
              <div className="setting-item-premium">
                <div className="setting-info-premium">
                  <div className="setting-title">Terms and Privacy Policy</div>
                </div>
                <Icons.Next style={{ width: '16px', color: 'var(--text-secondary)' }} />
              </div>
              <div className="setting-item-premium">
                <div className="setting-info-premium">
                  <div className="setting-title">App info</div>
                </div>
                <Icons.Next style={{ width: '16px', color: 'var(--text-secondary)' }} />
              </div>
            </div>
          </div>
        )}

        {view === 'starred' && (
          <div className="sidebar-view-content">
            {Object.values(messages).flat().some(m => m.starred) ? (
              Object.entries(messages).map(([chatId, msgs]) =>
                msgs.filter(m => m.starred).map((m, i) => (
                  <div className="starred-msg-item" key={i} onClick={() => { setView('chat-list'); setActiveChatId(chatId); }}>
                    <div className="starred-header">
                      <span>{chats.find(c => c.id == chatId)?.name || "Partner"}</span>
                      <span>{m.time}</span>
                    </div>
                    <div className="starred-content">{m.text}</div>
                  </div>
                ))
              )
            ) : (
              <div className="no-chat-selected" style={{ height: '50%', background: 'transparent' }}>
                <p>No starred messages</p>
                <small>Tap and hold on any message to star it.</small>
              </div>
            )}
          </div>
        )}

        {view === 'new-group' && (
          <div className="sidebar-view-content">
            <div className="new-group-input">
              <input
                placeholder="Group Subject"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
              />
              <button className="icon-btn" style={{ background: 'var(--teal-green)', color: 'white' }} onClick={() => {
                if (!newContactName.trim()) return;
                const newId = Date.now();
                const newChat = {
                  id: newId,
                  name: newContactName,
                  last: "You created group \"" + newContactName + "\"",
                  time: "Now",
                  timestamp: Date.now(),
                  avatar: "GROUP",
                  pinned: false, muted: false, unread: 0, archived: false,
                  isGroup: true,
                  participants: [...multiSelectedIds]
                };
                setChats([newChat, ...chats]);
                setMultiSelectedIds([]);
                setNewContactName("");
                setView('chat-list');
                setActiveChatId(newId);
              }}><Icons.Check /></button>
            </div>
            <p style={{ padding: '0 20px', color: 'var(--teal-green)' }}>Participants ({multiSelectedIds.length})</p>
            <div className="chat-list">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`chat-item ${multiSelectedIds.includes(chat.id) ? "selected" : ""}`}
                  onClick={() => handleToggleMultiSelection(chat.id)}
                >
                  <div className="avatar">{renderAvatar(chat)}</div>
                  <div className="chat-info">
                    <div className="chat-top"><span className="name">{chat.name}</span></div>
                    <div className="chat-bottom"><span className="time">{chat.about || "Available"}</span></div>
                  </div>
                  {multiSelectedIds.includes(chat.id) && <div className="selection-check">✔️</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'locked' && (
          <div className="chat-list">
            <div className="settings-header">
              <button className="icon-btn" onClick={() => setView('chat-list')}><Icons.Back /></button>
              <h3 style={{ marginLeft: '15px' }}>Locked Chats</h3>
            </div>
            <div className="encrypted-text" style={{ textAlign: 'center', padding: '15px' }}>
              <Icons.Lock style={{ width: '16px', marginBottom: '-3px' }} /> These chats are kept separate for privacy.
            </div>
            {filteredChats.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No locked chats</div>
            ) : (
              filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  className={`chat-item ${activeChatId === chat.id ? "active" : ""} ${selectedChatId === chat.id ? "selected" : ""}`}
                  onClick={() => {
                    if (selectedChatId) {
                      selectedChatId === chat.id ? handleClearSelection() : setSelectedChatId(chat.id);
                    } else {
                      setActiveChatId(chat.id);
                      setShowContactInfo(false);
                    }
                  }}
                  onContextMenu={(e) => handleChatContextMenu(e, chat.id)}
                >
                  <div className="avatar">{renderAvatar(chat)}</div>
                  <div className="chat-info">
                    <div className="chat-top">
                      <span className="name">{chat.name}</span>
                      <span className="time">{chat.time}</span>
                    </div>
                    <div className="chat-bottom">
                      <div className="last-msg">{chat.last}</div>
                      <div className="chat-meta">
                        <button
                          className="unarchive-btn-small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLockChat(chat.id);
                          }}
                          title="Unlock Chat"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal-green)', padding: '5px' }}
                        >
                          <Icons.Unlock />
                        </button>
                      </div>
                    </div>
                  </div>
                  {selectedChatId === chat.id && <div className="selection-check">✔️</div>}
                </div>
              ))
            )}
          </div>
        )}

        {view === 'status' && (
          <div className="status-view">
            <div className="sidebar-view-header modern-status-header">
              <div className="header-left">
                <button className="icon-btn" onClick={() => setView('chat-list')}><Icons.Back /></button>
                <h3>Status</h3>
              </div>
              <div className="header-right">
                <button className="icon-btn" onClick={() => setIsWritingTextStatus(true)} title="Text Status"><Icons.Edit /></button>
                <button className="icon-btn" onClick={() => statusInputRef.current.click()} title="Media Status"><Icons.Plus /></button>
                <button className="icon-btn"><Icons.Menu /></button>
              </div>
            </div>

            <div className="status-list modern-scroll" style={{ paddingBottom: '20px' }}>
              <input type="file" ref={statusInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleStatusUpload} />

              {/* My Status Card */}
              <div className="status-item-card my-status" onClick={() => {
                const myStatus = statusList.find(s => s.isMe);
                if (myStatus.avatarImage || myStatus.isText) setActiveViewingStatus(myStatus);
                else statusInputRef.current.click();
              }}>
                <div className="status-avatar-outer">
                  <div className="status-avatar-wrapper me">
                    {(() => {
                      const s = statusList.find(s => s.isMe);
                      if (s.avatarImage || s.isText) {
                        return s.isText ? (
                          <div className="avatar text-status-preview" style={{ backgroundColor: s.bg }}>{s.text}</div>
                        ) : (
                          <img src={s.avatarImage} alt="Me" className="avatar" />
                        );
                      }
                      return <div className="avatar">{renderAvatar({ ...userProfile, id: 'me' })}</div>;
                    })()}
                  </div>
                  {!statusList.find(s => s.isMe).avatarImage && !statusList.find(s => s.isMe).isText && (
                    <div className="add-status-badge">+</div>
                  )}
                </div>
                <div className="status-item-info">
                  <div className="status-name">{userProfile.name} (My Status)</div>
                  <div className="status-time" style={{ fontSize: '13px' }}>{statusList.find(s => s.isMe).time}</div>
                </div>
              </div>

              {/* Categorized Updates - Only for saved contacts */}
              {(() => {
                const recentUpdates = statusList.filter(s =>
                  !s.isMe &&
                  !s.viewed &&
                  chats.some(c => isPhoneMatch(c.phone, s.phone))
                );

                if (recentUpdates.length === 0) return null;

                return (
                  <div className="status-category">
                    <div className="status-category-header">RECENT UPDATES</div>
                    {recentUpdates.map(status => (
                      <div key={status.id} className="status-item-card" onClick={() => {
                        setActiveViewingStatus(status);
                        setStatusList(prev => prev.map(s => s.id === status.id ? { ...s, viewed: true } : s));
                      }}>
                        <div className="status-avatar-outer">
                          <div className="status-avatar-wrapper unviewed">
                            {status.isText ? (
                              <div className="avatar text-status-preview" style={{ backgroundColor: status.bg }}>{status.text}</div>
                            ) : (
                              <img src={status.avatarImage || 'https://via.placeholder.com/50'} alt={status.name} className="avatar" />
                            )}
                          </div>
                        </div>
                        <div className="status-item-info">
                          <div className="status-name">{status.name}</div>
                          <div className="status-time">{status.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Viewed Updates - Only for saved contacts */}
              {(() => {
                const viewedUpdates = statusList.filter(s =>
                  !s.isMe &&
                  s.viewed &&
                  chats.some(c => isPhoneMatch(c.phone, s.phone))
                );

                if (viewedUpdates.length === 0) return null;

                return (
                  <div className="status-category">
                    <div className="status-category-header">VIEWED UPDATES</div>
                    {viewedUpdates.map(status => (
                      <div key={status.id} className="status-item-card" onClick={() => setActiveViewingStatus(status)}>
                        <div className="status-avatar-outer">
                          <div className="status-avatar-wrapper viewed">
                            {status.isText ? (
                              <div className="avatar text-status-preview" style={{ backgroundColor: status.bg }}>{status.text}</div>
                            ) : (
                              <img src={status.avatarImage || 'https://via.placeholder.com/50'} alt={status.name} className="avatar" />
                            )}
                          </div>
                        </div>
                        <div className="status-item-info">
                          <div className="status-name">{status.name}</div>
                          <div className="status-time">{status.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Status FABs */}
            <div className="status-fabs-container">
              <button className="fab-secondary" onClick={() => setIsWritingTextStatus(true)} title="Text Status">
                <Icons.Edit />
              </button>
              <button className="fab-primary" onClick={() => statusInputRef.current.click()} title="Add Media Status">
                <Icons.Camera />
              </button>
            </div>
          </div>
        )}

        {view === 'calls' && (
          <div className="calls-view">
            <div className="sidebar-view-header" style={{ backgroundColor: 'var(--header-bg)', color: 'var(--text-primary)' }}>
              <button className="icon-btn" onClick={() => setView('chat-list')}><Icons.Back /></button>
              <h3 style={{ margin: 0, marginLeft: '10px' }}>Calls</h3>
            </div>

            <div className="calls-list modern-scroll">
              {(!callLogs || callLogs.length === 0) ? (
                <div className="no-chat-selected" style={{ height: '300px', background: 'transparent' }}>
                  <p>No recent calls</p>
                </div>
              ) : (
                callLogs.map((log) => {
                  const contact = chats.find(c => normalizePhone(c.phone) === normalizePhone(log.remoteId));
                  const name = contact ? contact.name : log.remoteId;
                  return (
                    <div key={log.id} className="call-log-item" onClick={() => startCall(log.remoteId, log.callType === 'video')}>
                      <div className="avatar">{contact ? renderAvatar(contact) : log.remoteId[0].toUpperCase()}</div>
                      <div className="call-info">
                        <div className="call-name">{name}</div>
                        <div className="call-meta">
                          <span className={log.type}>
                            {log.type === 'outgoing' ? '↗' : '↙'}
                          </span>
                          <span className="call-time">{log.time}</span>
                        </div>
                      </div>
                      <div className="call-icon-action">
                        {log.callType === 'video' ? <Icons.Video /> : <Icons.Phone />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {view === 'community' && (
          <div className="community-view">
            <div className="sidebar-view-header" style={{ backgroundColor: 'var(--header-bg)', color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button className="icon-btn" onClick={() => setView('chat-list')}><Icons.Back /></button>
                <h3 style={{ margin: 0, marginLeft: '10px', fontSize: '19px' }}>Communities</h3>
              </div>
            </div>

            <div className="community-list modern-scroll">
              <div className="new-community-item">
                <div className="community-icon-bg"><Icons.Plus /></div>
                <div className="community-info">
                  <div className="community-name">New Community</div>
                </div>
              </div>

              {communityList.map(comm => (
                <div key={comm.id} className="community-card">
                  <div className="community-main">
                    <div className="avatar" style={{ borderRadius: '12px' }}>{comm.avatar}</div>
                    <div className="community-info">
                      <div className="community-name">{comm.name}</div>
                      <div className="community-last">{comm.last}</div>
                    </div>
                  </div>
                  <div className="community-sub-groups">
                    {comm.groups.map((group, idx) => (
                      <div key={idx} className="community-group-item">
                        <Icons.Megaphone />
                        <span>{group}</span>
                      </div>
                    ))}
                    <div className="community-view-all">
                      <Icons.Next style={{ transform: 'rotate(90deg)', width: '14px' }} />
                      <span>View all</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'archived' && (
          <div className="chat-list">
            <div className="archived-view-header">
              <button className="icon-btn" onClick={() => setView('chat-list')}><Icons.Back /></button>
              <h3>Archived</h3>
            </div>
            <div className="archived-description">
              These chats stay archived when new messages arrive.
            </div>
            {filteredChats.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No archived chats</div>
            ) : (
              filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  className={`chat-item ${activeChatId === chat.id ? "active" : ""} ${selectedChatId === chat.id ? "selected" : ""}`}
                  onClick={() => {
                    if (selectedChatId) {
                      selectedChatId === chat.id ? handleClearSelection() : setSelectedChatId(chat.id);
                    } else {
                      setActiveChatId(chat.id);
                      setShowContactInfo(false);
                    }
                  }}
                  onContextMenu={(e) => handleChatContextMenu(e, chat.id)}
                >
                  <div className="avatar">{renderAvatar(chat)}</div>
                  <div className="chat-info">
                    <div className="chat-top">
                      <span className="name">{chat.name}</span>
                      <span className="time">{chat.time}</span>
                    </div>
                    <div className="chat-bottom">
                      <div className="last-msg">
                        {chat.muted && <span className="status-icon"><Icons.Mute /></span>}
                        {chat.last}
                      </div>
                      <div className="chat-meta">
                        <button
                          className="unarchive-btn-small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveChat(chat.id);
                          }}
                          title="Unarchive Chat"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal-green)', padding: '5px' }}
                        >
                          <Icons.Unarchive />
                        </button>
                        <span className="unread-badge" style={{ background: 'var(--text-secondary)', color: 'white' }}>Archived</span>
                      </div>
                    </div>
                  </div>
                  {selectedChatId === chat.id && <div className="selection-check">✔️</div>}
                </div>
              ))
            )}
          </div>
        )}

        {view === 'chat-list' && (
          <>
            {isAddingContact && (
              <div className="add-contact-box" style={{ flexDirection: 'column', gap: '10px' }}>
                <input
                  autoFocus
                  placeholder="Contact Name"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '5px', width: '100%' }}>
                  <input
                    placeholder="Phone (10 digits)"
                    value={newContactPhone}
                    maxLength={10}
                    onChange={(e) => setNewContactPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    onKeyDown={(e) => e.key === "Enter" && handleAddContact()}
                  />
                  <button onClick={handleAddContact}>Add</button>
                </div>
              </div>
            )}

            <div className="search-bar">
              <div className="search-icon"><Icons.Search /></div>
              <input
                placeholder="Search or start new chat"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Locked Chats Row */}
            {chats.some(c => c.locked) && !searchQuery && (
              <div className="archived-row" onClick={() => setView('locked')} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <div className="archived-icon" style={{ color: 'var(--teal-green)' }}><Icons.Lock /></div>
                <span>Locked Chats</span>
                <span className="archived-count">{chats.filter(c => c.locked).length}</span>
              </div>
            )}

            {/* Archived Row */}
            {chats.some(c => c.archived) && !searchQuery && (
              <div className="archived-row" onClick={() => setView('archived')}>
                <div className="archived-icon"><Icons.Archive /></div>
                <span>Archived</span>
                <span className="archived-count">{chats.filter(c => c.archived).length}</span>
              </div>
            )}

            <div className="chat-list">
              <AnimatePresence>
                {filteredChats.map((chat) => (
                  <motion.div
                    key={chat.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`chat-item ${activeChatId === chat.id ? "active" : ""} ${selectedChatId === chat.id ? "selected" : ""}`}
                    onClick={() => {
                      if (selectedChatId) {
                        selectedChatId === chat.id ? handleClearSelection() : setSelectedChatId(chat.id);
                      } else {
                        setActiveChatId(chat.id);
                        setShowContactInfo(false);
                      }
                    }}
                    onContextMenu={(e) => handleChatContextMenu(e, chat.id)}
                  >
                    <div className="avatar">{renderAvatar(chat)}</div>
                    <div className="chat-info">
                      <div className="chat-top">
                        <span className="name" style={{ color: userMoods[normalizePhone(chat.phone)]?.color || 'inherit' }}>
                          {chat.name}
                          {userMoods[normalizePhone(chat.phone)]?.icon && <span className="mood-indicator-small">{userMoods[normalizePhone(chat.phone)].icon}</span>}
                        </span>
                        <span className="time">{chat.time}</span>
                      </div>
                      <div className="chat-bottom">
                        <div className={`last-msg ${typingUsers[normalizePhone(chat.phone)] ? "typing-color" : ""}`}>
                          {chat.muted && <span className="status-icon"><Icons.Mute /></span>}
                          {typingUsers[normalizePhone(chat.phone)] ? "typing..." : chat.last}
                        </div>
                        <div className="chat-meta">
                          {chat.locked && <span className="lock-icon"><Icons.Lock /></span>}
                          {chat.pinned && <span className="pin-icon"><Icons.Pin /></span>}
                          {chat.unread > 0 && <span className="unread-tick-indicator"><Icons.DoubleCheck /></span>}
                        </div>
                      </div>
                    </div>
                    {selectedChatId === chat.id && <div className="selection-check">✔️</div>}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
        {/* Bottom Navigation with Icons */}
        <div className="sidebar-tabs">
          <div
            className={`tab-item ${['chat-list', 'profile'].includes(view) ? 'active' : ''}`}
            onClick={() => setView('chat-list')}
            title="Chats"
          >
            <Icons.Chat />
          </div>
          <div
            className={`tab-item ${view === 'status' ? 'active' : ''}`}
            onClick={() => setView('status')}
            title="Status"
          >
            <Icons.Status />
          </div>
          <div
            className={`tab-item ${view === 'calls' ? 'active' : ''}`}
            onClick={() => setView('calls')}
            title="Calls"
          >
            <Icons.Phone />
          </div>
          <div
            className={`tab-item ${view === 'community' ? 'active' : ''}`}
            onClick={() => setView('community')}
            title="Communities"
          >
            <Icons.Communities />
          </div>
        </div>
      </aside>

      {/* Chat Window */}
      <section className="chat-window">
        {activeChatId ? (
          <>
            <div className="chat-header">
              <div
                className="chat-header-user-area"
                onClick={() => setShowContactInfo(!showContactInfo)}
                title="Click to view contact info"
              >
                <div className="avatar">{renderAvatar(activeChat)}</div>
                <div className="chat-header-info">
                  <h3 style={{ color: userMoods[normalizePhone(activeChat?.phone)]?.color || 'inherit' }}>
                    {activeChat?.name}
                    {userMoods[normalizePhone(activeChat?.phone)]?.icon && <span style={{ marginLeft: '8px' }}>{userMoods[normalizePhone(activeChat?.phone)].icon}</span>}
                  </h3>
                  <p className="status-text">{typingUsers[normalizePhone(activeChat?.phone)] ? "typing..." : onlineStatus}</p>
                </div>
              </div>

              <div className="chat-header-actions">
                <button onClick={() => startCall(activeChat?.phone || "user2", true)} title="Video Call"><Icons.Video /></button>
                <button onClick={() => startCall(activeChat?.phone || "user2", false)} title="Voice Call"><Icons.Phone /></button>
                <button><Icons.Search /></button>
                <button onClick={() => setShowContactInfo(!showContactInfo)}><Icons.Menu /></button>
              </div>
            </div>

            <div
              className="chat-body-container"
              style={{
                backgroundColor: !chats.find(c => c.id === activeChatId)?.wallpaper?.startsWith('data:image') ? (chats.find(c => c.id === activeChatId)?.wallpaper || 'transparent') : 'transparent',
                backgroundImage: chats.find(c => c.id === activeChatId)?.wallpaper?.startsWith('data:image') ? `url(${chats.find(c => c.id === activeChatId).wallpaper})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              <div className="messages-area">
                {groupMessagesByDate(currentMessages).map((item, i) => {
                  if (item.type === 'date') {
                    return (
                      <div key={`date-${i}`} className="message-date-divider">
                        <span>{item.label}</span>
                      </div>
                    );
                  }

                  const msg = item.data;
                  const originalMsgIndex = currentMessages.findIndex(m => m.id === msg.id);
                  return (
                    <motion.div
                      key={msg.id || `msg-${i}`}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className={`message-row ${msg.type}`}
                      onDoubleClick={() => handleMessageDoubleClick(originalMsgIndex)}
                    >
                      <div className={`message-bubble ${msg.status === 'pending' ? 'pending' : ''}`}>
                        {msg.quotedMsg && (
                          <div className="quoted-msg-container">
                            <div className="quoted-sender">{msg.quotedMsg.sender}</div>
                            <div className="quoted-text">{msg.quotedMsg.text}</div>
                          </div>
                        )}
                        {activeChat?.isGroup && msg.type === 'received' && (
                          <div className="sender-name" style={{ color: 'var(--teal-green)', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                            {msg.senderName || activeChat?.name}
                          </div>
                        )}
                        {msg.dataType === 'image' ? (
                          <img src={msg.text} alt="Shared" className="shared-image" />
                        ) : (
                          msg.text
                        )}
                        <div className="msg-status-line">
                          <span className="msg-time">{msg.time}</span>
                          {msg.type === 'sent' && (
                            <span className={`msg-status-ticks ${msg.status === 'delivered' ? 'delivered' : 'sent'}`}>
                              {msg.status === 'delivered' ? <Icons.DoubleCheck /> : <Icons.Check />}
                            </span>
                          )}
                        </div>
                        {msg.reaction && <div className="msg-reaction">{msg.reaction}</div>}

                        {/* Scheduled Indicator */}
                        {msg.status === 'pending' && (
                          <div className="scheduled-indicator">
                            <Icons.Schedule /> Scheduled
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Contact Info Drawer */}
              {/* Contact Info Drawer - PREMIUM REDESIGN */}
              <AnimatePresence>
                {showContactInfo && activeChat && (
                  <motion.div
                    className="contact-info-drawer"
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    <div className="contact-info-header">
                      <button onClick={() => setShowContactInfo(false)} title="Close"><Icons.Back /></button>
                      <h3>Contact Info</h3>
                    </div>

                    <div className="contact-info-content modern-scroll">
                      {/* Hero Section */}
                      <div className="contact-hero">
                        <div className="contact-large-avatar">{renderAvatar(activeChat)}</div>
                        <h2>{activeChat?.name}</h2>
                        <p className="contact-phone">{activeChat?.phone || "+91 98765 43210"}</p>

                        {/* Quick Actions */}
                        <div className="contact-actions-row">
                          <div className="action-item" onClick={() => startCall(activeChat.phone, false)}>
                            <div className="action-btn"><Icons.Phone /></div>
                            <span className="action-label">Audio</span>
                          </div>
                          <div className="action-item" onClick={() => startCall(activeChat.phone, true)}>
                            <div className="action-btn"><Icons.Video /></div>
                            <span className="action-label">Video</span>
                          </div>
                          <div className="action-item">
                            <div className="action-btn"><Icons.Search /></div>
                            <span className="action-label">Search</span>
                          </div>
                        </div>
                      </div>

                      {/* About Section */}
                      <div className="contact-section">
                        <h4>About</h4>
                        <p>{activeChat?.about || "Hey there! I am using WhatsApp."}</p>
                      </div>

                      {/* Wallpaper Section */}
                      <div className="contact-section">
                        <h4>Chat Wallpaper</h4>
                        <div className="wallpaper-picker">
                          {wallpaperColors.map(color => (
                            <div
                              key={color}
                              className={`wallpaper-circle ${chats.find(c => c.id === activeChatId)?.wallpaper === color ? 'selected' : ''}`}
                              style={{ backgroundColor: color }}
                              onClick={() => {
                                setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, wallpaper: color } : c));
                                localStorage.setItem(`wallpaper_${currentPhone}_${activeChatId}`, color);
                              }}
                            />
                          ))}
                          <div
                            className="wallpaper-circle custom-wallpaper-btn"
                            title="Upload Custom Wallpaper"
                            onClick={() => wallpaperInputRef.current?.click()}
                          >
                            <Icons.Plus style={{ width: '20px', color: 'var(--text-secondary)' }} />
                          </div>
                          <input
                            type="file"
                            ref={wallpaperInputRef}
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={handleWallpaperUpload}
                          />
                        </div>
                      </div>

                      {/* Media Section */}
                      <div className="contact-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4>Media, Links and Docs</h4>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>View All</span>
                        </div>
                        <div className="media-gallery">
                          {messages[activeChatId]?.filter(m => m.dataType === 'image').length > 0 ? (
                            messages[activeChatId].filter(m => m.dataType === 'image').slice(0, 6).map((m, idx) => (
                              <img key={idx} src={m.text} alt="Media" className="media-thumbnail" />
                            ))
                          ) : (
                            <div className="no-media-text">No media shared</div>
                          )}
                        </div>
                      </div>

                      {/* Group Members Section */}
                      {activeChat.isGroup && (
                        <div className="contact-section">
                          <h4>Group Members ({activeChat.participants?.length || 0})</h4>
                          <div className="member-list">
                            {activeChat.participants?.map(pId => {
                              const member = chats.find(c => c.id === pId);
                              if (!member) return null;
                              return (
                                <div key={pId} className="member-item">
                                  <div className="avatar" style={{ width: '40px', height: '40px', marginRight: '15px' }}>{renderAvatar(member)}</div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '16px' }}>{member.name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{member.about || "Hey there!"}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Danger Zone */}
                      <div className="contact-section danger-zone">
                        <button className="block-btn" onClick={() => handleBlockChat(activeChat?.id)}>
                          <Icons.Block /> {activeChat?.blocked ? "Unblock" : "Block"} {activeChat?.name}
                        </button>
                        <button className="report-btn">
                          <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}>⚠</span> Report contact
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {activeChat?.blocked ? (
              <div className="blocked-footer" onClick={() => handleBlockChat(activeChat?.id)}>
                You blocked this contact. Tap to unblock.
              </div>
            ) : (
              <div className="input-area-container">
                {replyingTo && (
                  <div className="reply-preview-bar">
                    <div className="reply-preview-content">
                      <div className="reply-preview-sender">{replyingTo.senderName}</div>
                      <div className="reply-preview-text">{replyingTo.text}</div>
                    </div>
                    <button className="reply-close-btn" onClick={() => setReplyingTo(null)}><Icons.Close /></button>
                  </div>
                )}
                <div className="input-area">
                  {/* Emoji Picker */}
                  {showEmojiPicker && (
                    <div className="emoji-picker-container">
                      <EmojiPicker onEmojiClick={onEmojiClick} theme={darkMode ? "dark" : "light"} />
                    </div>
                  )}

                  <button className="icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Icons.Emoji /></button>

                  {/* Scheduler Popup - Proper Design */}
                  {showScheduler && (
                    <div className="scheduler-popup premium-glass">
                      <div className="scheduler-header">
                        <label>Schedule Send</label>
                        <button onClick={() => setShowScheduler(false)} className="icon-btn-white" style={{ padding: 0 }}><Icons.Close /></button>
                      </div>

                      <div className="scheduler-content">
                        <div className="scheduler-quick-select">
                          <button className="quick-btn" onClick={() => {
                            const d = new Date(Date.now() + 5 * 60000);
                            setSchedulerInput({ date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5) });
                          }}><span>⏱️</span> +5m</button>
                          <button className="quick-btn" onClick={() => {
                            const d = new Date(Date.now() + 60 * 60000);
                            setSchedulerInput({ date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5) });
                          }}><span>🚀</span> +1h</button>
                          <button className="quick-btn" onClick={() => {
                            const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
                            setSchedulerInput({ date: d.toISOString().split('T')[0], time: "09:00" });
                          }}><span>🌅</span> Tomorrow</button>
                          <button className="quick-btn" onClick={() => {
                            const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0);
                            setSchedulerInput({ date: d.toISOString().split('T')[0], time: "09:00" });
                          }}><span>🗓️</span> Next Week</button>
                        </div>

                        <div className="scheduler-fields">
                          <div className="field-group">
                            <label>Pick Date</label>
                            <input type="date" value={schedulerInput.date} onChange={(e) => setSchedulerInput({ ...schedulerInput, date: e.target.value })} />
                          </div>
                          <div className="field-group">
                            <label>Pick Time</label>
                            <input type="time" value={schedulerInput.time} onChange={(e) => setSchedulerInput({ ...schedulerInput, time: e.target.value })} />
                          </div>
                        </div>

                        <button className="schedule-confirm-btn" onClick={() => {
                          if (!schedulerInput.date || !schedulerInput.time) return toast.error("Please pick date and time");
                          const scheduledTime = new Date(`${schedulerInput.date}T${schedulerInput.time}`).getTime();
                          if (scheduledTime < Date.now()) return toast.error("Time must be in the future");
                          handleSendMessage(input, 'text', activeChatId, scheduledTime);
                          setShowScheduler(false);
                          setSchedulerInput({ date: "", time: "" });
                        }}>
                          <Icons.Schedule style={{ width: '18px', height: '18px' }} />
                          Confirm Schedule
                        </button>
                      </div>
                    </div>
                  )}
                  <button className="icon-btn" onClick={() => setShowScheduler(!showScheduler)} title="Schedule Message">
                    <Icons.Schedule />
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleFileUpload}
                  />
                  <button className="icon-btn" onClick={() => fileInputRef.current?.click()}><Icons.Attach /></button>

                  <input
                    type="text"
                    placeholder="Type a message"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  />
                  <button className="send-btn" onClick={() => handleSendMessage()}><Icons.Send /></button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-chat-state">
            <svg viewBox="0 0 33 33" width="90" height="90" style={{ color: '#b1b3b5', marginBottom: '20px' }}>
              <path fill="currentColor" d="M16.6 0C7.4 0 0 7.4 0 16.5c0 2.9.8 5.7 2.2 8.2L.6 33l8.5-2.2c2.4 1.3 5.1 2 7.9 2 9.2 0 16.6-7.4 16.6-16.5S25.8 0 16.6 0zm0 29.8c-2.5 0-4.9-.7-7.1-1.9l-.5-.3-5.3 1.4 1.4-5.1-.3-.5C3.7 21.2 2.9 18.9 2.9 16.5c0-7.6 6.2-13.7 13.7-13.7s13.7 6.2 13.7 13.7-6.1 13.3-13.7 13.3zM24 20.7c-.4-.2-2.3-1.1-2.7-1.3-.4-.2-.6-.3-.9.1-.3.4-1 1.3-1.2 1.5-.2.3-.5.3-.9.1-1.9-1-3.2-1.7-4.5-3.9-.2-.3 0-.5.2-.7.2-.2.4-.4.6-.6.2-.2.3-.4.4-.6.1-.2.1-.4 0-.6-.1-.1-.8-2-.9-2.8-.2-.7-.5-.6-.7-.6h-.6c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9 0 1.7 1.2 3.4 1.4 3.7.2.2 2.4 3.7 5.8 5.2 2 .9 2.8.9 3.8.8 1.1-.1 2.3-.9 2.6-1.8.3-.9.3-1.7.2-1.8-.1-.2-.4-.3-.8-.5z" />
            </svg>
            <h2>WhatsApp Web</h2>
            <p>
              Send and receive messages without keeping your phone online.<br />
              Select a chat to start messaging.
            </p>
            <div className="encrypted-text" style={{ marginTop: '32px', fontSize: '13px' }}>
              🔒 End-to-end encrypted
            </div>
          </div>
        )}

      </section>
    </div>
  );
}

export default Chat;
