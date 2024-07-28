import Dexie from 'dexie';
import pako from 'pako';
import { getAccount } from './metamask';
import { copy_file_to_peers } from './client';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import * as raw from 'multiformats/codecs/raw';

const SERVER_URL = 'https://api.securecloudgroup.com'; // Update to ENV

// Add File Meta Data Store
const my_file_meta_data_db = new Dexie('MyFileMetaDataDB');
my_file_meta_data_db.version(1).stores({
    FILE_METADATA: '++id, owner, fileStoreName, fileName, fileSize, numChunks, encryptionMethod',
    LOCAL_STORE: '++id, bnodeid, handle'
});

const my_files_db = new Dexie('MyFilesDB');
my_files_db.version(1).stores({
    files: '++id, owner, fileId, fileName, chunkCID, chunkIndex, chunk, encryptionMethod'
});

export const initDatabase = async () => {
    await my_file_meta_data_db.open();
    await my_files_db.open();
};

export const checkDbOpen = async () => {
    const isOpen_my_file_meta_data_db = my_file_meta_data_db.isOpen();
    const isOpen_my_files_db = my_files_db.isOpen();
    return isOpen_my_file_meta_data_db && isOpen_my_files_db;
};


export const saveLocalStoreHandle = async (bnodeid, localStoreHandle, localFolderName, localDbaseFolderHandle, peerStoreHandle, peerFolderName, peerDbaseFolderHandle) => {
    const existingEntry = await my_file_meta_data_db.LOCAL_STORE.where({ bnodeid }).last();
    
    if (existingEntry) {
        // Update the existing entry with new values if provided
        existingEntry.localStoreHandle = localStoreHandle;
        existingEntry.localFolderName = localFolderName;
        existingEntry.localDbaseFolderHandle = localDbaseFolderHandle;
        existingEntry.peerStoreHandle = peerStoreHandle;
        existingEntry.peerFolderName = peerFolderName;
        existingEntry.peerDbaseFolderHandle = peerDbaseFolderHandle;
        
        await my_file_meta_data_db.LOCAL_STORE.put(existingEntry);
    } else {
        // Add a new entry if it does not exist
        const newEntry = {
            bnodeid,
            localStoreHandle,
            localFolderName,
            localDbaseFolderHandle,
            peerStoreHandle,
            peerFolderName,
            peerDbaseFolderHandle
        };
        await my_file_meta_data_db.LOCAL_STORE.add(newEntry);
    }
};


// export const getLocalStoreHandle = async (type) => {
//     console.log('indexeddb - getLocalStoreHandle - type: ', type);
//     if (type != 'local' || type != 'peer') {
//         console.log('indexeddb - getLocalStoreHandle - ERROR: you must set type');
//         return null;
//     }
//     const localStoreEntries = await my_file_meta_data_db.LOCAL_STORE.toArray();
//     console.log('indexeddb - getLocalStoreHandle - localStoreEntries: ', localStoreEntries);
    
//     if (localStoreEntries.length === 0) {
//         return null;
//     }

//     const localStoreEntry = localStoreEntries[localStoreEntries.length - 1]; // Get the last entry
//     console.log('indexeddb - getLocalStoreHandle - localStoreEntry: ', localStoreEntry);

//     if (type === 'local') {
//         console.log('indexeddb - getLocalStoreHandle - localDbaseFolderHandle: ', localStoreEntry.localDbaseFolderHandle);
//         return localStoreEntry.localDbaseFolderHandle;
//     } else if (type === 'peer') {
//         console.log('indexeddb - getLocalStoreHandle - peerDbaseFolderHandle: ', localStoreEntry.peerDbaseFolderHandle);
//         return localStoreEntry.peerDbaseFolderHandle;
//     }
//     console.log('indexeddb - getLocalStoreHandle - ERROR');
//     return null;
// };
export const getLocalStoreHandle = async () => {
    console.log('indexeddb - getLocalStoreHandle - Called... ');
    const localStoreEntries = await my_file_meta_data_db.LOCAL_STORE.toArray();
    console.log('indexeddb - getLocalStoreHandle - localStoreEntries: ', localStoreEntries);
    
    if (localStoreEntries.length === 0) {
        console.log('indexeddb - getLocalStoreHandle - localStoreEntries.length === 0');
        return null;
    } else {
        const localStoreEntry = localStoreEntries[localStoreEntries.length - 1]; // Get the last entry
        console.log('indexeddb - getLocalStoreHandle - localStoreEntry: ', localStoreEntry);
        // localDbaseFolderHandle
        const localDbaseFolderHandle = localStoreEntry.localDbaseFolderHandle;
        console.log('indexeddb - getLocalStoreHandle - localDbaseFolderHandle: ', localDbaseFolderHandle);
        // peerDbaseFolderHandle
        const peerDbaseFolderHandle = localStoreEntry.peerDbaseFolderHandle;
        console.log('indexeddb - getLocalStoreHandle - peerDbaseFolderHandle: ', peerDbaseFolderHandle);

        return {
            'localDbaseFolderHandle': localDbaseFolderHandle,
            'peerDbaseFolderHandle': peerDbaseFolderHandle
        }
    }
};

