export const connectMetaMask = async () => {
    console.log("metamask - connectMetaMask called...");
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            console.log('metamask - Connected to MetaMask:', accounts[0]);
            return accounts[0];
        } catch (error) {
            console.error('metamask -  User denied account access:', error);
        }
    } else {
        console.error('metamask -  MetaMask is not installed');
    }
};

export const signData = async (data) => {
    console.log("metamask -  signData called...");
    console.log("metamask -  signData - data: ",data);
    // Use TextEncoder to encode the message to a Uint8Array
    const encoder = new TextEncoder();
    const encodedMessage = encoder.encode(data);
    // Convert the Uint8Array to a hex string
    const msg = `0x${Array.from(encodedMessage).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
    console.log("metamask -  signData - msg: ", msg);
    try {
        const account = await connectMetaMask();
        const signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [msg, account],
        });
        console.log("metamask - signData - data: ", data);
        console.log("metamask - signData - msg: ", msg);
        console.log("metamask - signData - account: ", account);
        console.log("metamask - signData - signature: ", signature);
        return signature;
    } catch (error) {
        console.error('metamask - signData - Error signing data:', error);
    }
};

export async function getAccount() {
    const accounts = await window.ethereum // Or window.ethereum if you don't support EIP-6963.
      .request({ method: "eth_requestAccounts" })
        .catch((err) => {
          if (err.code === 4001) {
            // If this happens, the user rejected the connection request.
            console.log("Please connect to MetaMask.");
          } else {
            console.error(err);
          }
        });
    const account = accounts[0];
    return account;
  }

export const isMetaMaskConnected = async () => {
    console.log("metamask - isMetaMaskConnected called...");
    if (window.ethereum) {
        console.log("metamask - window.ethereum: ",window.ethereum);
        try {
            console.log("metamask - isMetaMaskConnected - checking wallet.");
            const resp_account = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const account = resp_account[0];
            console.log("metamask - isMetaMaskConnected - account: ",account);
            // return accounts && accounts.length > 0;
            if (account && account.length > 0){
                console.log("metamask - isMetaMaskConnected - IS CONNECTED.");
                console.log("metamask - account: ", account);
                return {"account": account, "connected" :true};
            } else {
                return {"account": "", "connected" :false};
            }
        } catch (err) {
            if (err.code === -32002) {
                console.warn('MetaMask - Request already pending. Please wait.');
            } else {
                console.error('metamask - Error checking MetaMask connection:', err);
            }
            return { "account": "", "connected": false };
        }
    } else {
        console.log('metamask - MetaMask is not installed');
        console.error('metamask - MetaMask is not installed');
        return { "account": "", "connected": false };
    }
};

export const getPublicKey = async () => {
    console.log("metamask - getPublicKey called...");
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];
            console.log('metamask - Connected to MetaMask:', account);

            // Request the public key
            const publicKey = await window.ethereum.request({
                method: 'eth_getEncryptionPublicKey',
                params: [account],
            });

            console.log('metamask - Public Key:', publicKey);
            return publicKey;
        } catch (error) {
            console.error('metamask - Error retrieving public key:', error);
        }
    } else {
        console.error('metamask - MetaMask is not installed');
    }
};