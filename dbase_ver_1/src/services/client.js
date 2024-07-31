import { getLocalStoreHandle } from './indexeddb';
import { v4 as uuidv4 } from 'uuid';

let localConnection;
let sendChannel;
let receiveChannel;

let websocket = null;
let isConnecting = false;
const RECONNECT_INTERVAL = 5000; // Reconnect every 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectAttempts = 0;
const HEARTBEAT_INTERVAL = 60000; // 60 seconds
let heartbeatInterval = null;

let myLocalPeerId;
let targetPeerId;
let remoteIceCandidates = [];
let peerConnections = {};

let handleTextMessageCallback;
let handleDataMessageCallback;
let pendingIceCandidates = {};

const log = console.log;
const server_address = 'api.securecloudgroup.com';

const getCurrentTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
};



const fetchTurnCredentials = async () => {
    try {
        const response = await fetch(`https://api.securecloudgroup.com/fetch_turn_credentials`);
        if (!response.ok) {
            log('client - fetchTurnCredentials - ERROR');
            throw new Error('Failed to fetch TURN server credentials');
        }
        const turnServers = await response.json();
        // log('client - fetchTurnCredentials - turnServers: ', turnServers);
        // Add STUN servers to the list
        const iceServers = [
            ...turnServers,
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ];
        log('client - fetchTurnCredentials - iceServers: ', iceServers);
        return iceServers;
    } catch (error) {
        log('Error fetching TURN server credentials:', error);
        // Fallback to default STUN servers if TURN fetching fails
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
    const connect = () => {
        websocket = new WebSocket(`wss://${server_address}/ws/${peerId}`);

        websocket.onopen = () => {
            log(`${getCurrentTimestamp()} - WebSocket connection opened`);
            setWsConnected(true);
            startHeartbeat();
        };

        websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            log(`${getCurrentTimestamp()} - WebSocket message received:`, message);
            if (message.type === 'pong') {
                log(`${getCurrentTimestamp()} - WebSocket pong received`);
            } else if (message.offer) {
                log(`${getCurrentTimestamp()} - message.offer`);
                handleOffer(message.offer, message.source_id, setReadyToCommunicate);
            } else if (message.answer) {
                log(`${getCurrentTimestamp()} - message.answer`);
                handleAnswer(message.answer, message.source_id);
            } else if (message.candidate) {
                log(`${getCurrentTimestamp()} - message.candidate`);
                handleCandidate(message.candidate, message.source_id);
            }
        };

        websocket.onclose = () => {
            log(`${getCurrentTimestamp()} - WebSocket connection closed, retrying...`);
            setTimeout(connect, RECONNECT_INTERVAL);
        };

        websocket.onerror = (error) => {
            log(`${getCurrentTimestamp()} - WebSocket error:`, error);
            websocket.close();
        };
    };

    connect();
};

const startHeartbeat = () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    websocket.send(JSON.stringify({ type: 'ping' }));
    setTimeout(startHeartbeat, HEARTBEAT_INTERVAL); // Send a ping every 60 seconds
};

const stopHeartbeat = () => {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
};

export const initializeWebRTC = async (currentLocalPeerId, setWsConnected, setReadyToCommunicate) => {
    myLocalPeerId = currentLocalPeerId;
    log('client - initializeWebRTC - Initializing WebRTC for peer:', myLocalPeerId);

    try {
        initializeWebSocket(myLocalPeerId, setWsConnected, setReadyToCommunicate);
    } catch (error) {
        log('client - initializeWebRTC - Error initializing WebSocket:', error);
    }
};

export const setTargetPeerId = (targetId, setReadyToCommunicate, peerStoreFolder) => {
    targetPeerId = targetId;
    log('client - setTargetPeerId - targetPeerId set to:', targetPeerId);
    if (myLocalPeerId && targetPeerId) {
        log('client - setTargetPeerId - Both peer IDs set, setting up WebRTC');
        setupWebRTC(setReadyToCommunicate);
    }
};

