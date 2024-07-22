import { signData, connectMetaMask } from './metamask';

// const server_address = 'https://localhost:9999';
const server_address = 'https://api.securecloudgroup.com';

export const checkWalletRegistration = async (address) => {
    try {
        const response = await fetch(`${server_address}/check_wallet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ wallet_address: address }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log("registration - checkWalletRegistration - data: ",data);
            if (data.wallet_status === 'not_registered') {
                const register = window.confirm("Would you like to register for a new BNodeID? (or you may disconnect MetaMask and reconnect another wallet)");
                if (register) {
                    const bnode_id = await handleRegistration(address);
                    return { isRegistered: true, bnode_id };
                } else {
                    return { isRegistered: false, bnode_id: '' };
                }
            } else if (data.wallet_status === 'registered') {
                return { isRegistered: true, bnode_id: data.BNodeID };
            }
        } else {
            console.error('Registration - MetaMask login error:');
            return { isRegistered: false, bnode_id: 'NA' }; // Fallback response
        }
    } catch (err) {
        console.error('Registration - MetaMask login error:', err);
        return { isRegistered: false, bnode_id: 'NA'};
    }
};

export const handleRegistration = async (address) => {
    try {
        const response = await fetch(`${server_address}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ wallet_address: address }),
        });

        if (response.ok) {
            console.log("registration - handleRegistration - response: ", response.status);
            const data = await response.json();
            console.log("registration - handleRegistration - data: ", data);
            if (data.status === 'Success') {
                console.log("registration - handleRegistration Success- data.status: ", data.status);
                return data.BNodeID;
            } else if (data.status === 'Error' && data.message.includes('Public Address already registered')) {
                // Handle the case where the address is already registered
                console.log("registration - handleRegistration Error - data.status: ", data.status);
                return data.BNodeID;
            } else {
                console.log("registration - handleRegistration - throw Error - Registration failed");
                throw new Error('Registration failed');
            }
        } else {
            console.log("registration - handleRegistration - throw Error - Failed to register");
            throw new Error('Failed to register');
        }
    } catch (error) {
        console.log("registration - handleRegistration - catch Error - Registration error:", error);
        console.error('Registration error:', error);
        throw error;
    }
};
