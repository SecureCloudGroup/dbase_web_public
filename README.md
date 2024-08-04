# dbase_web_public

dbase web public

React ver 0.1

### Steps to Send a Text Message to a Peer

#### App Initialization and WebSocket Setup

**App Starts** :

* `App.js` renders the `Base` component wrapped with `AppProvider`.

**WebSocket Initialization** :

* `Base.js`:
  * `useEffect` hook calls `initializeWebSocket` on component mount.
  * `initializeWebSocket` function:
    * Creates a new WebSocket instance.
    * Sets WebSocket event handlers for `onopen`, `onclose`, `onerror`, and `onmessage`.

#### Creating and Sending a Message

**Prepare to Send a Message** :

* `PeerData.js`:
  * User inputs `targetPeerId` and `message` in respective input fields.

**Send Message on Button Click** :

* `PeerData.js`:
  * `handleSendMessage` function:
    * Calls `sendTextMessage(ws, bnodeid, targetPeerId, message)`.

**Function to Send Text Message** :

* `sendTextMessage.js`:
  * `sendTextMessage(ws, bnodeid, targetPeerId, message)`:
    * Checks if WebSocket (`ws`) is open.
    * Constructs message payload:
      * `type: 'text'`
      * `bnodeid`
      * `targetPeerId`
      * `content: message`
    * Sends payload through WebSocket using `ws.send(messagePayload)`.

#### Closing the Channel

**Closing the Channel** :

* WebSocket automatically closes when the app unmounts or explicitly by calling `ws.close()` if needed.

---

Each step is tied to specific components and functions, ensuring the WebSocket connection is maintained and messages are sent and received efficiently.


### Steps to Send a Data File (Chunks from kvPairs) to a Peer

1. **Initialize WebRTC** :

* `initializeWebRTC(currentLocalPeerId, setWsConnected, setReadyToCommunicate)`

1. **Set Target Peer ID** :

* `setTargetPeerId(targetId, setReadyToCommunicate)`

1. **Establish Peer Connection and Send File** :

* `copy_file_to_peers(setWsConnected, setReadyToCommunicate, list_of_peers, kvPairs, peerStoreFolder)`

1. **Establish Peer Connection** :

* `establishPeerConnection(setWsConnected, setReadyToCommunicate, peerId, kvPairs, peerStoreFolder)`

1. **Create Data Channel** :

* `createDataChannel(setReadyToCommunicate)`

1. **Send Handshake Message** :

* `sendMessage(setReadyToCommunicate, fileTransferInfo, 'file_transfer_info')`

1. **Handle Handshake Acknowledgment and Send Chunks** :

* `handleHandshakeAck(event, transferId, kvPairs, MAX_CHUNK_SIZE)`
