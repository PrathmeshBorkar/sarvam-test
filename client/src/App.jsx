import React, { useState, useEffect } from 'react';
import CitizenReport from './pages/CitizenReport.jsx';
import CitizenStatus from './pages/CitizenStatus.jsx';
import OfficialsDash from './pages/OfficialsDash.jsx';
import ContractorProof from './pages/ContractorProof.jsx';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  // Route matching
  const renderRoute = () => {
    if (currentPath === '/' || currentPath === '') {
      return <CitizenReport onNavigate={navigate} />;
    }
    if (currentPath.startsWith('/status/')) {
      const token = currentPath.replace('/status/', '');
      return <CitizenStatus token={token} onNavigate={navigate} />;
    }
    if (currentPath === '/officials') {
      return <OfficialsDash onNavigate={navigate} />;
    }
    if (currentPath.startsWith('/contractor/')) {
      const id = currentPath.replace('/contractor/', '');
      return <ContractorProof reportId={id} onNavigate={navigate} />;
    }
    return <CitizenReport onNavigate={navigate} />;
  };

  return (
    <div>
      {/* Universal Navigation Header */}
      <header className="header">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <span style={{ fontSize: 24 }}>🏛️</span>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700 }}>CivicVoice</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Voice-First Indian Language Portal</p>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${currentPath === '/' ? 'btn-primary' : 'btn-outline'}`}
            style={{ width: 'auto', padding: '6px 12px', fontSize: 13, minHeight: 36 }}
            onClick={() => navigate('/')}
          >
            Report
          </button>
          <button
            className={`btn ${currentPath === '/officials' ? 'btn-primary' : 'btn-outline'}`}
            style={{ width: 'auto', padding: '6px 12px', fontSize: 13, minHeight: 36 }}
            onClick={() => navigate('/officials')}
          >
            Officials
          </button>
        </nav>
      </header>

      {/* Main Page View */}
      <main style={{ paddingBottom: 40 }}>
        {renderRoute()}
      </main>
    </div>
  );
}
