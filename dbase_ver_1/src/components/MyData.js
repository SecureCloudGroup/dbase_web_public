import React, { useState, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import { AppContext } from '../context/AppContext';
import { 
    initDatabase, 
    checkDbOpen, 
    processAndStoreFile, 
    deriveKeyFromSignature, 
    updateFileTable, 
    getFileCount, 
    deleteFile, 
    checkLocalFileExistence, 
    decodeFileName } from '../services/indexeddb';
import { getAccount, getPublicKey, signData } from '../services/metamask';
import DangerModal from './DangerModal';
import OrangeModal from './OrangeModal';
import ProgressBar from './ProgressBar';
import CombinedModal from './CombinedModal';
import ErrorModal from './ErrorModal';
import { deriveKeyFromPassword } from '../services/deriveKeyFromPassword';
import { downloadLocalStoreFile } from '../services/localStore';

const MyData = () => {
    const { bnodeid, localStoreFolder, setWsConnected, setReadyToCommunicate, useLightTheme } = useContext(AppContext);
    const themeClass = useLightTheme ? 'light-theme' : 'dark-theme';
    const tableBackgroundColor = useLightTheme ? '#FFFFFF' : '#2C3531';
    const tableTextColor = useLightTheme ? '#3D52A0' : '#D1E8E2';

    const [fileCount, setFileCount] = useState(0);
    // const [peerCount, setPeerCount] = useState(0);
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [combinedModalOpen, setCombinedModalOpen] = useState(false);
    const [dangerModalOpen, setDangerModalOpen] = useState(false);
    const [orangeModalOpen, setOrangeModalOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState({ id: '', name: '' });
    const [files, setFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [saveFileToDBase, setSaveFileToDBase] = useState(false);
    const [errorModalOpen, setErrorModalOpen] = useState(false);
    const [errorDetails, setErrorDetails] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    useEffect(() => {
        async function initialize() {
            try {
                await initDatabase();
                const dbOpen = await checkDbOpen();
                console.log("MyData.js - MY_FILES_DB - isOpen?", dbOpen);
                await refreshFileTable();
                const fileCount = await getFileCount();
                setFileCount(fileCount);
            } catch (error) {
                console.error("Error initializing the database:", error);
            }
        }

        initialize();
    }, []);

    const refreshFileTable = async () => {
        const files = await updateFileTable();
        console.log("IndexedDb - refreshFileTable - files: ", files);

        if (localStoreFolder) {
            for (const file of files) {
                file.isStoredLocally = await checkLocalFileExistence(localStoreFolder, file.fileName);
            }
        }

        setFiles(files);
    };

    const handleUpload = () => {
        document.getElementById('fileInput').click();
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        setSelectedFile(file);
        setFileName(file.name);
        setCombinedModalOpen(true);
    };

    const handleSaveFileNameAndChoice = (newFileName, saveToDBase, encryptionMethod, password) => {
        console.log("MyData - handleSaveFileNameAndChoice - newFileName: ", newFileName);
        console.log("MyData - handleSaveFileNameAndChoice - saveToDBase: ", saveToDBase);
        console.log("MyData - handleSaveFileNameAndChoice - encryptionMethod: ", encryptionMethod);
        setFileName(newFileName);
        setSaveFileToDBase(saveToDBase);
        setCombinedModalOpen(false);
        handleAcceptSubmit(newFileName, saveToDBase, encryptionMethod, password);
    };

    const handleAcceptSubmit = async (newFileName, saveToDBase, encryptionMethod, password) => {
        if (selectedFile) {
            setIsLoading(true);
            setProgress(0);
            try {
                console.log("MyData - handleAcceptSubmit - localStoreFolder: ", localStoreFolder);
                if (!localStoreFolder) {
                    alert("Please set the local store before uploading files.");
                    return;
                }
                // Use MetaMask PublicKey 
                let key;
                if (encryptionMethod === 'MetaMask') {
                    const publicKeyString = await getPublicKey();
                    const walletAddress = await getAccount();
                    if (!walletAddress || !publicKeyString) {
                        throw new Error("Failed to retrieve wallet address or public key.");
                    }
                    const sig = await signData(walletAddress);
                    key = await deriveKeyFromSignature(sig, walletAddress);
                } else if (encryptionMethod === 'Password') {
                    // Use Password
                    key = await deriveKeyFromPassword(password);
                }

                console.log("MyData - handleAcceptSubmit - key: ", key);

                await processAndStoreFile(
                    bnodeid,
                    selectedFile,
                    newFileName,
                    key,
                    localStoreFolder,
                    setProgress,
                    saveToDBase,
                    setWsConnected,
                    setReadyToCommunicate,
                    encryptionMethod
                );
                await refreshFileTable();
                const fileCount = await getFileCount();
                setFileCount(fileCount);
            } catch (error) {
                setErrorDetails(error.message || error.toString());
                setErrorModalOpen(true);
            } finally {
                setIsLoading(false);
            }
        } else {
            alert("File cannot be empty.");
        }
    };

    const handleDelete = (fileId, fileName) => {
        setFileToDelete({ id: fileId, name: fileName });
        setDangerModalOpen(true);
    };

    const confirmDelete = async () => {
        setDangerModalOpen(false);
        setOrangeModalOpen(true);
    };

    const finalDelete = async () => {
        const { id } = fileToDelete;
        setOrangeModalOpen(false);

        await deleteFile(id);
        await refreshFileTable();
        const fileCount = await getFileCount();
        setFileCount(fileCount);
    };

    const handleDownload = async (fileName) => {
        setIsDownloading(true);
        setDownloadProgress(0);
        const walletAddress = await getAccount();
        const signature = await signData(walletAddress);
        const key = await deriveKeyFromSignature(signature, walletAddress);
        await downloadLocalStoreFile(localStoreFolder, fileName, key, setDownloadProgress);
        setIsDownloading(false);
    };

    const formatFileName = (encodedName) => {
        const decodedName = decodeFileName(encodedName);
        return decodedName.startsWith('dbase_') ? decodedName.slice(6) : decodedName;
    };

    return (
        <div className={themeClass}>
            {isLoading && (
                <div className="d-flex flex-column justify-content-center" style={{ height: '50vh' }}>
                    <h5>Uploading File...</h5>
                    <h4>You will need to allow access to your PUBLIC key in MetaMask.</h4>
                    <h4>You will need to sign the transaction to encrypt your data.</h4>
                    <ProgressBar progress={progress} />
                </div>
            )}
            {!isLoading && (
                <>
                    <div className="row mt-4">
                        <div className="col d-flex align-items-center">
                            <div className={`card ${themeClass}-bg-clear me-auto`}>
                                <div className={`card-body ${themeClass}-text`}>
                                    Number of My Files: <span id="file-count">{fileCount}</span>
                                </div>
                            </div>
                            <button className="btn btn-success ms-3" onClick={handleUpload}>Upload File</button>
                            <input type="file" id="fileInput" onChange={handleFileChange} style={{ display: 'none' }} />
                        </div>
                    </div>
                    <div className="row mt-4">
                        <div className="col-12">
                            <table className="table table-bordered mt-3" style={{ backgroundColor: tableBackgroundColor, color: tableTextColor }}>
                                <thead>
                                    <tr>
                                        <th>Action</th>
                                        <th>Owner</th>
                                        <th>FileStoreName</th>
                                        <th>FileName</th>
                                        <th>File Size</th>
                                        <th>Number of Chunks</th>
                                        <th>Stored Locally</th>
                                        <th>Encryption</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {files.map((file, index) => (
                                        <tr key={index}>
                                            <td>
                                                <button className={`btn btn-sm download-btn ${themeClass}-btn`} onClick={() => handleDownload(file.fileStoreName)}>Download</button>
                                                <button className={`btn btn-sm ms-2 delete-btn ${themeClass}-delete-btn`} onClick={() => handleDelete(file.fileStoreName, file.fileName)}>Delete</button>
                                            </td>
                                            <td>{file.owner}</td>
                                            <td>{file.fileStoreName}</td>
                                            <td>{file.fileName}</td>
                                            <td>{(file.fileSize / (1024 * 1024)).toFixed(5)} MB</td>
                                            <td>{file.numChunks}</td>
                                            <td>{file.isStoredLocally ? 'Yes' : 'No'}</td>
                                            <td>{file.encryptionMethod}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Combined Modal */}
                    <CombinedModal
                        isOpen={combinedModalOpen}
                        onClose={() => setCombinedModalOpen(false)}
                        onSave={handleSaveFileNameAndChoice}
                        initialFileName={fileName}
                    />

                    {/* Error Modal */}
                    <ErrorModal
                        isOpen={errorModalOpen}
                        onClose={() => {
                            setErrorModalOpen(false);
                            // Optionally, refresh the page or reset the state
                        }}
                        errorDetails={errorDetails}
                    />

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
                </>
            )}
        </div>
    );
};

MyData.propTypes = {
    themeClass: PropTypes.string.isRequired, // Add this prop type
};

export default MyData;
