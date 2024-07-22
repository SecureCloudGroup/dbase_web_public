import React from 'react';
import PropTypes from 'prop-types';

const ErrorModal = ({ isOpen, onClose, errorDetails }) => {
    
    const handleClose = () => {
        onClose();
        window.location.reload(); // Reload the page
    };
    
    return (
        <div className={`modal fade show ${isOpen ? 'd-block' : 'd-none'}`} tabIndex="-1" role="dialog" aria-labelledby="errorModalLabel" aria-hidden="true">
            <div className="modal-dialog" role="document">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title" id="errorModalLabel">Error</h5>
                        <button type="button" className="close" aria-label="Close" onClick={onClose}>
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div className="modal-body text-danger">
                        <p>{errorDetails}</p>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

ErrorModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    errorDetails: PropTypes.string.isRequired,
};

export default ErrorModal;
