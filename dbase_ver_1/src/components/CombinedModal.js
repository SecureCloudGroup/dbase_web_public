import React, { useState, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import { AppContext } from '../context/AppContext';
import { getAccount, getPublicKey, signData } from '../services/metamask';
import { processAndStoreFile, deriveKeyFromSignature, getFileCount } from '../services/indexeddb';
import { deriveKeyFromPassword } from '../services/deriveKeyFromPassword';

const CombinedModal = ({ isOpen, onClose, onSave, initialFileName }) => {
    const {bnodeid, localStoreFolder, setWsConnected, setReadyToCommunicate } = useContext(AppContext);
    const [newFileName, setNewFileName] = useState(initialFileName);
    const [saveToDBase, setSaveToDBase] = useState(true);
    const [encryptionMethod, setEncryptionMethod] = useState('MetaMask');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [fileName, setFileName] = useState('');
    const [saveFileToDBase, setSaveFileToDBase] = useState(false);
    const [combinedModalOpen, setCombinedModalOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [errorDetails, setErrorDetails] = useState('');
    const [errorModalOpen, setErrorModalOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setNewFileName(initialFileName);
            setSaveToDBase(true);
            setEncryptionMethod('MetaMask');
            setPassword('');
            setConfirmPassword('');
            setPasswordError('');
        }
    }, [isOpen, initialFileName]);

    const handleSave = () => {
        if (encryptionMethod === 'Password' && password !== confirmPassword) {
            setPasswordError('Passwords do not match.');
            return;
        }
        onSave(newFileName, saveToDBase, encryptionMethod, password);
        onClose();
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
            // await refreshFileTable();
            // const fileCount = await getFileCount();
            // setFileCount(fileCount);
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

    return (
        <div className={`modal fade show ${isOpen ? 'd-block' : 'd-none'}`} tabIndex="-1" role="dialog" aria-labelledby="combinedModalLabel" aria-hidden="true">
            <div className="modal-dialog" role="document">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title" id="combinedModalLabel">Edit File Name and Save to dBase Secure Cloud</h5>
                        <button type="button" className="close" aria-label="Close" onClick={onClose}>
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div className="modal-body">
                        <div className="form-group">
                            <label htmlFor="fileNameInput">File Name</label>
                            <input
                                type="text"
                                className="form-control"
                                id="fileNameInput"
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                            />
                        </div>
                        <div className="form-group mt-3">
                            <label>Do you want to save the file to the dBase Secure Cloud?</label>
                            <div className="form-check">
                                <input
                                    className="form-check-input"
                                    type="radio"
                                    name="saveToDBaseOptions"
                                    id="saveToDBaseYes"
                                    value="yes"
                                    checked={saveToDBase === true}
                                    onChange={() => setSaveToDBase(true)}
                                />
                                <label className="form-check-label" htmlFor="saveToDBaseYes">Yes</label>
                            </div>
                            <div className="form-check">
                                <input
                                    className="form-check-input"
                                    type="radio"
                                    name="saveToDBaseOptions"
                                    id="saveToDBaseNo"
                                    value="no"
                                    checked={saveToDBase === false}
                                    onChange={() => setSaveToDBase(false)}
                                />
                                <label className="form-check-label" htmlFor="saveToDBaseNo">No</label>
                            </div>
                        </div>
                        {saveToDBase && (
                            <div className="form-group mt-3">
                                <label>Choose Encryption Method:</label>
                                <div className="form-check">
                                    <input
                                        className="form-check-input"
                                        type="radio"
                                        name="encryptionOptions"
                                        id="encryptionMetaMask"
                                        value="MetaMask"
                                        checked={encryptionMethod === 'MetaMask'}
                                        onChange={() => setEncryptionMethod('MetaMask')}
                                    />
                                    <label className="form-check-label" htmlFor="encryptionMetaMask">MetaMask</label>
                                </div>
                                <div className="form-check">
                                    <input
                                        className="form-check-input"
                                        type="radio"
                                        name="encryptionOptions"
                                        id="encryptionBasicPassword"
                                        value="Password"
                                        checked={encryptionMethod === 'Password'}
                                        onChange={() => setEncryptionMethod('Password')}
                                    />
                                    <label className="form-check-label" htmlFor="encryptionBasicPassword">Password</label>
                                </div>
                                <div className="form-check">
                                    <input
                                        className="form-check-input"
                                        type="radio"
                                        name="encryptionOptions"
                                        id="encryptionNone"
                                        value="None"
                                        checked={encryptionMethod === 'None'}
                                        onChange={() => setEncryptionMethod('None')}
                                    />
                                    <label className="form-check-label" htmlFor="encryptionNone">None</label>
                                </div>
                            </div>
                        )}
                        {encryptionMethod === 'Password' && (
                            <div className="form-group mt-3">
                                <label htmlFor="passwordInput">Enter Password</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    id="passwordInput"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <label htmlFor="confirmPasswordInput" className="mt-2">Confirm Password</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    id="confirmPasswordInput"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                                {passwordError && <div className="text-danger mt-2">{passwordError}</div>}
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={handleSave}>OK</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

CombinedModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    initialFileName: PropTypes.string.isRequired,
};

export default CombinedModal;
