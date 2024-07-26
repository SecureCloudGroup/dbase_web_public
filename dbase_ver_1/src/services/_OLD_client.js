import { getLocalStoreHandle } from './indexeddb';
import { AppContext } from '../context/AppContext';

let localConnection;
let sendChannel;
let receiveChannel;
let websocket;
let myLocalPeerId;
let targetPeerId;
let remoteIceCandidates = [];
let peerConnections = {};

const log = console.log;
const server_address = 'api.securecloudgroup.com';
const turn_api = '725649c5ea4be63aff9781ecf3f1d69cab36';

const fetchTurnCredentials = async () => {
    try {
        const response = await fetch(`https://scg_test_1.metered.live/api/v1/turn/credentials?apiKey=${turn_api}`);
        if (!response.ok) throw new Error('Failed to fetch TURN server credentials');
        
        const turnServers = await response.json();
        return [
            ...turnServers,
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ];
    } catch (error) {
        log('Error fetching TURN server credentials:', error);
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ];
    }
};

const initializeWebSocket = (peerId, setWsConnected, setReadyToCommunicate) => {
    setWsConnected(false);
    log('client - initializeWebSocket - wsConnect: False');

    return new Promise((resolve, reject) => {
        const wsUrl = `wss://${server_address}/ws/${peerId}`;
        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
            log('client - initializeWebSocket - WebSocket connection opened');
            setWsConnected(true);
            resolve();
        };

        websocket.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            log('client - websocket.onmessage - Received message from WebSocket:', data);

            if (data.offer) {
                await handleOffer(data.offer, data.source_id, setReadyToCommunicate);
            } else if (data.answer) {
                await handleAnswer(data.answer, data.source_id);
            } else if (data.candidate) {
                await handleCandidate(data.candidate, data.source_id);
            }
        };

        websocket.onclose = (event) => {
            log('client - websocket.onclose - WebSocket connection closed', event);
            setWsConnected(false);
            reject();
        };

        websocket.onerror = (error) => {
            log('client - websocket.onerror - WebSocket error:', error);
            setWsConnected(false);
            reject();
        };
    });
};

export const initializeWebRTC = async (currentLocalPeerId, setWsConnected, setReadyToCommunicate) => {
    myLocalPeerId = currentLocalPeerId;
    log('client - initializeWebRTC - Initializing WebRTC for peer:', myLocalPeerId);

    try {
        await initializeWebSocket(myLocalPeerId, setWsConnected, setReadyToCommunicate);
    } catch (error) {
        log('client - initializeWebRTC - Error initializing WebSocket:', error);
    }
};

export const setTargetPeerId = (targetId, setReadyToCommunicate) => {
    targetPeerId = targetId;
    log('client - setTargetPeerId - targetPeerId set to:', targetPeerId);
    if (myLocalPeerId && targetPeerId) {
        setupWebRTC(setReadyToCommunicate);
    }
};

export const sendMessage = (message) => {
    log('client - sendMessage - message:', message);
    if (sendChannel && sendChannel.readyState === 'open') {
        sendChannel.send(JSON.stringify({ type: 'text', content: message }));
        log('client - sendMessage - Sent message:', message);
    } else {
        log('client - sendMessage - Data channel is not open. Message not sent.');
    }
};

const sendSignalMessage = async (message) => {
    log('client - sendSignalMessage - message:', message);
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        await websocket.send(JSON.stringify(message));
        log('client - sendSignalMessage - Sent signaling message:', message);
    } else {
        log('client - sendSignalMessage - WebSocket is not open. Signaling message not sent.');
    }
};

const handleSendChannelStatusChange = async (setReadyToCommunicate) => {
    if (sendChannel) {
        const state = sendChannel.readyState;
        log('client - handleSendChannelStatusChange - Send channel state is:', state);
        if (typeof setReadyToCommunicate === 'function') {
            setReadyToCommunicate(state === 'open');
        }
    }
};

const handleReceiveChannelStatusChange = async (setReadyToCommunicate) => {
    if (receiveChannel) {
        const state = receiveChannel.readyState;
        log('client - handleReceiveChannelStatusChange - Receive channel state is:', state);
        if (typeof setReadyToCommunicate === 'function') {
            setReadyToCommunicate(state === 'open');
        }
    }
};

