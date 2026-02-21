import React, { createContext, useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import toast from 'react-hot-toast';

export const CallContext = createContext();

export const CallProvider = ({ children }) => {
    const [peer, setPeer] = useState(null);
    const [myPeerId, setMyPeerId] = useState(null);
    const [call, setCall] = useState(null);
    const [incomingCall, setIncomingCall] = useState(null);
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callLogs, setCallLogs] = useState([]);
    const [isCurrentCallVideo, setIsCurrentCallVideo] = useState(false);

    const currentPhone = localStorage.getItem("phone");
    const remoteVideoRef = useRef();
    const myVideoRef = useRef();

    // Persistence: Load logs
    useEffect(() => {
        if (!currentPhone) return;
        const savedLogs = localStorage.getItem(`call_logs_${currentPhone}`);
        if (savedLogs) {
            try {
                setCallLogs(JSON.parse(savedLogs));
            } catch (e) {
                setCallLogs([]);
            }
        }
    }, [currentPhone]);

    // Persistence: Save logs
    useEffect(() => {
        if (!currentPhone) return;
        localStorage.setItem(`call_logs_${currentPhone}`, JSON.stringify(callLogs));
    }, [callLogs, currentPhone]);

    const addCallLog = (remoteId, type, callType = 'video', status = 'completed') => {
        const newLog = {
            id: Date.now(),
            remoteId,
            type, // 'outgoing', 'incoming'
            callType, // 'video', 'voice'
            status, // 'completed', 'missed', 'rejected'
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setCallLogs(prev => [newLog, ...prev]);
    };

    useEffect(() => {
        if (!currentPhone) return;

        // Initialize Peer with phone number as ID (cleaning it to be safe for ID)
        const cleanId = currentPhone.replace(/[^a-zA-Z0-9]/g, '');
        const newPeer = new Peer(cleanId);

        newPeer.on('open', (id) => {
            console.log('My Peer ID is: ' + id);
            setMyPeerId(id);
        });

        newPeer.on('call', (incoming) => {
            console.log('Incoming call from:', incoming.peer);
            setIncomingCall(incoming);
            // In a real app, we'd signal whether it was video/voice
            // For now, let's assume video if incoming, or we can look at metadata if we had it
            // We'll default to video for logging incoming for now, or just leave it
            addCallLog(incoming.peer, 'incoming', 'video');
            setIsCurrentCallVideo(true);
        });

        setPeer(newPeer);

        return () => {
            newPeer.destroy();
        };
    }, [currentPhone]);

    const answerCall = async (isVideo = true) => {
        if (!incomingCall) return;
        setIsCurrentCallVideo(isVideo);

        try {
            const myStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
            setStream(myStream);
            if (myVideoRef.current && isVideo) myVideoRef.current.srcObject = myStream;

            incomingCall.answer(myStream);

            incomingCall.on('stream', (remoteStream) => {
                setRemoteStream(remoteStream);
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
            });

            setCall(incomingCall);
            setIncomingCall(null);
        } catch (err) {
            console.error("Error answering call:", err);
            toast.error("Could not access media: " + err.message);
        }
    };

    const startCall = async (remotePhone, isVideo = true) => {
        if (!peer) return;
        const cleanRemoteId = remotePhone.replace(/[^a-zA-Z0-9]/g, '');
        setIsCurrentCallVideo(isVideo);

        try {
            const myStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
            setStream(myStream);
            if (myVideoRef.current && isVideo) myVideoRef.current.srcObject = myStream;

            const outgoingCall = peer.call(cleanRemoteId, myStream, {
                metadata: { isVideo }
            });

            if (!outgoingCall) {
                toast.error("Call failed to start");
                return;
            }

            addCallLog(cleanRemoteId, 'outgoing', isVideo ? 'video' : 'voice');

            outgoingCall.on('stream', (remoteStream) => {
                setRemoteStream(remoteStream);
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
            });

            outgoingCall.on('error', (err) => {
                console.error("Call error:", err);
                toast.error("Call error: " + err.message);
                endCall();
            });

            setCall(outgoingCall);
        } catch (err) {
            console.error("Error starting call:", err);
            toast.error("Could not access media: " + err.message);
        }
    };

    const endCall = () => {
        if (call) call.close();
        if (stream) stream.getTracks().forEach(track => track.stop());
        setCall(null);
        setIncomingCall(null);
        setStream(null);
        setRemoteStream(null);
        setIsCurrentCallVideo(false);
    };

    return (
        <CallContext.Provider value={{
            peer,
            myPeerId,
            call,
            incomingCall,
            stream,
            remoteStream,
            callLogs,
            isCurrentCallVideo,
            answerCall,
            startCall,
            endCall,
            myVideoRef,
            remoteVideoRef
        }}>
            {children}
        </CallContext.Provider>
    );
};
