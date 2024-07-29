import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { deletePeerStoreFile, downloadPeerStoreFile } from '../services/localStore';
import DangerModal from './DangerModal';
import OrangeModal from './OrangeModal';
import ProgressBar from './ProgressBar';
import { getAccount, signData } from '../services/metamask';
import { deriveKeyFromSignature, decodeFileName, getLocalStoreHandle } from '../services/indexeddb';
import { initializeWebRTC, setTargetPeerId, sendMessage } from '../services/client';

const PeerData = () => {
    const { 
        bnodeid, 
        readyToCommunicate, 
        setReadyToCommunicate, 
        useLightTheme,
        wsConnected
    } = useContext(AppContext);
    const themeClass = useLightTheme ? 'light-theme' : 'dark-theme';
    const tableBackgroundColor = useLightTheme ? '#FFFFFF' : '#2C3531';
    const tableTextColor = useLightTheme ? '#3D52A0' : '#D1E8E2';
    // const indicatorConnectedColor = useLightTheme ? '#2ECC71' : '#27AE60'; // Green
    // const indicatorDisconnectedColor = useLightTheme ? '#E74C3C' : '#C0392B'; // Red
    // const indicatorReadyColor = useLightTheme ? '#2ECC71' : '#27AE60'; // Green
    // const indicatorNotReadyColor = useLightTheme ? '#E74C3C' : '#C0392B'; // Red

    const [peerFiles, setPeerFiles] = useState([]);
    const [peerFileCount, setPeerFileCount] = useState(0);
    const [dangerModalOpen, setDangerModalOpen] = useState(false);
    const [orangeModalOpen, setOrangeModalOpen] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [fileToDelete, setFileToDelete] = useState({ name: '' });
    const [isDownloading, setIsDownloading] = useState(false);
    const [targetPeerId, setTargetPeerIdState] = useState('');
    const [message, setMessage] = useState('');
    // const [wsConnected, setWsConnected] = useState(false);
    const [peerStoreFolder, setPeerStoreFolder] = useState(null);

    useEffect(() => {
        if (bnodeid) {
            // initializeWebRTC(bnodeid, setWsConnected, setReadyToCommunicate);
        }
    }, [bnodeid]);

    const handleTargetPeerIdChange = (e) => {
        const targetId = e.target.value;
        setTargetPeerIdState(targetId);
        setTargetPeerId(targetId, setReadyToCommunicate);
    };

    const handleSendMessage = () => {
        if (message) {
            sendMessage(setReadyToCommunicate, message);
            setMessage('');
        }
    };

    useEffect(() => {
        async function fetchPeerData() {
            console.log("PeerData - fetchPeerData called...");
            const storeHandles = await getLocalStoreHandle();
            console.log("PeerData - fetchPeerData - storeHandles: ",storeHandles);
            const fetchedPeerStoreFolder = storeHandles.peerDbaseFolderHandle;
            console.log("PeerData - fetchedPeerStoreFolder: ", fetchedPeerStoreFolder);
            setPeerStoreFolder(fetchedPeerStoreFolder);

            if (fetchedPeerStoreFolder) {
                const files = await getAggregatedPeerFiles(fetchedPeerStoreFolder);
                setPeerFiles(files);
                setPeerFileCount(files.length);
                console.log("PeerData - fetchedPeerStoreFolder - files: ",files);
            }
        }
        fetchPeerData();
    }, []);

    const getAggregatedPeerFiles = async (peerStoreFolder) => {
        const aggregatedFiles = {};
        for await (const [folderName, folderHandle] of peerStoreFolder.entries()) {
            if (folderHandle.kind === 'directory') {
                for await (const [fileName, fileHandle] of folderHandle.entries()) {
                    if (fileHandle.kind === 'file' && fileName.endsWith('_meta.json')) {
                        const file = await fileHandle.getFile();
                        const meta = await file.text();
                        const metadata = JSON.parse(meta);
                        const { owner, fileName: originalFileName, chunkIndex, chunkCID, encryptionMethod } = metadata;
                        if (!aggregatedFiles[originalFileName]) {
                            aggregatedFiles[originalFileName] = {
                                owner,
                                fileName: originalFileName,
                                fileStoreName: folderName,
                                size: 0,
                                numChunks: 0,
                                encryptionMethod: encryptionMethod
                            };
                        }
                        aggregatedFiles[originalFileName].numChunks += 1;
                        const chunkFileHandle = await folderHandle.getFileHandle(chunkCID);
                        const chunkFile = await chunkFileHandle.getFile();
                        aggregatedFiles[originalFileName].size += chunkFile.size;
                    }
                }
            }
        }
        return Object.values(aggregatedFiles);
    };

    const handleDelete = (fileName) => {
        setFileToDelete({ name: fileName });
        setDangerModalOpen(true);
    };

    const confirmDelete = async () => {
        setDangerModalOpen(false);
        setOrangeModalOpen(true);
    };

    const finalDelete = async () => {
        setOrangeModalOpen(false);
        await deletePeerStoreFile(peerStoreFolder, fileToDelete.name);
        const files = await getAggregatedPeerFiles(peerStoreFolder);
        setPeerFiles(files);
        setPeerFileCount(files.length);
    };

    const handleDownload = async (fileName) => {
        setIsDownloading(true);
        setDownloadProgress(0);
        const walletAddress = await getAccount();
        const signature = await signData(walletAddress);
        const key = await deriveKeyFromSignature(signature, walletAddress);
        await downloadPeerStoreFile(peerStoreFolder, fileName, key, setDownloadProgress);
        setIsDownloading(false);
    };

    const formatFileName = (encodedName) => {
        const decodedName = decodeFileName(encodedName);
        return decodedName.startsWith('dbase_') ? decodedName.slice(6) : decodedName;
    };

    const isDisabled = !readyToCommunicate || !targetPeerId || !wsConnected;

    return (
        <div className={themeClass}>
            
            <div className="row mt-4">
                <div className="col-12">
                    <div className={`d-flex flex-column ml-12 ${themeClass}-text`}>
                        <div className="d-flex align-items-center peer-info mb-3">
                            <div>
                                <span className="me-3" style={{ minWidth: '150px' }}>My BnodeId (peer id):</span>
                                <a>{bnodeid}</a>
                            </div>
                        </div>
                        <div className="d-flex align-items-center">
                            <label className="me-3" htmlFor="targetPeerId" style={{ minWidth: '150px' }}>Target Peer ID:</label>
                            <input type="text" id="targetPeerId" value={targetPeerId} onChange={handleTargetPeerIdChange} placeholder="Enter target peer ID" />
                        </div>
                    </div>
                    <br /><br />
                    <div className="ml-12">
                        <textarea
                            id="messageInput"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Type a message"
                            style={{ width: '80%' }}
                        ></textarea>
                    </div>
                    <div 
                        className="ml-12 btn btn-success" 
                        style={{
                            '--bs-btn-bg': isDisabled ? 'orange' : 'green',
                            color: isDisabled ? 'white' : 'black',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            width: 'auto'}} 
                    >
                        {/* <button onClick={handleSendMessage} disabled={!readyToCommunicate || !targetPeerId || !wsConnected}>Send Message</button> */}
                        <button
                            onClick={handleSendMessage}
                            disabled={isDisabled}
                        >
                        Send Message 
                        </button>
                    </div>
                    <div id="messages"></div>
                </div>
            </div>
            <div className="row mt-2">
                <div className="col">
                    <div className={`card ${themeClass}-bg-clear`}>
                        <div className={`card-body ${themeClass}-text`}>
                            Number of Peer Files: <span id="peer-file-count">{peerFileCount}</span>
                        </div>
                    </div>
                </div>
            </div>
            {isDownloading && (
                <div className="row mt-4">
                    <div className="col">
                        <ProgressBar progress={downloadProgress} />
                    </div>
                </div>
            )}
            <div className="row mt-4">
                <div className="col-12">
                    <table className="table table-bordered mt-3" style={{ backgroundColor: tableBackgroundColor, color: tableTextColor }}>
                        <thead>
                            <tr>
                                <th>Action</th>
                                <th>Owner</th>
                                <th>FileName</th>
                                <th>File Size</th>
                                <th>Number of Chunks</th>
                                <th>Encryption</th>
                            </tr>
                        </thead>
                        <tbody>
                            {peerFiles.map((file, index) => (
                                <tr key={index}>
                                    <td>
                                        <button className={`btn btn-sm delete-btn ${themeClass}-delete-btn`} onClick={() => handleDelete(file.fileStoreName)}>Delete</button>
                                        <button className={`btn btn-sm ms-2 download-btn ${themeClass}-btn`} onClick={() => handleDownload(file.fileStoreName)}>Download</button>
                                    </td>
                                    <td>{file.owner}</td>
                                    <td>{formatFileName(file.fileName)}</td>
                                    <td>{(file.size / (1024 * 1024)).toFixed(5)} MB</td>
                                    <td>{file.numChunks}</td>
                                    <td>{file.encryptionMethod}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Danger Modal */}
            <DangerModal
                isOpen={dangerModalOpen}
                onClose={() => setDangerModalOpen(false)}
                onConfirm={confirmDelete}
                fileId={fileToDelete.id}
                fileName={fileToDelete.name}
            />

            {/* Orange Modal */}
            <OrangeModal
                isOpen={orangeModalOpen}
                onClose={() => setOrangeModalOpen(false)}
                onConfirm={finalDelete}
                fileId={fileToDelete.id}
                fileName={fileToDelete.name}
            />
        </div>
    );
};

export default PeerData;