const setupWebRTC = async (setReadyToCommunicate) => {
    log('client - setupWebRTC - Starting setup');

    const iceServers = await fetchTurnCredentials();
    log('client - setupWebRTC - iceServers: ', iceServers);

    localConnection = new RTCPeerConnection({ iceServers });
    peerConnections[targetPeerId] = localConnection;
    log('client - setupWebRTC - RTCPeerConnection created:', localConnection);

    sendChannel = localConnection.createDataChannel("fileTransfer");
    log('client - setupWebRTC - Data channel created:', sendChannel);

    sendChannel.onopen = () => handleSendChannelStatusChange(setReadyToCommunicate);
    sendChannel.onclose = () => handleSendChannelStatusChange(setReadyToCommunicate);
    sendChannel.onerror = (error) => log('client - sendChannel.onerror - Data channel error:', error);
    sendChannel.onmessage = (event) => log('client - sendChannel.onmessage - Data channel message received:', event.data);

    localConnection.ondatachannel = (event) => {
        log('client - localConnection.ondatachannel - Data channel received:', event.channel);
        receiveChannel = event.channel;
        receiveChannel.onopen = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onclose = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onerror = (error) => log('client - receiveChannel.onerror - Receive channel error:', error);
    };

    localConnection.onicecandidate = (event) => {
        if (event.candidate) {
            log('client - localConnection.onicecandidate - ICE candidate generated:', event.candidate);
            sendSignalMessage({ candidate: event.candidate, target_id: targetPeerId });
        }
    };

    localConnection.oniceconnectionstatechange = () => {
        log('client - localConnection.oniceconnectionstatechange - ICE connection state change:', localConnection.iceConnectionState);
        if (localConnection.iceConnectionState === 'failed' || localConnection.iceConnectionState === 'disconnected') {
            if (typeof setReadyToCommunicate === 'function') {
                setReadyToCommunicate(false);
            }
        }
    };

    localConnection.onicegatheringstatechange = () => log('client - localConnection.onicegatheringstatechange - ICE gathering state change:', localConnection.iceGatheringState);

    localConnection.onsignalingstatechange = () => log('client - localConnection.onsignalingstatechange - Signaling state change:', localConnection.signalingState);

    try {
        const offer = await localConnection.createOffer();
        log('client - setupWebRTC - Creating offer:', offer);
        await localConnection.setLocalDescription(offer);
        log('client - setupWebRTC - Local description set:', localConnection.localDescription);
        sendSignalMessage({ offer: localConnection.localDescription, target_id: targetPeerId });
    } catch (error) {
        log('client - setupWebRTC - Error creating offer:', error);
    }
};

const handleOffer = async (offer, source_id, setReadyToCommunicate) => {
    log('client - handleOffer - offer:', offer);
    log('client - handleOffer - source_id:', source_id);

    const iceServers = await fetchTurnCredentials();
    const peerConnection = new RTCPeerConnection({ iceServers });

    peerConnections[source_id] = peerConnection;
    log('client - handleOffer - RTCPeerConnection created for handling offer:', peerConnection);

    peerConnection.ondatachannel = (event) => {
        log('client - handleOffer - Data channel received:', event.channel);
        receiveChannel = event.channel;
        receiveChannel.onopen = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onclose = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onerror = (error) => log('client - receiveChannel.onerror - Receive channel error:', error);
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            log('client - handleOffer - ICE candidate generated:', event.candidate);
            sendSignalMessage({ candidate: event.candidate, target_id: source_id });
        }
    };

    peerConnection.oniceconnectionstatechange = () => log('client - handleOffer - ICE connection state change:', peerConnection.iceConnectionState);

    peerConnection.onicegatheringstatechange = () => log('client - handleOffer - ICE gathering state change:', peerConnection.iceGatheringState);

    peerConnection.onsignalingstatechange = () => log('client - handleOffer - Signaling state change:', peerConnection.signalingState);

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        log('client - handleOffer - Remote description set for offer:', offer);

        const answer = await peerConnection.createAnswer();
        log('client - handleOffer - Creating answer:', answer);
        await peerConnection.setLocalDescription(answer);
        log('client - handleOffer - Local description set for answer:', peerConnection.localDescription);
        sendSignalMessage({ answer: peerConnection.localDescription, target_id: source_id });
    } catch (error) {
        log('client - handleOffer - Error handling offer:', error);
    }
};

const handleAnswer = async (answer, source_id) => {
    log('client - handleAnswer - answer:', answer);
    try {
        const peerConnection = peerConnections[source_id];
        if (!peerConnection) throw new Error(`PeerConnection not found for source_id: ${source_id}`);
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        log('client - handleAnswer - Remote description set for answer:', answer);
        processPendingIceCandidates(source_id);
    } catch (error) {
        log('client - handleAnswer - Error handling answer:', error);
    }
};

const handleCandidate = async (candidate, source_id) => {
    log('client - handleCandidate - candidate:', candidate);
    try {
        const peerConnection = peerConnections[source_id];
        if (!peerConnection) throw new Error(`PeerConnection not found for source_id: ${source_id}`);
        
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        log('client - handleCandidate - ICE candidate added:', candidate);
    } catch (error) {
        log('client - handleCandidate - Error handling ICE candidate:', error);
    }
};

let receivedBuffers = {}; // Track received chunks for each key
let receivedSizes = {}; // Track total sizes of received chunks for each key

