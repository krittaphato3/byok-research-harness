import React, { useState } from 'react';
import { X, Key, ShieldCheck } from 'lucide-react';
import type { VaultKey } from '../types';

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  keys: VaultKey[];
  onRefreshKeys: () => void;
}

export const VaultModal: React.FC<VaultModalProps> = ({
  isOpen,
  onClose,
  keys,
}) => {
  const [provider, setProvider] = useState('local_openai');
  const [apiKey, setApiKey] = useState('');
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await fetch('/api/vault/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ provider }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestStatus(`Connected successfully! ${data.model_count} models discovered.`);
      } else {
        setTestStatus(`Connection failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setTestStatus(`Error: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    try {
      await fetch('/api/vault/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          provider,
          api_key: apiKey.trim(),
          is_default: 'true',
        }),
      });
      setApiKey('');
      setTestStatus('Key saved securely to AES-256-GCM vault.');
    } catch (err: any) {
      setTestStatus(`Failed to save: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1e1f20] border border-[#3c4043] rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#282a2c] pb-3">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-[#a8c7fa]" />
            <h3 className="text-sm font-semibold text-white">BYOK Key Vault</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#282a2c] rounded-full text-[#8e918f] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Configured Keys */}
        <div className="space-y-2">
          <label className="text-[#8e918f] uppercase tracking-wider font-mono text-[10px]">
            Encrypted Credentials
          </label>
          <div className="p-3 bg-[#131314] border border-[#282a2c] rounded-xl flex items-center justify-between font-mono">
            <div>
              <div className="text-white font-medium flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{keys[0]?.provider || 'local_openai'}</span>
              </div>
              <div className="text-[#8e918f] text-[10px] mt-0.5">
                Hint: {keys[0]?.key_hint || '****6341'} (AES-256-GCM)
              </div>
            </div>
            <button
              onClick={handleTestKey}
              disabled={isTesting}
              className="px-2.5 py-1 bg-[#282a2c] hover:bg-[#37393b] text-white rounded text-[11px] transition-colors"
            >
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {testStatus && (
            <div
              className={`text-[11px] font-mono p-2 rounded ${
                testStatus.includes('successfully') || testStatus.includes('saved')
                  ? 'text-emerald-400 bg-emerald-950/20 border border-emerald-900/50'
                  : 'text-rose-400 bg-rose-950/20 border border-rose-900/50'
              }`}
            >
              {testStatus}
            </div>
          )}
        </div>

        {/* Update Key Form */}
        <form onSubmit={handleSaveKey} className="space-y-3">
          <div>
            <label className="text-[#8e918f] block mb-1">Provider ID</label>
            <input
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-[#131314] border border-[#3c4043] rounded-lg p-2 text-white font-mono focus:outline-none focus:border-[#a8c7fa]"
            />
          </div>
          <div>
            <label className="text-[#8e918f] block mb-1">Update Secret API Key</label>
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-[#131314] border border-[#3c4043] rounded-lg p-2 text-white font-mono focus:outline-none focus:border-[#a8c7fa]"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#282a2c] text-white hover:bg-[#37393b]"
            >
              Close
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-[#1a73e8] hover:bg-[#1b66c9] text-white font-medium"
            >
              Save to Vault
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
