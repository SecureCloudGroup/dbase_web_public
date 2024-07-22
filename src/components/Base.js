import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import PropTypes from 'prop-types';
import { connectMetaMask } from '../services/metamask';
import { checkWalletRegistration } from '../services/registration';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faIdBadge, faFolder, faWallet } from '@fortawesome/free-solid-svg-icons';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../static/css/style.css';
import { Modal, Button } from 'react-bootstrap';

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
        toggleTheme
    } = useContext(AppContext);

    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState('');
    const [showChangeButton, setShowChangeButton] = useState(false);

    const handleClose = () => {
        setShowModal(false);
        setShowChangeButton(false);
    };
    const handleShow = (content, showChange) => {
        setModalContent(content);
        setShowChangeButton(showChange || false);
        setShowModal(true);
    };

    const bnodeidRef = useRef(null);
    const localStoreFolderRef = useRef(null);
    const walletConnectedRef = useRef(null);

    useEffect(() => {
        if (!isConnected) {
            handleMetaMaskConnect();
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

    const handleSetLocalStoreClick = () => {
        handleSetLocalStore();
        handleClose();
    };

    const themeClass = useLightTheme ? 'light-theme' : 'dark-theme';

    return (
        <div className={`background-wrapper ${themeClass}-body`}>
            <nav className={`navbar navbar-expand-lg ${themeClass}-navbar`}>
                <div className="container-fluid">
                    <Link className={`navbar-brand ${themeClass}-text`} to="/">dBase_v3</Link>
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
                        <div
                            className={`toggle-button ${themeClass}-toggle-button`}
                            onClick={toggleTheme}
                        >
                            {/* <FontAwesomeIcon icon={faIdBadge} /> */}
                            <a style={{ color: 'white', fontSize: '10px' }}>theme</a>

                        </div>
                        {isConnected ? (
                            <>
                                {verificationFailed ? (
                                    <button className="btn btn-warning me-2" onClick={handleVerifyRegistration}>Sign Challenge</button>
                                ) : (
                                    <>
                                        <div
                                            ref={bnodeidRef}
                                            className={`status-circle ${themeClass}-bg-light-blue`}
                                            onClick={() => handleShow(`bNodeId: ${bnodeid || "Not Authorized"}`)}
                                        >
                                            <FontAwesomeIcon icon={faIdBadge} />
                                        </div>
                                        <div
                                            ref={localStoreFolderRef}
                                            className={`status-circle ${themeClass}-bg-info`}
                                            onClick={() => handleShow(localStoreFolder ? localStoreFolder.name : "Set Local Store", true)}
                                        >
                                            <FontAwesomeIcon icon={faFolder} />
                                        </div>
                                        <div
                                            ref={walletConnectedRef}
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

Base.propTypes = {
    children: PropTypes.node.isRequired,
};

export default Base;
