import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Base from './components/Base';
import MyData from './components/MyData';
import PeerData from './components/PeerData';
import DBaseData from './components/DBaseData';
import FileRecover from './components/FileRecover';
import Index from './components/Index';
import MyLocalData from './components/MyLocalData';
import { AppProvider } from './context/AppContext';

// Import Bootstrap CSS
import 'bootstrap/dist/css/bootstrap.min.css';
const App = () => {
    return (
        <AppProvider>
            <Base>
                <Routes>
                    <Route exact path="/" element={<Index />} />
                    <Route path="/my_data" element={<MyData />} />
                    <Route path="/my_local_data" element={<MyLocalData />} />
                    <Route path="/peer_data" element={<PeerData />} />
                    <Route path="/dbase_data" element={<DBaseData />} />
                    <Route path="/file_recover" element={<FileRecover />} />
                </Routes>
            </Base>
        </AppProvider>
    );
};

export default App;
