import React, { useState, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import { AppContext } from '../context/AppContext';
import DangerModal from './DangerModal';
import OrangeModal from './OrangeModal';
import ProgressBar from './ProgressBar';
import { getLocalStoreFiles, deleteLocalStoreFile, getLocalFileCount, downloadLocalStoreFile } from '../services/localStore';
import { getAccount, signData } from '../services/metamask';
import { deriveKeyFromSignature, decodeFileName } from '../services/indexeddb';

const MyLocalData = () => {
    const { bnodeid, localStoreFolder, useLightTheme } = useContext(AppContext);
    const themeClass = useLightTheme ? 'light-theme' : 'dark-theme';
    const tableBackgroundColor = useLightTheme ? '#FFFFFF' : '#2C3531';
    const tableTextColor = useLightTheme ? '#3D52A0' : '#D1E8E2';

    const [fileCount, setFileCount] = useState(0);
    const [files, setFiles] = useState([]);
    const [dangerModalOpen, setDangerModalOpen] = useState(false);
    const [orangeModalOpen, setOrangeModalOpen] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [fileToDelete, setFileToDelete] = useState({ name: '' });
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        async function fetchLocalData() {
            if (localStoreFolder) {
                console.log("MyLocalData - localStoreFolder: ", localStoreFolder);
                const fileCount = await getLocalFileCount(localStoreFolder);
                setFileCount(fileCount);
                const files = await getLocalStoreFiles(localStoreFolder);
                setFiles(files);
            }
        }
        fetchLocalData();
    }, [localStoreFolder]);

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
        await deleteLocalStoreFile(localStoreFolder, fileToDelete.name);
        const files = await getLocalStoreFiles(localStoreFolder);
        setFiles(files);
        const fileCount = await getLocalFileCount(localStoreFolder);
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
            <div className="row mt-4">
                <div className="col d-flex align-items-center">
                    <div className={`card ${themeClass}-bg-clear me-auto`}>
                        <div className={`card-body ${themeClass}-text`}>
                            Number of Local Files: <span id="file-count">{fileCount}</span>
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
                                <th>FileStoreName</th>
                                <th>FileName</th>
                                <th>File Size</th>
                                <th>Number of Chunks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {files.map((file, index) => (
                                <tr key={index}>
                                    <td>
                                    <button className={`btn btn-sm download-btn ${themeClass}-btn`} onClick={() => handleDownload(file.name)}>Download</button>
                                        <button className={`btn btn-sm ms-2 delete-btn ${themeClass}-delete-btn`} onClick={() => handleDelete(file.name)}>Delete</button>
                                    </td>
                                    <td>{file.owner}</td>
                                    <td>{file.fileStoreName}</td>
                                    <td>{formatFileName(file.name)}</td>
                                    <td>{(file.size / (1024 * 1024)).toFixed(5)} MB</td>
                                    <td>{file.numChunks}</td>
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

MyLocalData.propTypes = {
    bnodeid: PropTypes.string,
};

export default MyLocalData;
