import React from 'react';
import PropTypes from 'prop-types';

const OrangeModal = ({ isOpen, onClose, onConfirm, fileId, fileName }) => {
    if (!isOpen) return null;

    return (
        <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-labelledby="orangeModalLabel" aria-hidden="true">
            <div className="modal-dialog" role="document">
                <div className="modal-content">
                    <div className="modal-header" style={{ backgroundColor: 'orange', color: 'white' }}>
                        <h5 className="modal-title" id="orangeModalLabel">Final Confirmation</h5>
                        <button type="button" className="close text-white" aria-label="Close" onClick={onClose}>
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div className="modal-body">
                        Are you positive that you want to delete this file?
                        <br />
                        <strong>ID:</strong> {fileId}
                        <br />
                        <strong>NAME:</strong> {fileName}
                        <br /><br />
                        <strong className="text-danger">*** THIS CAN NOT BE UNDONE ***</strong>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-danger" onClick={onConfirm}>Delete</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

OrangeModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    fileId: PropTypes.string.isRequired,
    fileName: PropTypes.string.isRequired,
};

export default OrangeModal;