export const generateFileId = async () => {
    const allFiles = await my_file_meta_data_db.FILE_METADATA.toArray();
    const currentMaxId = allFiles.length ? Math.max(...allFiles.map(file => parseInt(file.fileStoreName, 10))) : 0;
    const nextFileId = currentMaxId + 1;
    console.log("generateFileId - nextFileId: ", nextFileId);
    return nextFileId.toString();
};

const encodeFileName = (fileName) => {
    return fileName
        .replace(/\./g, '_dot_')
        .replace(/\//g, '_slash_')
        .replace(/\\/g, '_backslash_')
        .replace(/\?/g, '_question_')
        .replace(/%/g, '_percent_')
        .replace(/\*/g, '_asterisk_')
        .replace(/:/g, '_colon_')
        .replace(/\|/g, '_pipe_')
        .replace(/"/g, '_quote_')
        .replace(/</g, '_lt_')
        .replace(/>/g, '_gt_');
};

export const decodeFileName = (encodedName) => {
    return encodedName
        .replace(/_dot_/g, '.')
        .replace(/_slash_/g, '/')
        .replace(/_backslash_/g, '\\')
        .replace(/_question_/g, '?')
        .replace(/_percent_/g, '%')
        .replace(/_asterisk_/g, '*')
        .replace(/_colon_/g, ':')
        .replace(/_pipe_/g, '|')
        .replace(/_quote_/g, '"')
        .replace(/_lt_/g, '<')
        .replace(/_gt_/g, '>');
};

const saveChunkToLocalStore = async (fileName, chunkIndex, encryptedChunk, localStoreHandle) => {
    try {
        // console.log("indexeddb - saveChunkToLocalStore - fileName: ",fileName);
        // console.log("indexeddb - saveChunkToLocalStore - chunkIndex: ",chunkIndex);
        // console.log("indexeddb - saveChunkToLocalStore - encryptedChunk: ",encryptedChunk);
        // console.log("indexeddb - saveChunkToLocalStore - localStoreHandle: ",localStoreHandle);
        // Ensure the 'dbase_local_data_store' directory is created within the localStoreFolder
        // const mainDirectoryHandle = await localStoreHandle.getDirectoryHandle('dbase_local_data_store', { create: true });
        // const mainDirectoryHandle = await localStoreHandle.getDirectoryHandle();
        // console.log("indexeddb - saveChunkToLocalStore - mainDirectoryHandle: ",mainDirectoryHandle);
        // Ensure the directory for the specific file is created within the 'dbase_local_data_store'
        // const directoryHandle = await mainDirectoryHandle.getDirectoryHandle(fileName, { create: true });
        const directoryHandle = await localStoreHandle.getDirectoryHandle(fileName, { create: true });
        // console.log("indexeddb - saveChunkToLocalStore - directoryHandle: ",directoryHandle);
        const fileHandle = await directoryHandle.getFileHandle(`chunk_${chunkIndex}`, { create: true });
        // console.log("indexeddb - saveChunkToLocalStore - fileHandle: ",fileHandle);
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(new Blob([JSON.stringify(encryptedChunk)], { type: 'application/json' }));
        await writableStream.close();
        // console.log("Chunk saved to local store: ", fileName, chunkIndex);
    } catch (error) {
        console.error("Error saving chunk to local store: ", error);
    }
};

const get_peers_for_dbase_file = async (wallet_address) => {
    try {
        const response = await fetch(`${SERVER_URL}/get_peers_for_file`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ wallet_address }),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch peers for file');
        }

        const data = await response.json();
        console.log('indexeddb - get_peers_for_dbase_file - data: ',data);
        return data.file_peers;
    } catch (error) {
        console.error('Error fetching peers for file:', error);
        return [];
    }
};


