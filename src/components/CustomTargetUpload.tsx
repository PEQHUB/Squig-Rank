import { useState, useRef } from 'react';
import type { CustomTarget } from '../types';
import { parseFrequencyResponse } from '../utils/ppi';

const STORAGE_KEY = 'squigrank_custom_targets';

interface CustomTargetUploadProps {
  onTargetAdded: (target: CustomTarget) => void;
  customTargets: CustomTarget[];
  onRemoveTarget: (fileName: string) => void;
}

export function CustomTargetUpload({ onTargetAdded, customTargets, onRemoveTarget }: CustomTargetUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

        const target: CustomTarget = {
          name: file.name.replace('.txt', ''),
          fileName: file.name,
          curve,
          addedAt: new Date().toISOString()
        };

        onTargetAdded(target);
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

  return (
    <div className="custom-target-upload">
      <h3>Custom Targets</h3>
      
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
        <p>Drop target .txt file here or click to upload</p>
      </div>

      {error && <p className="upload-error">{error}</p>}

      {customTargets.length > 0 && (
        <div className="custom-targets-list">
          <h4>Saved Targets ({customTargets.length})</h4>
          <ul>
            {customTargets.map(target => (
              <li key={target.fileName}>
                <span className="target-name">{target.fileName}</span>
                <span className="target-points">({target.curve.frequencies.length} points)</span>
                <button 
                  className="remove-btn"
                  onClick={() => onRemoveTarget(target.fileName)}
                  title="Remove target"
                >
                  x
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Utility functions for localStorage
export function loadCustomTargets(): CustomTarget[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load custom targets from localStorage');
  }
  return [];
}

export function saveCustomTargets(targets: CustomTarget[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
  } catch (e) {
    console.warn('Failed to save custom targets to localStorage');
  }
}
