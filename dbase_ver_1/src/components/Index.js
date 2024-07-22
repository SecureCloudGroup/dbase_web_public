import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';

const Index = () => {
    const { isConnected, bnodeid } = useContext(AppContext);

    return (
        <div>
            <h1>Welcome to dBase_v3</h1>
            <p>{isConnected ? `Connected to MetaMask with BNodeID: ${bnodeid}` : 'Please connect to MetaMask'}</p>
        </div>
    );
};

export default Index;