export const processAndStoreFile = async (
    bNodeId, 
    file, 
    fileName, 
    key, 
    localStoreHandle, 
    progressCallback, 
    saveFileToDBase, 
    setWsConnected,
    setReadyToCommunicate,
    encryptionMethod,
    peerStoreFolder
    ) => {
    console.log("indexeddb - processAndStoreFile - localStoreHandle: ", localStoreHandle);
    const chunkSize = 128 * 1024; // 0.125MB chunks
    let offset = 0;
    let chunkIndex = 0;
    const fileId = await generateFileId();
    const fileSize = file.size;
    const kvPairs = []; // Array to store key-value pairs of encrypted chunks/IDs
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
        reader.onload = async function (event) {
            if (event.target.readyState === FileReader.DONE) {
                try {
                    // Chunk
                    const chunk = event.target.result;
                    console.log("indexeddb - processAndStoreFile - chunk: ", chunk);
                    // Compress
                    const compressedChunk = pako.deflate(new Uint8Array(chunk));
                    console.log("indexeddb - processAndStoreFile - compressedChunk: ", compressedChunk);
                    // Encrypt
                    let encryptedChunk;
                    if (encryptionMethod === 'None') {
                        encryptedChunk = { data: Array.from(compressedChunk) };
                    } else {
                        encryptedChunk = await encryptChunk(compressedChunk, key);
                    }
                    
                    console.log("indexeddb - processAndStoreFile - encryptedChunk: ", encryptedChunk);
                    // Add to Array
                    const encryptedDataArray = new Uint8Array(encryptedChunk.data);
                    console.log("indexeddb - processAndStoreFile - encryptedDataArray: ", encryptedDataArray);
                    // Hash
                    const hash = await sha256.digest(encryptedDataArray);
                    console.log("indexeddb - processAndStoreFile - hash: ", hash);
                    const cid = CID.create(1, raw.code, hash);
                    const chunkCID = cid.toString();
                    console.log("indexeddb - processAndStoreFile - chunkCID: ", chunkCID);
                    // Store to local Indexed DB
                    await my_files_db.files.put({
                        owner: bNodeId,
                        fileId: fileId,
                        fileName: fileName,
                        chunkCID: chunkCID,
                        chunkIndex: chunkIndex,
                        chunk: encryptedChunk,
                        encryptionMethod: encryptionMethod
                    });
                    // dBase Cloud network
                    if (saveFileToDBase){
                        const chunkMeta = {
                            owner: bNodeId,
                            fileName: fileName,
                            chunkCID: chunkCID,
                            chunkIndex: chunkIndex,
                            encryptedChunk: encryptedChunk,
                            encryptionMethod: encryptionMethod
                        }
                        // Store KV chunkCID,chunkMeta in arrary
                        kvPairs.push({ key: chunkCID, value: chunkMeta });
                    }
                    
                    const encodedFileName = encodeFileName(fileName);
                    if (!localStoreHandle) {
                        localStoreHandle = await getLocalStoreHandle('local');
                        localStoreHandle = localStoreHandle.dbaseFolderHandle;
                    }
                    // Save chunk to local indexeddb
                    await saveChunkToLocalStore(encodedFileName, chunkIndex, encryptedChunk, localStoreHandle);

                    chunkIndex++;
                    offset += chunkSize;
                    progressCallback(Math.min((offset / fileSize) * 100, 100));
                    if (offset < file.size) {
                        readNextChunk();
                    } else {
                        await my_file_meta_data_db.FILE_METADATA.add({
                            owner: bNodeId,
                            fileStoreName: fileId,
                            fileName: fileName,
                            fileSize: fileSize,
                            numChunks: chunkIndex,
                            encryptionMethod: encryptionMethod
                        });
                        await updateFileTable();
                        console.log("indexeddb - processAndStoreFile - File Saved to IndexDb & Local Disk.");
                        // Save to dBase Cloud
                        if (saveFileToDBase) {
                            console.log("indexeddb - processAndStoreFile - file complete, sending KVs to PEERs");
                            const wallet_address = await getAccount();
                            if (wallet_address) {
                                const list_of_peers = await get_peers_for_dbase_file(wallet_address);
                                if(list_of_peers.length >= 1) {
                                    copy_file_to_peers(setWsConnected,setReadyToCommunicate, list_of_peers, kvPairs, peerStoreFolder);
                                } else {
                                    console.log("indexeddb - processAndStoreFile - ERROR: get_peers_for_dbase_file returned zero peers. ");
                                }
                            }
                        }
                        resolve();
                    }
                } catch (error) {
                    reject(error);
                }
            }
        };

        function readNextChunk() {
            const slice = file.slice(offset, offset + chunkSize);
            reader.readAsArrayBuffer(slice);
        }

        readNextChunk();
    });
};

