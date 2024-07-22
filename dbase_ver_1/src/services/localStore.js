import pako from 'pako';

export const getLocalStoreFiles = async (localStoreFolder) => {
    try {
        const files = [];
        for await (const entry of localStoreFolder.values()) {
            if (entry.kind === 'directory') {
                const directoryHandle = await localStoreFolder.getDirectoryHandle(entry.name);
                let fileSize = 0;
                let numChunks = 0;

                for await (const fileEntry of directoryHandle.values()) {
                    if (fileEntry.kind === 'file') {
                        const file = await fileEntry.getFile();
                        fileSize += file.size;
                        numChunks++;
                    }
                }

                files.push({
                    name: entry.name,
                    size: fileSize,
                    owner: 'OwnerName', // Replace with actual owner data if available
                    fileStoreName: entry.name, // Use directory name as fileStoreName
                    numChunks: numChunks
                });
            }
        }
        return files;
    } catch (error) {
        console.error('Error fetching local store files:', error);
        return [];
    }
};

export const deleteLocalStoreFile = async (localStoreFolder, fileName) => {
    try {
        const directoryHandle = await localStoreFolder.getDirectoryHandle(fileName);
        for await (const entry of directoryHandle.values()) {
            await directoryHandle.removeEntry(entry.name);
        }
        await localStoreFolder.removeEntry(fileName);
    } catch (error) {
        console.error('Error deleting local store file:', error);
    }
};

export const getLocalFileCount = async (localStoreFolder) => {
    try {
        let count = 0;
        for await (const entry of localStoreFolder.values()) {
            if (entry.kind === 'directory') {
                count++;
            }
        }
        return count;
    } catch (error) {
        console.error('Error getting local file count:', error);
        return 0;
    }
};

export const downloadLocalStoreFile = async (localStoreFolder, fileName, key, onProgress) => {
    try {
        const directoryName = fileName;
        const directoryHandle = await localStoreFolder.getDirectoryHandle(directoryName);
        const chunks = [];
        let totalChunks = 0;
        let processedChunks = 0;

        for await (const fileEntry of directoryHandle.values()) {
            if (fileEntry.kind === 'file') {
                totalChunks++;
            }
        }

        for await (const fileEntry of directoryHandle.values()) {
            if (fileEntry.kind === 'file') {
                const file = await fileEntry.getFile();
                const fileContent = await file.text();
                const encryptedChunk = JSON.parse(fileContent);
                chunks.push({ encryptedChunk, index: parseInt(fileEntry.name.split('_').pop(), 10) });

                processedChunks++;
                onProgress(Math.round((processedChunks / totalChunks) * 100));
            }
        }

        chunks.sort((a, b) => a.index - b.index);

        const fileChunks = [];
        for (let chunk of chunks) {
            const decryptedChunk = await decryptChunk(chunk.encryptedChunk, key);
            const decompressedChunk = pako.inflate(decryptedChunk);
            fileChunks.push(decompressedChunk);
        }

        const blob = new Blob(fileChunks, { type: 'application/octet-stream' });
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

export const getPeerStoreFiles = async (peerStoreFolder) => {
    try {
        const files = [];
        for await (const entry of peerStoreFolder.values()) {
            if (entry.kind === 'directory') {
                const directoryHandle = await peerStoreFolder.getDirectoryHandle(entry.name);
                let fileSize = 0;
                let numChunks = 0;

                for await (const fileEntry of directoryHandle.values()) {
                    if (fileEntry.kind === 'file') {
                        const file = await fileEntry.getFile();
                        fileSize += file.size;
                        numChunks++;
                    }
                }

                files.push({
                    name: entry.name,
                    size: fileSize,
                    owner: 'OwnerName', // Replace with actual owner data if available
                    fileStoreName: entry.name, // Use directory name as fileStoreName
                    numChunks: numChunks
                });
            }
        }
        return files;
    } catch (error) {
        console.error('Error fetching peer store files:', error);
        return [];
    }
};

export const deletePeerStoreFile = async (peerStoreFolder, fileName) => {
    try {
        const directoryHandle = await peerStoreFolder.getDirectoryHandle(fileName);
        for await (const entry of directoryHandle.values()) {
            await directoryHandle.removeEntry(entry.name);
        }
        await peerStoreFolder.removeEntry(fileName);
    } catch (error) {
        console.error('Error deleting peer store file:', error);
    }
};

export const getPeerFileCount = async (peerStoreFolder) => {
    try {
        let count = 0;
        for await (const entry of peerStoreFolder.values()) {
            if (entry.kind === 'directory') {
                count++;
            }
        }
        return count;
    } catch (error) {
        console.error('Error getting peer file count:', error);
        return 0;
    }
};

export const downloadPeerStoreFile = async (peerStoreFolder, fileName, key, onProgress) => {
    try {
        const directoryName = fileName;
        const directoryHandle = await peerStoreFolder.getDirectoryHandle(directoryName);
        const chunks = [];
        let totalChunks = 0;
        let processedChunks = 0;

        for await (const fileEntry of directoryHandle.values()) {
            if (fileEntry.kind === 'file') {
                totalChunks++;
            }
        }

        for await (const fileEntry of directoryHandle.values()) {
            if (fileEntry.kind === 'file') {
                const file = await fileEntry.getFile();
                const fileContent = await file.text();
                const encryptedChunk = JSON.parse(fileContent);
                chunks.push({ encryptedChunk, index: parseInt(fileEntry.name.split('_').pop(), 10) });

                processedChunks++;
                onProgress(Math.round((processedChunks / totalChunks) * 100));
            }
        }

        chunks.sort((a, b) => a.index - b.index);

        const fileChunks = [];
        for (let chunk of chunks) {
            const decryptedChunk = await decryptChunk(chunk.encryptedChunk, key);
            const decompressedChunk = pako.inflate(decryptedChunk);
            fileChunks.push(decompressedChunk);
        }

        const blob = new Blob(fileChunks, { type: 'application/octet-stream' });
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = decodeFileName(fileName);
        downloadLink.click();
        URL.revokeObjectURL(downloadLink.href);
        console.log("File download completed for file: ", fileName);
    } catch (error) {
        console.error("Error downloading peer store file: ", error);
    }
};

// async function decryptChunk(encrypted, key) {
//     const { iv, data } = encrypted;
//     const decryptedData = await window.crypto.subtle.decrypt(
//         {
//             name: "AES-GCM",
//             iv: new Uint8Array(iv)
//         },
//         key,
//         new Uint8Array(data)
//     );
//     return decryptedData;
// }