// Messages
export const setReceiveChannel = (channel) => {
    receiveChannel = channel;
};

export const getReceiveChannel = () => {
    return receiveChannel;
};

export const setHandleTextMessageCallback = (callback) => {
    handleTextMessageCallback = callback;
};

export const setHandleDataMessageCallback = (callback) => {
    handleDataMessageCallback = callback;
};

export const sendMessage = async (setReadyToCommunicate, message, type = 'text', retries = 3) => {
    log('client - sendMessage - message:', message);
    const msg = JSON.stringify({ type, content: message });
    // ensure WebRTC is Open
    if (sendChannel && sendChannel.readyState === 'open') {
        sendChannel.send(msg);
        log('client - sendMessage - Sent message:', message);
        log('client - sendMessage - Sent msg:', msg);
    } else {
        log('client - sendMessage - Data channel is not open, trying to Open WebRTC.');
        // Try to open WebRTC
        if (retries > 0) {
            log(`client - sendMessage - Retrying to send message. Attempts left: ${retries}`);
            await setupWebRTC(setReadyToCommunicate);
            // Wait for the sendChannel to be open
            let attempt = 0;
            const maxAttempts = 10;
            const waitInterval = 60000; // in milliseconds (60 sec)
            // continue to attempt 
            while (attempt < maxAttempts && (!sendChannel || sendChannel.readyState !== 'open')) {
                attempt++;
                log('client - sendMessage - Waiting for sendChannel to open...');
                await new Promise(resolve => setTimeout(resolve, waitInterval));
            }
            // Once WebRTC is Open, send message
            if (sendChannel && sendChannel.readyState === 'open') {
                sendChannel.send(msg);
                log('client - sendMessage - Sent message after retry:', message);
                log('client - sendMessage - Sent msg:', msg);
            } else {
                log('client - sendMessage - Failed to send message after retry. sendChannel is still not open.');
                await sendMessage(setReadyToCommunicate, message, type, retries - 1);
            }
        } else {
            log('client - sendMessage - Max retries reached. Message not sent.');
        }
    }
};

// const setupWebRTC = async (setReadyToCommunicate) => {
//     log('client - setupWebRTC - Starting setup');

//     const iceServers = await fetchTurnCredentials();
//     log('client - setupWebRTC - iceServers: ', iceServers);

//     localConnection = new RTCPeerConnection({ iceServers });
//     peerConnections[targetPeerId] = localConnection;
//     log('client - setupWebRTC - RTCPeerConnection created:', localConnection);

//     sendChannel = localConnection.createDataChannel("fileTransfer");
//     log('client - setupWebRTC - Data channel created:', sendChannel);

//     sendChannel.onopen = () => handleSendChannelStatusChange(setReadyToCommunicate);
//     sendChannel.onclose = () => handleSendChannelStatusChange(setReadyToCommunicate);
//     sendChannel.onerror = (error) => log('client - sendChannel.onerror - Data channel error:', error);
//     sendChannel.onmessage = (event) => log('client - sendChannel.onmessage - Data channel message received:', event.data);

//     localConnection.ondatachannel = (event) => {
//         log('client - localConnection.ondatachannel - Data channel received:', event.channel);
//         receiveChannel = event.channel;
//         setReceiveChannel(receiveChannel); // Set the receive channel
//         receiveChannel.onopen = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
//         receiveChannel.onclose = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
//         receiveChannel.onerror = (error) => log('client - receiveChannel.onerror - Receive channel error:', error);
//         receiveChannel.onmessage = (event) => handleReceiveMessage(event);
//     };

//     localConnection.onicecandidate = (event) => {
//         if (event.candidate) {
//             log('client - localConnection.onicecandidate - ICE candidate generated:', event.candidate);
//             sendSignalMessage({ candidate: event.candidate, target_id: targetPeerId });
//         }
//     };