const storeReceivedChunk = async (peerStoreFolder, folderName, chunkData) => {
    try {
        log('client - storeReceivedChunk - peerStoreFolder: ', peerStoreFolder);
        log('client - storeReceivedChunk - folderName: ', folderName);
        log('client - storeReceivedChunk - chunkData: ', chunkData);

        if (!peerStoreFolder || !folderName || !chunkData) throw new Error('Invalid input parameters');

        const directoryHandle = await peerStoreFolder.getDirectoryHandle(folderName, { create: true });
        log('client - storeReceivedChunk - directoryHandle: ', directoryHandle);

        const { owner, fileName, chunkIndex, chunkCID, encryptedChunk, encryptionMethod } = chunkData;
        log('client - storeReceivedChunk - owner: ', owner);
        log('client - storeReceivedChunk - fileName: ', fileName);
        log('client - storeReceivedChunk - chunkIndex: ', chunkIndex);
        log('client - storeReceivedChunk - chunkCID: ', chunkCID);
        log('client - storeReceivedChunk - encryptedChunk: ', encryptedChunk);
        log('client - storeReceivedChunk - encryptionMethod: ', encryptionMethod);

        if (!chunkCID || !encryptedChunk) throw new Error('Invalid chunk data');

        const chunkFileHandle = await directoryHandle.getFileHandle(chunkCID, { create: true });
        const writableStream = await chunkFileHandle.createWritable();
        await writableStream.write(new Blob([JSON.stringify(encryptedChunk)], { type: 'application/json' }));
        await writableStream.close();

        const metaFileName = `${chunkCID}_meta.json`;
        const metaFileHandle = await directoryHandle.getFileHandle(metaFileName, { create: true });

        const metadata = { owner, fileName, chunkCID, chunkIndex, encryptionMethod };
        const metaWritableStream = await metaFileHandle.createWritable();
        await metaWritableStream.write(new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        await metaWritableStream.close();
    } catch (error) {
        log('client - storeReceivedChunk - Error storing received chunk:', error);
    }
};

const processPendingIceCandidates = async (source_id) => {
    log('client - processPendingIceCandidates - Processing pending ICE candidates for:', source_id);
    for (const candidate of remoteIceCandidates) {
        try {
            const peerConnection = peerConnections[source_id];
            if (!peerConnection) throw new Error(`PeerConnection not found for source_id: ${source_id}`);
            
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            log('client - processPendingIceCandidates - Processed pending ICE candidate:', candidate);
        } catch (error) {
            log('client - processPendingIceCandidates - Error processing pending ICE candidate:', error);
        }
    }
    remoteIceCandidates = [];
};

export const copy_file_to_peers = async (setReadyToCommunicate, list_of_peers, kvPairs, peerStoreFolder) => {
    log('client - copy_file_to_peers called - list_of_peers: ', list_of_peers);
    log('client - copy_file_to_peers called - kvPairs: ', kvPairs);
    log('client - copy_file_to_peers called - peerStoreFolder: ', peerStoreFolder);

    for (const peerId of list_of_peers) {
        await establishPeerConnection(setReadyToCommunicate, peerId, kvPairs, peerStoreFolder);
    }
};

const establishPeerConnection = async (setReadyToCommunicate, peerId, kvPairs, peerStoreFolder) => {
    log('client - establishPeerConnection called - peerId: ', peerId);
    log('client - establishPeerConnection called - peerStoreFolder: ', peerStoreFolder);

    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        try {
            await initializeWebSocket(myLocalPeerId, () => log('client - WebSocket reinitialized for peer connection'), setReadyToCommunicate);
        } catch (error) {
            log('client - establishPeerConnection - Error initializing WebSocket:', error);
            return;
        }
    }

    const iceServers = await fetchTurnCredentials();
    log('client - establishPeerConnection - iceServers: ', iceServers);

    const peerConnection = new RTCPeerConnection({ iceServers });
    peerConnections[peerId] = peerConnection;

    sendChannel = peerConnection.createDataChannel("fileTransfer");
    
    const MAX_CHUNK_SIZE = 16 * 1024;

    sendChannel.onopen = () => {
        for (const kv of kvPairs) {
            log('client - establishPeerConnection - Sent file chunk:', kv);
            const kvString = JSON.stringify(kv);
            const kvBuffer = new TextEncoder().encode(kvString);
            log('client - establishPeerConnection - Size of serialized key-value pair (bytes):', kvBuffer.length);

            for (let i = 0; i < kvBuffer.length; i += MAX_CHUNK_SIZE) {
                const chunk = kvBuffer.slice(i, i + MAX_CHUNK_SIZE);
                sendChannel.send(chunk);
                log('client - establishPeerConnection - Sent chunk:', chunk);
            }
        }
    };

    peerConnection.ondatachannel = (event) => {
        log('client - establishPeerConnection - Data channel received:', event.channel);
        receiveChannel = event.channel;
        receiveChannel.onopen = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onclose = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onerror = (error) => log('client - receiveChannel.onerror - Receive channel error:', error);
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            log('client - peerConnection.onicecandidate - ICE candidate generated:', event.candidate);
            sendSignalMessage({ candidate: event.candidate, target_id: peerId });
        }
    };

    try {
        const offer = await peerConnection.createOffer();
        log('client - establishPeerConnection - Creating offer:', offer);
        await peerConnection.setLocalDescription(offer);
        log('client - establishPeerConnection - Local description set:', peerConnection.localDescription);
        sendSignalMessage({ offer: peerConnection.localDescription, target_id: peerId });
    } catch (error) {
        log('client - establishPeerConnection - Error creating offer:', error);
    }
};
