import { getLocalStoreHandle } from './indexeddb';

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
const turn_api = '725649c5ea4be63aff9781ecf3f1d69cab36';  // handle private later... Move to server w/auth
let wsReadyPromise;


const fetchTurnCredentials = async () => {
    try {
        const response = await fetch(`https://scg_test_1.metered.live/api/v1/turn/credentials?apiKey=${turn_api}`);
        if (!response.ok) {
            throw new Error('Failed to fetch TURN server credentials');
        }
        const turnServers = await response.json();
        
        // Add STUN servers to the list
        const iceServers = [
            ...turnServers,
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ];
        
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
    return new Promise((resolve, reject) => {
        const wsUrl = `wss://${server_address}/ws/${peerId}`;
        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
            log('client - initializeWebSocket - WebSocket connection opened');
            log('client - initializeWebSocket - WebSocket URL:', wsUrl);
            setWsConnected(true);
            resolve();
        };

        websocket.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            log('client - websocket.onmessage - Received message from WebSocket:', data);

            if (data.offer) {
                log('client - websocket.onmessage - Received offer:', data.offer);
                await handleOffer(data.offer, data.source_id, setReadyToCommunicate);
            } else if (data.answer) {
                log('client - websocket.onmessage - Received answer:', data.answer);
                await handleAnswer(data.answer, data.source_id);
            } else if (data.candidate) {
                log('client - websocket.onmessage - Received ICE candidate:', data.candidate);
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

// NOTE: remove 'setReadyToCommunicate'
export const initializeWebRTC = async (currentLocalPeerId, setWsConnected, setReadyToCommunicate) => {
    myLocalPeerId = currentLocalPeerId;
    log('client - initializeWebRTC - Initializing WebRTC for peer:', myLocalPeerId);

    try {
        await initializeWebSocket(myLocalPeerId, setWsConnected, setReadyToCommunicate);
        wsReadyPromise = Promise.resolve();
    } catch (error) {
        log('client - initializeWebRTC - Error initializing WebSocket:', error);
    }
};

export const setTargetPeerId = (targetId, setReadyToCommunicate, peerStoreFolder) => {
    targetPeerId = targetId;
    log('client - setTargetPeerId - targetPeerId set to:', targetPeerId);
    if (myLocalPeerId && targetPeerId) {
        log('client - setTargetPeerId - Both peer IDs set, setting up WebRTC');
        setupWebRTC(setReadyToCommunicate, peerStoreFolder);
    }
};

export const sendMessage = (message) => {
    log('client - sendMessage - message:', message);
    if (sendChannel && sendChannel.readyState === 'open') {
        sendChannel.send(message);
        log('client - sendMessage - Sent message:', message);
    } else {
        log('client - sendMessage - sendChannel:', sendChannel);
        log('client - sendMessage - sendChannel.readyState:', sendChannel.readyState);
        log('client - sendMessage - Data channel is not open. Message not sent.');
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
            // log('client - localConnection - readyToCommunicate: ',readyToCommunicate);
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
            throw new Error(`PeerConnection not found for source_id: ${source_id}`);
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
    log('client - handleReceiveMessage >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    log('client - handleReceiveMessage >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    log('client - handleReceiveMessage >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    log('client - handleReceiveMessage - event...', event);

    const storeHandles = await getLocalStoreHandle();
    const peerStoreFolder = storeHandles.peerDbaseFolderHandle;
    log('client - handleReceiveMessage - peerStoreFolder:', peerStoreFolder);

    const receivedData = event.data;
    if (receivedData instanceof ArrayBuffer) {
        const receivedBuffer = new Uint8Array(receivedData);
        log('client - handleReceiveMessage - Size of received buffer (bytes):', receivedBuffer.length);

        // Try to decode the buffer to extract key information
        let key;
        try {
            const kvString = new TextDecoder().decode(receivedBuffer);
            const kv = JSON.parse(kvString);
            key = kv.key;

            // Log that we have received a new key-value pair
            log('client - handleReceiveMessage - Received key-value pair:', kv);
            log('client - handleReceiveMessage - key:', key);

            // Store the received chunk directly if it's not part of a larger message
            await storeReceivedChunk(peerStoreFolder, kv.key, kv.value);

            return;
        } catch (e) {
            // If parsing fails, it means the buffer is a part of a larger message
            log('client - handleReceiveMessage - Received buffer is part of a larger message.');
        }

        // Assuming that each chunk starts with a key that is included in the JSON string, we need to extract it and then assemble the chunks.
        const textDecoder = new TextDecoder();
        // const textEncoder = new TextEncoder();

        // Append the received buffer to the corresponding buffer array for the given key
        if (!receivedBuffers[key]) {
            receivedBuffers[key] = [];
            receivedSizes[key] = 0;
        }
        receivedBuffers[key].push(receivedBuffer);
        receivedSizes[key] += receivedBuffer.length;

        // Attempt to combine all received chunks
        const combinedBuffer = new Uint8Array(receivedSizes[key]);
        let offset = 0;
        receivedBuffers[key].forEach(buffer => {
            combinedBuffer.set(buffer, offset);
            offset += buffer.length;
        });

        // Try to decode and parse the combined buffer to check if we have received the complete message
        try {
            const combinedKvString = textDecoder.decode(combinedBuffer);
            const combinedKv = JSON.parse(combinedKvString);

            log('client - handleReceiveMessage - Successfully assembled key-value pair:', combinedKv);

            // Store the assembled message
            await storeReceivedChunk(peerStoreFolder, combinedKv.key, combinedKv.value);

            // Clear the buffers for this key after successfully processing the complete message
            delete receivedBuffers[key];
            delete receivedSizes[key];
            log('client - handleReceiveMessage - Successfully processed and reset buffers for key:', key);
        } catch (e) {
            // Continue to receive more chunks if JSON parsing fails
            log('client - handleReceiveMessage - Waiting for more chunks to complete the message for key:', key);
        }
    } else {
        log('client - handleReceiveMessage - Unexpected data type received:', receivedData);
    }
};

// const storeReceivedChunk = async (peerStoreFolder, folderName, chunkData) => {
//     try {
//         log('client - storeReceivedChunk - peerStoreFolder: ', peerStoreFolder);
//         log('client - storeReceivedChunk - folderName: ', folderName);
//         log('client - storeReceivedChunk - chunkData: ', chunkData);

//         if (!peerStoreFolder || !folderName || !chunkData) {
//             throw new Error('Invalid input parameters');
//         }

//         const directoryHandle = await peerStoreFolder.getDirectoryHandle(folderName, { create: true });
//         log('client - storeReceivedChunk - directoryHandle: ', directoryHandle);

//         const { chunkIndex, chunkCID, encryptedChunk } = chunkData;
//         log('client - storeReceivedChunk - chunkIndex: ', chunkIndex);
//         log('client - storeReceivedChunk - chunkCID: ', chunkCID);
//         log('client - storeReceivedChunk - encryptedChunk: ', encryptedChunk);

//         if (!chunkCID || !encryptedChunk) {
//             throw new Error('Invalid chunk data');
//         }

//         const chunkFileHandle = await directoryHandle.getFileHandle(chunkCID, { create: true });
//         log('client - storeReceivedChunk - chunkFileHandle: ', chunkFileHandle);

//         const writableStream = await chunkFileHandle.createWritable();
//         await writableStream.write(new Blob([JSON.stringify(encryptedChunk)], { type: 'application/json' }));
//         await writableStream.close();
//         log('client - storeReceivedChunk - writableStream closed...');
//     } catch (error) {
//         log('client - storeReceivedChunk - Error storing received chunk:', error);
//     }
// };

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



// const encodeFileName = (name) => {
//     return name
//         .replace(/\./g, '_dot_')
//         .replace(/\//g, '_slash_')
//         .replace(/\\/g, '_backslash_')
//         .replace(/\?/g, '_question_')
//         .replace(/%/g, '_percent_')
//         .replace(/\*/g, '_asterisk_')
//         .replace(/:/g, '_colon_')
//         .replace(/\|/g, '_pipe_')
//         .replace(/"/g, '_quote_')
//         .replace(/</g, '_lt_')
//         .replace(/>/g, '_gt_');
// };

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

export const copy_file_to_peers = async (setReadyToCommunicate, list_of_peers, kvPairs, peerStoreFolder) => {
    log('client - copy_file_to_peers called - list_of_peers: ', list_of_peers);
    log('client - copy_file_to_peers called - kvPairs: ', kvPairs);
    log('client - copy_file_to_peers called - peerStoreFolder: ', peerStoreFolder);

    list_of_peers.forEach(async (peerId) => {
        log('client - copy_file_to_peers - Establishing connection with peer:', peerId);
        await establishPeerConnection(setReadyToCommunicate, peerId, kvPairs, peerStoreFolder);
    });
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

    const peerConnection = await new RTCPeerConnection({ iceServers });
    peerConnections[peerId] = peerConnection;

    sendChannel = await peerConnection.createDataChannel("fileTransfer");
    
    const MAX_CHUNK_SIZE = 16 * 1024; // max chunk size (16 KB) for WebRTC Channel

    sendChannel.onopen = () => {
        kvPairs.forEach((kv) => {
            log('client - establishPeerConnection - Sent file chunk:', kv);
            // Serialize the entire key-value pair object to JSON string
            const kvString = JSON.stringify(kv);

            // Convert the JSON string to Uint8Array
            const kvBuffer = new TextEncoder().encode(kvString);

            // Log the size of the buffer
            log('client - establishPeerConnection - Size of serialized key-value pair (bytes):', kvBuffer.length);

            // Check if the buffer size exceeds the max chunk size
            for (let i = 0; i < kvBuffer.length; i += MAX_CHUNK_SIZE) {
                const chunk = kvBuffer.slice(i, i + MAX_CHUNK_SIZE);
                sendChannel.send(chunk);
                log('client - establishPeerConnection - kvBuffer.length:', kvBuffer.length);
                log('client - establishPeerConnection - Sent chunk:', chunk);
            }
        });
    };
    

    peerConnection.ondatachannel = (event) => {
        log('client - establishPeerConnection - Data channel received:', event.channel);
        receiveChannel = event.channel;
        receiveChannel.onopen = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onclose = () => handleReceiveChannelStatusChange(setReadyToCommunicate);
        receiveChannel.onerror = (error) => log('client - receiveChannel.onerror - Receive channel error:', error);
        receiveChannel.onmessage = (event) => handleReceiveMessage(event);
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
