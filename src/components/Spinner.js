import React from 'react';

const Spinner = () => (
    <div className="spinner-border text-primary" role="status">
        {/* <h1>Loading</h1> */}
        <span className="sr-only">Uploading File to IndexedDb & Local Disk.</span>
    </div>
);

export default Spinner;