export const updateFileTable = async () => {
    const files = await my_file_meta_data_db.FILE_METADATA.toArray();
    return files;
};

export const deleteFile = async (fileId) => {
    try {
        await my_file_meta_data_db.FILE_METADATA.where('fileStoreName').equals(fileId).delete();
        await my_files_db.files.where('fileId').equals(fileId).delete();
        console.log(`File with ID ${fileId} has been deleted.`);
    } catch (error) {
        console.error("Error deleting file: ", error);
    }
};

export const downloadFile = async (fileId, account, key) => {
    console.log("downloadFile - fileId: ", fileId, ", account: ", account);
    try {
        const chunks = await my_files_db.files.where('fileId').equals(fileId).toArray();
        chunks.sort((a, b) => {
            const indexA = parseInt(a.chunkCID.split('_').pop(), 10);
            const indexB = parseInt(b.chunkCID.split('_').pop(), 10);
            return indexA - indexB;
        });

        const stream = new ReadableStream({
            async start(controller) {
                for (let chunk of chunks) {
                    const decryptedChunk = await decryptChunk(chunk.chunk, key);
                    const decompressedChunk = pako.inflate(decryptedChunk);
                    controller.enqueue(decompressedChunk);
                }
                controller.close();
            }
        });

        const fileMeta = await my_file_meta_data_db.FILE_METADATA.where('fileStoreName').equals(fileId).first();
        const response = new Response(stream);
        const blob = await response.blob();

        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = fileMeta.fileName;
        downloadLink.click();
        URL.revokeObjectURL(downloadLink.href);
        console.log("File download completed for fileId: ", fileId);
    } catch (error) {
        console.error("Error downloading file: ", error);
    }
};

export const downloadLocalStoreFile = async (localStoreFolder, fileName, key) => {
    try {
        const directoryHandle = await localStoreFolder.getDirectoryHandle(`dbase_${fileName}`);
        const chunks = [];

        for await (const fileEntry of directoryHandle.values()) {
            if (fileEntry.kind === 'file') {
                const file = await fileEntry.getFile();
                const fileContent = await file.text();
                const encryptedChunk = JSON.parse(fileContent);
                chunks.push({ encryptedChunk, index: parseInt(fileEntry.name.split('_').pop(), 10) });
            }
        }

        chunks.sort((a, b) => a.index - b.index);

        const stream = new ReadableStream({
            async start(controller) {
                for (let chunk of chunks) {
                    const decryptedChunk = await decryptChunk(chunk.encryptedChunk, key);
                    const decompressedChunk = pako.inflate(decryptedChunk);
                    controller.enqueue(decompressedChunk);
                }
                controller.close();
            }
        });

        const response = new Response(stream);
        const blob = await response.blob();

        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = decodeFileName(fileName);
        downloadLink.click();
        URL.revokeObjectURL(downloadLink.href);

        console.log("File download completed for file: ", fileName);
    } catch (error) {
        console.error("Error downloading local store file: ", error);
    }
};

export async function deriveKeyFromSignature(signature, walletAddress) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(signature),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode(walletAddress),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptChunk(chunk, key) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        chunk
    );
    return {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encryptedData))
    };
}

async function decryptChunk(encrypted, key) {
    const { iv, data } = encrypted;
    const decryptedData = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: new Uint8Array(iv)
        },
        key,
        new Uint8Array(data)
    );
    return decryptedData;
}

export const getFileCount = async () => {
    try {
        const fileCount = await my_file_meta_data_db.FILE_METADATA.count();
        console.log("getFileCount - fileCount: ", fileCount);
        return fileCount;
    } catch (error) {
        console.error("Error getting file count: ", error);
        return 0;
    }
};

export const checkLocalFileExistence = async (localStoreFolder, fileName) => {
    try {
        console.log("indexeddb - checkLocalFileExistence - localStoreFolder: ",localStoreFolder);
        console.log("indexeddb - checkLocalFileExistence - fileName: ",fileName);
        const encodedFileName = encodeFileName(fileName);
        // const directoryName = `dbase_${encodedFileName}`;
        console.log("indexeddb - checkLocalFileExistence - encodedFileName: ",encodedFileName);
        const directoryName = encodedFileName;
        const directoryHandle = await localStoreFolder.getDirectoryHandle(directoryName, { create: false });
        return directoryHandle !== null;
    } catch (error) {
        console.error('Error checking local file existence:', error);
        return false;
    }
};
