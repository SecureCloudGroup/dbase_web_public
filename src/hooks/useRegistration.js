import { useContext, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { connectMetaMask } from '../services/metamask';
import { checkWalletRegistration } from '../services/registration';

const useRegistration = () => {
    const { setBNodeId, setIsRegistered } = useContext(AppContext);

    const registerWallet = useCallback(async (account) => {
        const resp = await checkWalletRegistration(account);
        setBNodeId(resp.bnode_id);
        setIsRegistered(resp.isRegistered);
    }, [setBNodeId, setIsRegistered]);

    return { checkWalletRegistration: registerWallet };
};

export default useRegistration;
