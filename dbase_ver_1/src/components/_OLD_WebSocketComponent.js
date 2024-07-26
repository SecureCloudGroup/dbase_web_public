import React, { useEffect, useContext } from 'react';
import useHandleReceiveMessage from '../hooks/useHandleReceiveMessage';
import { AppContext } from '../context/AppContext';

const server_address = 'api.securecloudgroup.com';

const WebSocketComponent = ({ bnodeid }) => {
    const { setWsConnected } = useContext(AppContext);
    const handleReceiveMessage = useHandleReceiveMessage();

    useEffect(() => {
        let websocket;
        const wsUrl = `wss://${server_address}/ws/${bnodeid}`;

        const initializeWebSocket = () => {
            websocket = new WebSocket(wsUrl);

            websocket.onopen = () => {
                console.log('WebSocket connection opened');
                setWsConnected(true);
            };

            websocket.onmessage = (event) => {
                handleReceiveMessage(event.data);
            };

            websocket.onclose = (event) => {
                console.log('WebSocket connection closed', event);
                setWsConnected(false);
            };

            websocket.onerror = (error) => {
                console.log('WebSocket error', error);
                setWsConnected(false);
            };
        };

        if (bnodeid) {
            initializeWebSocket();
        }

        return () => {
            if (websocket) {
                websocket.onclose = null;
                websocket.onerror = null;
                websocket.close();
            }
        };
    }, [bnodeid, setWsConnected, handleReceiveMessage]);

    return null;
};

export default WebSocketComponent;
