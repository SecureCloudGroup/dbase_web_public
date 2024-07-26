import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { connectMetaMask } from '../services/metamask';
import { checkWalletRegistration } from '../services/registration';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faIdBadge, faFolder, faWallet } from '@fortawesome/free-solid-svg-icons';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../static/css/style.css';
import { Modal, Button } from 'react-bootstrap';

const server_address = 'api.securecloudgroup.com';

const Base = ({ children }) => {
    const {
        isConnected,
        verificationFailed,
        bnodeid,
        localStoreFolder,
        handleMetaMaskConnect,
        handleSetLocalStore,
        setBNodeId,
        setIsRegistered,
        useLightTheme,
        toggleTheme,
        readyToCommunicate,
        wsConnected,
        setWsConnected,
        setReadyToCommunicate,
        setNewMessage,
        setNewDataMessage,
        newMessage,
        newDataMessage
    } = useContext(AppContext);

    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState('');
    const [showChangeButton, setShowChangeButton] = useState(false);
    const [showMessagePrompt, setShowMessagePrompt] = useState(false);
    const [incomingMessage, setIncomingMessage] = useState(null);

    const handleClose = () => setShowModal(false);
    const handleShow = (content, showChange = false) => {
        setModalContent(content);
        setShowChangeButton(showChange);
        setShowModal(true);
    };

    const handleReceiveMessage = (data) => {
        const parsedData = JSON.parse(data);
        console.log('client - handleReceiveMessage - message:', parsedData);

        if (parsedData.type === 'text') {
            console.log('client - handleReceiveMessage - Received text message:', parsedData.content);
            setNewMessage(parsedData.content);
            setIncomingMessage(parsedData.content);
            setShowMessagePrompt(true);
        } else if (parsedData.type === 'data') {
            console.log('client - handleReceiveMessage - Received data message:', parsedData);
            setNewDataMessage(parsedData);
            setIncomingMessage(parsedData);
            setShowMessagePrompt(true);
        } else {
            console.log('client - handleReceiveMessage - Unknown message type:', parsedData.type);
        }
    };

    useEffect(() => {
        if (!isConnected) {
            handleMetaMaskConnect().catch(error => console.error('MetaMask connection error:', error));
        }
    }, [isConnected, handleMetaMaskConnect]);

    useEffect(() => {
        if (isConnected && !bnodeid) {
            const checkRegistration = async () => {
                try {
                    const account = await connectMetaMask();
                    const { isRegistered, bnode_id } = await checkWalletRegistration(account);
                    setBNodeId(bnode_id);
                    setIsRegistered(isRegistered);
                } catch (error) {
                    console.error('Error during registration check:', error);
                }
            };

            checkRegistration();
        }
    }, [isConnected, bnodeid, setBNodeId, setIsRegistered]);

    useEffect(() => {
        if (bnodeid) {
            const wsUrl = `wss://${server_address}/ws/${bnodeid}`;
            const websocket = new WebSocket(wsUrl);

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

            return () => {
                if (websocket) {
                    websocket.onclose = null;
                    websocket.onerror = null;
                    websocket.close();
                }
            };
        }
    }, [bnodeid, setWsConnected]);

    const handleSetLocalStoreClick = () => {
        handleSetLocalStore();
        handleClose();
    };

    const themeClass = useLightTheme ? 'light-theme' : 'dark-theme';
    const indicatorConnectedColor = useLightTheme ? '#2ECC71' : '#27AE60'; // Green
    const indicatorDisconnectedColor = useLightTheme ? '#E74C3C' : '#C0392B'; // Red
    const indicatorReadyColor = useLightTheme ? '#2ECC71' : '#27AE60'; // Green
    const indicatorNotReadyColor = useLightTheme ? '#E74C3C' : '#C0392B'; // Red

    return (
        <div className={`background-wrapper ${themeClass}-body`}>
            <nav className={`navbar navbar-expand-lg ${themeClass}-navbar`}>
                <div className="container-fluid">
                    <Link className={`navbar-brand ${themeClass}-text`} to="/">dBase</Link>
                    <div className="collapse navbar-collapse" id="navbarNav">
                        <ul className="navbar-nav">
                            <li className="nav-item">
                                <Link className={`nav-link ${themeClass}-text`} to="/">Home</Link>
                            </li>
                            <li className="nav-item">
                                <Link className={`nav-link ${themeClass}-text`} to="/my_data">My Data</Link>
                            </li>
                            <li className="nav-item">
                                <Link className={`nav-link ${themeClass}-text`} to="/my_local_data">My Local Data</Link>
                            </li>
                            <li className="nav-item">
                                <Link className={`nav-link ${themeClass}-text`} to="/peer_data">Peer Data</Link>
                            </li>
                            <li className="nav-item">
                                <Link className={`nav-link ${themeClass}-text`} to="/dbase_data">dBase Data</Link>
                            </li>
                            <li className="nav-item">
                                <Link className={`nav-link ${themeClass}-text`} to="/file_recover">File Recover</Link>
                            </li>
                        </ul>
                    </div>
                    <div className="ms-auto d-flex align-items-center">
                        <div className="indicators">
                            <div className={`webrtc-status-circle ${wsConnected ? 'connected' : 'disconnected'}`} style={{ backgroundColor: wsConnected ? indicatorConnectedColor : indicatorDisconnectedColor }}>
                                WS
                            </div>
                            <div className={`webrtc-status-circle ${readyToCommunicate ? 'ready' : 'not-ready'}`} style={{ backgroundColor: readyToCommunicate ? indicatorReadyColor : indicatorNotReadyColor }}>
                                CHNL
                            </div>
                        </div>
                        
                        <div className={`toggle-button ${themeClass}-toggle-button`} onClick={toggleTheme}>
                            <span style={{ color: 'white', fontSize: '10px' }}>theme</span>
                        </div>
                        {isConnected ? (
                            <>
                                {!verificationFailed && (
                                    <>
                                        <div
                                            className={`status-circle ${themeClass}-bg-light-blue`}
                                            onClick={() => handleShow(`bNodeId: ${bnodeid || "Not Authorized"}`)}
                                        >
                                            <FontAwesomeIcon icon={faIdBadge} />
                                        </div>
                                        <div
                                            className={`status-circle ${themeClass}-bg-info`}
                                            onClick={() => handleShow(localStoreFolder ? localStoreFolder.name : "Set Local Store", true)}
                                        >
                                            <FontAwesomeIcon icon={faFolder} />
                                        </div>
                                        <div
                                            className={`status-circle ${themeClass}-bg-success`}
                                            onClick={() => handleShow("Wallet Connected")}
                                        >
                                            <FontAwesomeIcon icon={faWallet} />
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <button className="btn btn-primary" onClick={handleMetaMaskConnect}>Connect MetaMask</button>
                        )}
                    </div>
                </div>
            </nav>
            {showMessagePrompt && (
                <div className="message-prompt">
                    <p>Incoming message: {incomingMessage}</p>
                    <button className="btn btn-success" onClick={() => setShowMessagePrompt(false)}>Accept</button>
                    <button className="btn btn-danger" onClick={() => setShowMessagePrompt(false)}>Deny</button>
                </div>
            )}
            <div className="container-fluid d-flex flex-column flex-grow-1">
                {children}
            </div>

            <Modal show={showModal} onHide={handleClose} centered>
                <Modal.Body className={`modal-content ${themeClass}-modal-content`}>
                    <div>{modalContent}</div>
                    {showChangeButton && (
                        <Button variant="secondary" onClick={handleSetLocalStoreClick} className="mt-3 me-3">
                            Change
                        </Button>
                    )}
                    <Button variant="secondary" onClick={handleClose} className="mt-3">
                        Close
                    </Button>
                </Modal.Body>
            </Modal>
        </div>
    );
};

export default Base;
