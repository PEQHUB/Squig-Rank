import { useState, useRef } from 'react';
import { parseFrequencyResponse } from '../utils/ppi';

export function TargetSubmission() {
  const [dragActive, setDragActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // File state
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [targetRig, setTargetRig] = useState<'711' | '5128'>('711');
  
  const fileInputRef711 = useRef<HTMLInputElement>(null);
  const fileInputRef5128 = useRef<HTMLInputElement>(null);

  const handleFile = (file: File, rig: '711' | '5128') => {
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
        const name = file.name.replace('.txt', '').replace(/\s*\(5128\)/i, '');
        setFileName(name);
        setTargetRig(rig);
        setError(null);
      } catch (err) {
        setError('Failed to parse frequency response file');
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent, rig: '711' | '5128') => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(rig);
    } else if (e.type === 'dragleave') {
      setDragActive(null);
    }
  };

  const handleDrop = (e: React.DragEvent, rig: '711' | '5128') => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0], rig);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, rig: '711' | '5128') => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0], rig);
    }
  };

  const handleSubmit = () => {
    if (!fileContent || !fileName) return;

    // Construct final filename based on rig
    let finalName = fileName;
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
      <p className="subtitle" style={{marginBottom: '24px'}}>
        Contribute a target curve to the public database. Select the appropriate rig type.
      </p>
      
      {!fileContent ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* 711 Drop Zone */}
          <div 
            className={`drop-zone ${dragActive === '711' ? 'active' : ''}`}
            onDragEnter={(e) => handleDrag(e, '711')}
            onDragLeave={(e) => handleDrag(e, '711')}
            onDragOver={(e) => handleDrag(e, '711')}
            onDrop={(e) => handleDrop(e, '711')}
            onClick={() => fileInputRef711.current?.click()}
            style={{ borderColor: 'var(--accent-primary)' }}
          >
            <input 
              ref={fileInputRef711}
              type="file" 
              accept=".txt" 
              onChange={(e) => handleChange(e, '711')}
              style={{ display: 'none' }}
            />
            <div style={{ pointerEvents: 'none' }}>
              <span className="rig-badge rig-711" style={{ fontSize: '12px', marginBottom: '8px', display: 'inline-block' }}>711</span>
              <p>Upload 711 Target</p>
            </div>
          </div>

          {/* 5128 Drop Zone */}
          <div 
            className={`drop-zone ${dragActive === '5128' ? 'active' : ''}`}
            onDragEnter={(e) => handleDrag(e, '5128')}
            onDragLeave={(e) => handleDrag(e, '5128')}
            onDragOver={(e) => handleDrag(e, '5128')}
            onDrop={(e) => handleDrop(e, '5128')}
            onClick={() => fileInputRef5128.current?.click()}
            style={{ borderColor: 'var(--quality-high)' }}
          >
            <input 
              ref={fileInputRef5128}
              type="file" 
              accept=".txt" 
              onChange={(e) => handleChange(e, '5128')}
              style={{ display: 'none' }}
            />
            <div style={{ pointerEvents: 'none' }}>
              <span className="rig-badge rig-5128" style={{ fontSize: '12px', marginBottom: '8px', display: 'inline-block' }}>5128</span>
              <p>Upload 5128 Target</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="submission-preview">
          <div className="preview-header">
            <span className="file-name">
              <span className={`rig-badge rig-${targetRig}`} style={{ marginRight: '10px' }}>{targetRig}</span>
              {fileName}{targetRig === '5128' ? ' (5128)' : ''}.txt
            </span>
            <button className="reset-btn" onClick={() => {
              setFileContent(null);
              setFileName(null);
            }}>Change File</button>
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
