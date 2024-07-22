import React, { createContext, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { connectMetaMask, isMetaMaskConnected } from '../services/metamask';
import { checkWalletRegistration, handleRegistration } from '../services/registration';
import { getLocalStoreHandle, saveLocalStoreHandle } from '../services/indexeddb';

const AppContext = createContext();

const AppProvider = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [verificationFailed, setVerificationFailed] = useState(false);
    const [bnodeid, setBNodeId] = useState('');
    const [isRegistered, setIsRegistered] = useState(false);
    const [localStoreFolder, setLocalStoreFolder] = useState('');
    const [peerStoreFolder, setPeerStoreFolder] = useState('');
    const [readyToCommunicate, setReadyToCommunicate] = useState(false);
    const [useLightTheme, setUseLightTheme] = useState(false); // Default to dark theme

    const initializeMetaMaskConnection = useCallback(async () => {
        try {
            const { connected, account } = await isMetaMaskConnected();
            if (connected) {
                setIsConnected(true);
                const { isRegistered, bnode_id } = await checkWalletRegistration(account);
                setBNodeId(bnode_id);
                setIsRegistered(isRegistered);

                if (isRegistered && bnode_id) {
                    const storeHandles = await getLocalStoreHandle();
                    
                    const localStoreHandle = storeHandles.localDbaseFolderHandle;
                    console.log('AppContext - initializeMetaMaskConnection - localStoreHandle: ',localStoreHandle);
                    setLocalStoreFolder(localStoreHandle);
                    const peerStoreHandle = storeHandles.peerDbaseFolderHandle;
                    console.log('AppContext - initializeMetaMaskConnection - peerStoreHandle: ',peerStoreHandle);
                    setPeerStoreFolder(peerStoreHandle);
                }
            }
        } catch (error) {
            console.error('Error initializing MetaMask connection:', error);
        }
    }, []);

    useEffect(() => {
        const savedLocalStore = localStorage.getItem('localStoreFolder');
        if (savedLocalStore) {
            setLocalStoreFolder(JSON.parse(savedLocalStore));
        }
        const savedPeerStore = localStorage.getItem('peerStoreFolder');
        if (savedPeerStore) {
            setPeerStoreFolder(JSON.parse(savedPeerStore));
        }
        initializeMetaMaskConnection();
    }, [initializeMetaMaskConnection]);

    const handleMetaMaskConnect = useCallback(async () => {
        try {
            const account = await connectMetaMask();
            if (account) {
                setIsConnected(true);
                const { isRegistered, bnode_id } = await checkWalletRegistration(account);
                setBNodeId(bnode_id);
                setIsRegistered(isRegistered);
                if (isRegistered && bnode_id) {
                    const storeHandles = await getLocalStoreHandle();
                    
                    const localStoreHandle = storeHandles.localDbaseFolderHandle;
                    console.log('AppContext - initializeMetaMaskConnection - localStoreHandle: ',localStoreHandle);
                    setLocalStoreFolder(localStoreHandle);
                    const peerStoreHandle = storeHandles.peerDbaseFolderHandle;
                    console.log('AppContext - initializeMetaMaskConnection - peerStoreHandle: ',peerStoreHandle);
                    setPeerStoreFolder(peerStoreHandle);
                }
            }
        } catch (error) {
            if (error.code === -32002) {
                console.warn('MetaMask - Request already pending. Please wait.');
            } else {
                console.error('MetaMask - Error connecting to MetaMask:', error);
            }
        }
    }, []);

    const handleSetLocalStore = async () => {
        try {
            const newLocalStoreFolderHandle = await window.showDirectoryPicker({
                id: 'dbase_data',
                mode: 'readwrite'
            });

            const dbaseLocalFolderName = 'dbase_local_data_store'; 
            const dbaseLocalFolderHandle = await newLocalStoreFolderHandle.getDirectoryHandle(dbaseLocalFolderName, { create: true });
            
            const dbasePeerFolderName = 'dbase_peer_data_store'; 
            const dbasePeerFolderHandle = await newLocalStoreFolderHandle.getDirectoryHandle(dbasePeerFolderName, { create: true });

            await saveLocalStoreHandle(bnodeid, newLocalStoreFolderHandle, dbaseLocalFolderName, dbaseLocalFolderHandle, newLocalStoreFolderHandle, dbasePeerFolderName, dbasePeerFolderHandle);
            
            setLocalStoreFolder(dbaseLocalFolderHandle);
            setPeerStoreFolder(dbasePeerFolderHandle);

            console.log(`AppContext - handleSetLocalStore - dbase Folder Created: ${dbaseLocalFolderHandle.name}`);
            console.log(`AppContext - handleSetLocalStore - dbase Peer Folder Created: ${dbasePeerFolderHandle.name}`);
        } catch (error) {
            console.error("AppContext - handleSetLocalStore - Error: ", error);
        }
    };

    useEffect(() => {
        if (localStoreFolder) {
            console.log('AppContext - localStoreFolder updated: ', localStoreFolder);
        }
        if (peerStoreFolder) {
            console.log('AppContext - peerStoreFolder updated: ', peerStoreFolder);
        }
    }, [localStoreFolder, peerStoreFolder]);

    const toggleTheme = () => {
        setUseLightTheme(prev => !prev);
    };

    return (
        <AppContext.Provider
            value={{
                isConnected,
                verificationFailed,
                bnodeid,
                isRegistered,
                localStoreFolder,
                peerStoreFolder,
                readyToCommunicate,
                setReadyToCommunicate,
                handleMetaMaskConnect,
                handleSetLocalStore,
                setBNodeId,
                setIsRegistered,
                useLightTheme,
                toggleTheme, // Provide toggle theme function
            }}
        >
            {children}
        </AppContext.Provider>
    );
};

AppProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

export { AppContext, AppProvider };