//     localConnection.oniceconnectionstatechange = () => {
//         log('client - localConnection.oniceconnectionstatechange - ICE connection state change:', localConnection.iceConnectionState);
//         if (localConnection.iceConnectionState === 'failed' || localConnection.iceConnectionState === 'disconnected') {
//             log('client - localConnection.oniceconnectionstatechange - Connection failed or disconnected');
//             setReadyToCommunicate(false);
//         }
//     };

//     localConnection.onicegatheringstatechange = () => log('client - localConnection.onicegatheringstatechange - ICE gathering state change:', localConnection.iceGatheringState);

//     localConnection.onsignalingstatechange = () => log('client - localConnection.onsignalingstatechange - Signaling state change:', localConnection.signalingState);

//     try {
//         const offer = await localConnection.createOffer();
//         log('client - setupWebRTC - Creating offer:', offer);
//         await localConnection.setLocalDescription(offer);
//         log('client - setupWebRTC - Local description set:', localConnection.localDescription);
//         sendSignalMessage({ offer: localConnection.localDescription, target_id: targetPeerId });
//     } catch (error) {
//         log('client - setupWebRTC - Error creating offer:', error);
//     }
// };

const setupWebRTC = async (setReadyToCommunicate, retries = 3, retryInterval = 1000) => {
    log('client - setupWebRTC - Starting setup');

    const attemptSetup = async () => {
        try {
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
                setReceiveChannel(receiveChannel);
                receiveChannel.onopen = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
                receiveChannel.onclose = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
                receiveChannel.onerror = (error) => log('client - receiveChannel.onerror - Receive channel error:', error);
                receiveChannel.onmessage = (event) => handleReceiveMessage(event);
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
                    log('client - localConnection.oniceconnectionstatechange - Connection failed or disconnected');
                    setReadyToCommunicate(false);
                }
            };

            localConnection.onicegatheringstatechange = () => log('client - localConnection.onicegatheringstatechange - ICE gathering state change:', localConnection.iceGatheringState);

            localConnection.onsignalingstatechange = () => log('client - localConnection.onsignalingstatechange - Signaling state change:', localConnection.signalingState);

            const offer = await localConnection.createOffer();
            log('client - setupWebRTC - Creating offer:', offer);
            await localConnection.setLocalDescription(offer);
            log('client - setupWebRTC - Local description set:', localConnection.localDescription);
            sendSignalMessage({ offer: localConnection.localDescription, target_id: targetPeerId });

        } catch (error) {
            log('client - setupWebRTC - Error during setup:', error);
            throw error;
        }
    };

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            await attemptSetup();
            return;
        } catch (error) {
            log(`client - setupWebRTC - Attempt ${attempt + 1} failed. Retrying in ${retryInterval}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
    }

    log('client - setupWebRTC - Max retries reached. Setup failed.');
};



const handleOffer = async (offer, source_id, setReadyToCommunicate) => {
    log('client - handleOffer - offer:', offer);
    log('client - handleOffer - source_id:', source_id);

    const iceServers = await fetchTurnCredentials();
    const peerConnection = new RTCPeerConnection({ iceServers });

    peerConnections[source_id] = peerConnection;
    log('client - handleOffer - RTCPeerConnection created for handling offer:', peerConnection);

    // Handle pending ICE candidates
    if (pendingIceCandidates[source_id]) {
        pendingIceCandidates[source_id].forEach(candidate => {
            handleCandidate(candidate, source_id);
        });
        delete pendingIceCandidates[source_id];
    }

    peerConnection.ondatachannel = (event) => {
        log('client - handleOffer - Data channel received:', event.channel);
        receiveChannel = event.channel;
        setReceiveChannel(receiveChannel); // Set the receive channel
        receiveChannel.onopen = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onclose = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onerror = (error) => log('client - receiveChannel.onerror - Receive channel error:', error);
        receiveChannel.onmessage = (event) => handleReceiveMessage(event);
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
        if (!peerConnection) {
            throw new Error(`PeerConnection not found for source_id: ${source_id}`);
        }
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
        if (!peerConnection) {
            if (!pendingIceCandidates[source_id]) {
                pendingIceCandidates[source_id] = [];
            }
            pendingIceCandidates[source_id].push(candidate);
            log(`client - handleCandidate - PeerConnection not found for source_id: ${source_id}. ICE candidate queued.`);
            return;
        }
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        log('client - handleCandidate - ICE candidate added:', candidate);
    } catch (error) {
        log('client - handleCandidate - Error handling ICE candidate:', error);
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
        setReadyToCommunicate(state === 'open');
    }
};

const handleReceiveChannelStatusChange = async (setReadyToCommunicate) => {
    if (receiveChannel) {
        const state = receiveChannel.readyState;
        log('client - handleReceiveChannelStatusChange - Receive channel state is:', state);
        setReadyToCommunicate(state === 'open');
    }
};

let receivedBuffers = {}; // Track received chunks for each key
let receivedSizes = {}; // Track total sizes of received chunks for each key

const handleReceiveMessage = async (event) => {
    log('client - handleReceiveMessage - event...', event);
    let message;
    try {
        if (event.data instanceof ArrayBuffer) {
            const storeHandles = await getLocalStoreHandle();
            const peerStoreFolder = storeHandles.peerDbaseFolderHandle;
            log('client - handleReceiveMessage - peerStoreFolder:', peerStoreFolder);
            const receivedData = event.data;
            const receivedBuffer = new Uint8Array(receivedData);
            log('client - handleReceiveMessage - Size of received buffer (bytes):', receivedBuffer.length);
            let key;
            try {
                const kvString = new TextDecoder().decode(receivedBuffer);
                const kv = JSON.parse(kvString);
                key = kv.key;
                log('client - handleReceiveMessage - Received key-value pair:', kv);
                log('client - handleReceiveMessage - key:', key);
                await storeReceivedChunk(peerStoreFolder, kv.key, kv.value);
                return;
            } catch (e) {
                log('client - handleReceiveMessage - Received buffer is part of a larger message.');
            }
            const textDecoder = new TextDecoder();
            if (!receivedBuffers[key]) {
                receivedBuffers[key] = [];
                receivedSizes[key] = 0;
            }
            receivedBuffers[key].push(receivedBuffer);
            receivedSizes[key] += receivedBuffer.length;
            const combinedBuffer = new Uint8Array(receivedSizes[key]);
            let offset = 0;
            receivedBuffers[key].forEach(buffer => {
                combinedBuffer.set(buffer, offset);
                offset += buffer.length;
            });
            try {
                const combinedKvString = textDecoder.decode(combinedBuffer);
                const combinedKv = JSON.parse(combinedKvString);
                log('client - handleReceiveMessage - Successfully assembled key-value pair:', combinedKv);
                await storeReceivedChunk(peerStoreFolder, combinedKv.key, combinedKv.value);
                delete receivedBuffers[key];
                delete receivedSizes[key];
                log('client - handleReceiveMessage - Successfully processed and reset buffers for key:', key);
            } catch (e) {
                log('client - handleReceiveMessage - Waiting for more chunks to complete the message for key:', key);
            }
            log('client - handleReceiveMessage - ArrayBuffer received.');
            message = JSON.parse(new TextDecoder().decode(event.data));
            handleDataMessageCallback(message.key);
            log('client - handleReceiveMessage - Received DATA message:', message.key);
        } else {
            message = JSON.parse(event.data);
            if (message.type === 'file_transfer_info') {
                // Step 5: Send handshake acknowledgment
                const fileTransferInfoAck = {
                    type: 'file_transfer_info_ack',
                    transferId: message.transferId
                };
                sendSignalMessage(fileTransferInfoAck, websocket);
                log('client - handleReceiveMessage - Sent handshake acknowledgment:', fileTransferInfoAck);
            } else if (message.type === 'file_transfer_info_ack') {
                // Handle file transfer info acknowledgment
                log('client - handleReceiveMessage - Received file transfer info acknowledgment:', message);
            } else if (message.type === 'text') {
                handleTextMessageCallback(message.content);
                log('client - handleReceiveMessage - Received TEXT message:', message);
            }
        }
    } catch (error) {
        log('client - handleReceiveMessage - Error processing message:', error);
    }
};

const storeReceivedChunk = async (peerStoreFolder, folderName, chunkData) => {
    try {
        log('client - storeReceivedChunk - peerStoreFolder: ', peerStoreFolder);
        log('client - storeReceivedChunk - folderName: ', folderName);
        log('client - storeReceivedChunk - chunkData: ', chunkData);

        if (!peerStoreFolder || !folderName || !chunkData) {
            throw new Error('Invalid input parameters');
        }

        const directoryHandle = await peerStoreFolder.getDirectoryHandle(folderName, { create: true });
        log('client - storeReceivedChunk - directoryHandle: ', directoryHandle);

        const { owner, fileName, chunkIndex, chunkCID, encryptedChunk, encryptionMethod } = chunkData;
        log('client - storeReceivedChunk - owner: ', owner);
        log('client - storeReceivedChunk - fileName: ', fileName);
        log('client - storeReceivedChunk - chunkIndex: ', chunkIndex);
        log('client - storeReceivedChunk - chunkCID: ', chunkCID);
        log('client - storeReceivedChunk - encryptedChunk: ', encryptedChunk);
        log('client - storeReceivedChunk - encryptionMethod: ', encryptionMethod);

        if (!chunkCID || !encryptedChunk) {
            throw new Error('Invalid chunk data');
        }

        // Store the chunk file
        const chunkFileHandle = await directoryHandle.getFileHandle(chunkCID, { create: true });
        log('client - storeReceivedChunk - chunkFileHandle: ', chunkFileHandle);
        const writableStream = await chunkFileHandle.createWritable();
        await writableStream.write(new Blob([JSON.stringify(encryptedChunk)], { type: 'application/json' }));
        await writableStream.close();
        log('client - storeReceivedChunk - writableStream closed...');

        // Create and store the metadata file
        const metaFileName = `${chunkCID}_meta.json`;
        const metaFileHandle = await directoryHandle.getFileHandle(metaFileName, { create: true });
        log('client - storeReceivedChunk - metaFileHandle: ', metaFileHandle);

        const metadata = {
            owner,
            fileName,
            chunkCID,
            chunkIndex,
            encryptionMethod
        };
        const metaWritableStream = await metaFileHandle.createWritable();
        await metaWritableStream.write(new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        await metaWritableStream.close();
        log('client - storeReceivedChunk - metaWritableStream closed...');

    } catch (error) {
        log('client - storeReceivedChunk - Error storing received chunk:', error);
    }
};

const processPendingIceCandidates = async (source_id) => {
    log('client - processPendingIceCandidates - Processing pending ICE candidates for:', source_id);
    remoteIceCandidates.forEach(async (candidate) => {
        try {
            const peerConnection = peerConnections[source_id];
            if (!peerConnection) {
                throw new Error(`PeerConnection not found for source_id: ${source_id}`);
            }
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            log('client - processPendingIceCandidates - Processed pending ICE candidate:', candidate);
        } catch (error) {
            log('client - processPendingIceCandidates - Error processing pending ICE candidate:', error);
        }
    });
    remoteIceCandidates = [];
};

export const copy_file_to_peers = async (setWsConnected, setReadyToCommunicate, list_of_peers, kvPairs, peerStoreFolder) => {
    log('client - copy_file_to_peers called - list_of_peers: ', list_of_peers);
    log('client - copy_file_to_peers called - kvPairs: ', kvPairs);
    log('client - copy_file_to_peers called - peerStoreFolder: ', peerStoreFolder);

    list_of_peers.forEach(async (peerId) => {
        log('client - copy_file_to_peers - Establishing connection with peer:', peerId);
        await establishPeerConnection(setWsConnected, setReadyToCommunicate, peerId, kvPairs, peerStoreFolder);
    });
};

// const establishPeerConnection = async (setWsConnected, setReadyToCommunicate, peerId, kvPairs, peerStoreFolder) => {
//     log('client - establishPeerConnection called - peerId: ', peerId);
//     log('client - establishPeerConnection called - peerStoreFolder: ', peerStoreFolder);

//     const MAX_CHUNK_SIZE = 16 * 1024; // max chunk size (16 KB) for WebRTC Channel
//     const MAX_RETRIES = 3;
//     let retryCount = 0;

//     // Step 1: Check WebSocket and establish if not open
//     while ((!websocket || websocket.readyState !== WebSocket.OPEN) && retryCount < MAX_RETRIES) {
//         try {
//             await initializeWebSocket(myLocalPeerId, setWsConnected, setReadyToCommunicate);
//             log('client - establishPeerConnection - Step 1 complete.');
//         } catch (error) {
//             log('client - establishPeerConnection - Error initializing WebSocket:', error);
//             retryCount++;
//             if (retryCount >= MAX_RETRIES) return;
//         }
//     }

//     // Step 2: Fetch ICE servers
//     let iceServers;
//     try {
//         iceServers = await fetchTurnCredentials();
//         log('client - establishPeerConnection - iceServers: ', iceServers);
//         log('client - establishPeerConnection - Step 2 complete.');
//     } catch (error) {
//         log('client - establishPeerConnection - Error fetching ICE servers:', error);
//         return;
//     }

//     // Step 3: Ensure DataChannel is created
//     const peerConnection = new RTCPeerConnection({ iceServers });
//     peerConnections[peerId] = peerConnection;

//     sendChannel = peerConnection.createDataChannel("fileTransfer");
//     sendChannel.onopen = async () => {
//         const transferId = uuidv4();
//         const fileTransferInfo = {
//             type: 'file_transfer_info',
//             transferId,
//             sourceId: myLocalPeerId,
//             kvPairsLength: kvPairs.length,
//             maxChunkSize: MAX_CHUNK_SIZE
//         };
    
//         log('client - establishPeerConnection - Step 3 complete.');

//         // Step 4: Send handshake message
//         sendSignalMessage(fileTransferInfo, websocket);
//         log('client - establishPeerConnection - Step 4 complete.');

//         // Step 5: Wait for handshake acknowledgment
//         const handleHandshakeAck = async (event) => {
//             const data = JSON.parse(event.data);
//             if (data.type === 'file_transfer_info_ack' && data.transferId === transferId) {
//                 log('client - establishPeerConnection - Handshake acknowledged:', data);
//                 log('client - establishPeerConnection - Step 5 complete.');

//                 // Step 6: Send all chunks in kvPairs
//                 for (let kv of kvPairs) {
//                     const kvString = JSON.stringify(kv);
//                     const kvBuffer = new TextEncoder().encode(kvString);
//                     for (let i = 0; i < kvBuffer.length; i += MAX_CHUNK_SIZE) {
//                         const chunk = kvBuffer.slice(i, i + MAX_CHUNK_SIZE);
//                         sendChannel.send(chunk);
//                         log('client - establishPeerConnection - Sent chunk:', chunk);
//                     }
//                 }
//                 log('client - establishPeerConnection - Step 6 complete.');

//                 // Step 7: Send new file transfer info with new UUID after all chunks are sent
//                 const newTransferId = uuidv4();
//                 const newFileTransferInfo = {
//                     type: 'file_transfer_info',
//                     transferId: newTransferId,
//                     sourceId: myLocalPeerId,
//                     kvPairsLength: kvPairs.length,
//                     maxChunkSize: MAX_CHUNK_SIZE
//                 };
//                 sendSignalMessage(newFileTransferInfo, websocket);
//                 log('client - establishPeerConnection - Step 7 complete.');
//             }
//         };

//         sendChannel.onmessage = handleHandshakeAck;
//     };

//     peerConnection.ondatachannel = (event) => {
//         log('client - establishPeerConnection - Data channel received:', event.channel);
//         receiveChannel = event.channel;
//         receiveChannel.onopen = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
//         receiveChannel.onclose = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
//         receiveChannel.onerror = (error) => log('client - receiveChannel.onerror - Receive channel error:', error);
//         receiveChannel.onmessage = (event) => handleReceiveMessage(event);
//     };

//     peerConnection.onicecandidate = (event) => {
//         if (event.candidate) {
//             log('client - peerConnection.onicecandidate - ICE candidate generated:', event.candidate);
//             sendSignalMessage({ candidate: event.candidate, target_id: peerId }, websocket);
//         }
//     };

//     try {
//         const offer = await peerConnection.createOffer();
//         log('client - establishPeerConnection - Creating offer:', offer);
//         await peerConnection.setLocalDescription(offer);
//         log('client - establishPeerConnection - Local description set:', peerConnection.localDescription);
//         sendSignalMessage({ offer: peerConnection.localDescription, target_id: peerId }, websocket);
//     } catch (error) {
//         log('client - establishPeerConnection - Error creating offer:', error);
//     }
// };


const establishPeerConnection = async (setWsConnected, setReadyToCommunicate, peerId, kvPairs, peerStoreFolder) => {
    log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    log('client - establishPeerConnection called - peerId: ', peerId);
    log('client - establishPeerConnection called - peerStoreFolder: ', peerStoreFolder);

    const MAX_CHUNK_SIZE = 16 * 1024; // max chunk size (16 KB) for WebRTC Channel
    const MAX_RETRIES = 3;
    const RETRY_INTERVAL = 1000; // retry interval in milliseconds
    let retryCount = 0;

    // Step 1: Check WebSocket and establish if not open
    while ((!websocket || websocket.readyState !== WebSocket.OPEN) && retryCount < MAX_RETRIES) {
        try {
            await initializeWebSocket(myLocalPeerId, setWsConnected, setReadyToCommunicate);
            log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
            log('client - establishPeerConnection - Step 1 complete.');
        } catch (error) {
            log('client - establishPeerConnection - Step 1 FAIL...');
            log('client - establishPeerConnection - Error initializing WebSocket:', error);
            retryCount++;
            if (retryCount >= MAX_RETRIES) return;
            await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
        }
    }

    // Step 2: Fetch ICE servers
    let iceServers;
    try {
        iceServers = await fetchTurnCredentials();
        log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
        log('client - establishPeerConnection - iceServers: ', iceServers);
        log('client - establishPeerConnection - Step 2 complete.');
    } catch (error) {
        log('client - establishPeerConnection - Step 2 FAIL...');
        log('client - establishPeerConnection - Error fetching ICE servers:', error);
        return;
    }

    // Step 3: Ensure DataChannel is created
    const createDataChannel = () => {
        return new Promise((resolve, reject) => {
            log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
            const peerConnection = new RTCPeerConnection({ iceServers });
            peerConnections[peerId] = peerConnection;

            sendChannel = peerConnection.createDataChannel("fileTransfer");
            sendChannel.onopen = () => {
                log('client - establishPeerConnection - Data channel opened:', sendChannel);
                resolve();
            };
            sendChannel.onclose = () => log('client - establishPeerConnection - Data channel closed:', sendChannel);
            sendChannel.onerror = (error) => {
                log('client - establishPeerConnection - Data channel error:', error);
                reject(error);
            };
            sendChannel.onmessage = (event) => log('client - establishPeerConnection - Data channel message received:', event.data);

            peerConnection.ondatachannel = (event) => {
                log('client - establishPeerConnection - Data channel received:', event.channel);
                receiveChannel = event.channel;
                receiveChannel.onopen = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
                receiveChannel.onclose = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
                receiveChannel.onerror = (error) => log('client - establishPeerConnection - Receive channel error:', error);
                receiveChannel.onmessage = (event) => handleReceiveMessage(event);
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    log('client - establishPeerConnection - ICE candidate generated:', event.candidate);
                    sendSignalMessage({ candidate: event.candidate, target_id: peerId }, websocket);
                }
            };

            peerConnection.oniceconnectionstatechange = () => {
                log('client - establishPeerConnection - ICE connection state change:', peerConnection.iceConnectionState);
                if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
                    reject(new Error('ICE connection state is disconnected or failed.'));
                }
            };

            peerConnection.onicegatheringstatechange = () => log('client - establishPeerConnection - ICE gathering state change:', peerConnection.iceGatheringState);

            peerConnection.onsignalingstatechange = () => log('client - establishPeerConnection - Signaling state change:', peerConnection.signalingState);

            peerConnection.createOffer().then(offer => {
                log('client - establishPeerConnection - Creating offer:', offer);
                return peerConnection.setLocalDescription(offer);
            }).then(() => {
                log('client - establishPeerConnection - Local description set:', peerConnection.localDescription);
                sendSignalMessage({ offer: peerConnection.localDescription, target_id: peerId }, websocket);
            }).catch(error => {
                log('client - establishPeerConnection - Error creating offer:', error);
                reject(error);
            });
        });
    };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            await createDataChannel();
            log('client - establishPeerConnection - Data channel setup complete.');
            log('client - establishPeerConnection - Step 3 Complete.');
            break;
        } catch (error) {
            log('client - establishPeerConnection - Step 3 FAIL...');
            log(`client - establishPeerConnection - Attempt ${attempt + 1} failed. Retrying in ${RETRY_INTERVAL}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
        }
    }

    // Step 4: Send handshake message
    log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    const transferId = uuidv4();
    const fileTransferInfo = {
        type: 'file_transfer_info',
        transferId,
        sourceId: myLocalPeerId,
        kvPairsLength: kvPairs.length,
        maxChunkSize: MAX_CHUNK_SIZE
    };
    sendSignalMessage(fileTransferInfo, websocket);
    log('client - establishPeerConnection - Step 4 complete.');

    // Step 5: Wait for handshake acknowledgment and send chunks
    const handleHandshakeAck = async (event) => {
        log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
        const data = JSON.parse(event.data);
        if (data.type === 'file_transfer_info_ack' && data.transferId === transferId) {
            log('client - establishPeerConnection - Handshake acknowledged:', data);

            for (let kv of kvPairs) {
                const kvString = JSON.stringify(kv);
                const kvBuffer = new TextEncoder().encode(kvString);
                for (let i = 0; i < kvBuffer.length; i += MAX_CHUNK_SIZE) {
                    const chunk = kvBuffer.slice(i, i + MAX_CHUNK_SIZE);
                    sendChannel.send(chunk);
                    log('client - establishPeerConnection - Sent chunk:', chunk);
                }
            }
            log('client - establishPeerConnection - All chunks sent.');
            log('client - establishPeerConnection - Step 5 complete.');
        } else {
            log('client - establishPeerConnection - Step 5 FAIL...');
        }
    };

    // Ensuring handleReceiveMessage is the default handler and handleHandshakeAck is specific to the handshake message
    sendChannel.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'file_transfer_info_ack' && message.transferId === transferId) {
            handleHandshakeAck(event);
        } else {
            handleReceiveMessage(event);
        }
    };
};







