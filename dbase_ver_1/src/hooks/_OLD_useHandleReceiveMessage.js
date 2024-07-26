import { useContext } from 'react';
import { AppContext } from '../context/AppContext';

const useHandleReceiveMessage = () => {
    const { setNewMessage, setNewDataMessage, setReadyToCommunicate } = useContext(AppContext);

    const handleReceiveMessage = (data) => {
        const parsedData = JSON.parse(data);
        console.log('client - handleReceiveMessage - message:', parsedData);

        if (parsedData.type === 'text') {
            console.log('client - handleReceiveMessage - Received text message:', parsedData.content);
            setNewMessage(parsedData.content);
        } else if (parsedData.type === 'data') {
            console.log('client - handleReceiveMessage - Received data message:', parsedData);
            setNewDataMessage(parsedData);
        } else {
            console.log('client - handleReceiveMessage - Unknown message type:', parsedData.type);
        }
    };

    return handleReceiveMessage;
};

export default useHandleReceiveMessage;
