import { useState, useRef } from 'react';
import { parseFrequencyResponse } from '../utils/ppi';

export function TargetSubmission() {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
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
        setFileName(file.name.replace('.txt', ''));
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

    // Format the issue body
    const body = `Please add this target to the ranking database.\n\n\`\`\`text\n${fileContent}\n\`\`\``;
    const title = `Add Target: ${fileName}`;
    
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
            <span className="file-name">{fileName}</span>
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
