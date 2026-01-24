import { useState, useRef } from 'react';
import { parseFrequencyResponse } from '../utils/ppi';

export function TargetSubmission() {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [targetRig, setTargetRig] = useState<'711' | '5128'>('711');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.txt')) {
      setError('Please upload a .txt file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const curve = parseFrequencyResponse(text);
        
        if (curve.frequencies.length < 10) {
          setError('Invalid frequency response file (need at least 10 data points)');
          return;
        }

        setFileContent(text);
        
        // Auto-detect 5128 from filename
        const name = file.name.replace('.txt', '');
        if (name.toLowerCase().includes('5128')) {
          setTargetRig('5128');
        } else {
          setTargetRig('711');
        }
        
        setFileName(name);
        setError(null);
      } catch (err) {
        setError('Failed to parse frequency response file');
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = () => {
    if (!fileContent || !fileName) return;

    // Construct final filename based on rig
    let finalName = fileName;
    
    // Remove existing (5128) suffix if present to avoid duplication
    finalName = finalName.replace(/\s*\(5128\)/i, '');
    
    if (targetRig === '5128') {
      finalName = `${finalName} (5128)`;
    }

    // Format the issue body
    const body = `Please add this target to the ranking database.\nRig: ${targetRig}\n\n\`\`\`text\n${fileContent}\n\`\`\``;
    const title = `Add Target: ${finalName}`;
    
    // Create GitHub Issue URL
    const repoUrl = "https://github.com/PEQHUB/Squig-Rank/issues/new";
    const params = new URLSearchParams({
      title: title,
      body: body,
      labels: 'add-target'
    });

    // Open in new tab
    window.open(`${repoUrl}?${params.toString()}`, '_blank');
  };

  return (
    <div className="custom-target-upload">
      <h3>Submit New Target</h3>
      <p className="subtitle" style={{marginBottom: '16px'}}>
        Contribute a target curve to the public database.
      </p>
      
      {!fileContent ? (
        <div 
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".txt" 
            onChange={handleChange}
            style={{ display: 'none' }}
          />
          <p>Drop target .txt file here to contribute</p>
        </div>
      ) : (
        <div className="submission-preview">
          <div className="preview-header">
            <span className="file-name">
              {fileName}
              {targetRig === '5128' && !fileName?.includes('(5128)') ? ' (5128)' : ''}
              .txt
            </span>
            <button className="reset-btn" onClick={() => {
              setFileContent(null);
              setFileName(null);
            }}>Change File</button>
          </div>
          
          <div className="rig-selector" style={{ marginBottom: '20px', textAlign: 'center' }}>
            <p style={{ marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>Target Rig Type:</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                cursor: 'pointer',
                padding: '8px 16px',
                background: targetRig === '711' ? 'var(--glass-2)' : 'transparent',
                border: `1px solid ${targetRig === '711' ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                borderRadius: '8px',
                color: targetRig === '711' ? 'var(--text-primary)' : 'var(--text-muted)'
              }}>
                <input 
                  type="radio" 
                  name="rig" 
                  value="711" 
                  checked={targetRig === '711'} 
                  onChange={() => setTargetRig('711')}
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
                Standard (711)
              </label>
              
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                cursor: 'pointer',
                padding: '8px 16px',
                background: targetRig === '5128' ? 'var(--glass-2)' : 'transparent',
                border: `1px solid ${targetRig === '5128' ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                borderRadius: '8px',
                color: targetRig === '5128' ? 'var(--text-primary)' : 'var(--text-muted)'
              }}>
                <input 
                  type="radio" 
                  name="rig" 
                  value="5128" 
                  checked={targetRig === '5128'} 
                  onChange={() => setTargetRig('5128')}
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
                B&K 5128
              </label>
            </div>
          </div>
          
          <div className="submission-actions">
            <p>Ready to submit! This will open a GitHub Issue.</p>
            <button className="submit-btn" onClick={handleSubmit}>
              Proceed to GitHub
            </button>
          </div>
        </div>
      )}

      {error && <p className="upload-error">{error}</p>}
    </div>
  );
}
