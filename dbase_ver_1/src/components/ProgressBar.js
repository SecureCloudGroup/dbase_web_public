import React from 'react';
import PropTypes from 'prop-types';

const ProgressBar = ({ progress }) => (
    <div className="progress">
        <div className="progress-bar" role="progressbar" style={{ width: `${progress}%` }} aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
            {progress}%
        </div>
    </div>
);

ProgressBar.propTypes = {
    progress: PropTypes.number.isRequired,
};

export default ProgressBar;
