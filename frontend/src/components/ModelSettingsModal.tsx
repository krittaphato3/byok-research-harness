import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  RefreshCw,
  ArrowLeft,
  Eye,
  EyeOff,
  Trash2,
  Check,
  AlertCircle,
  MoreHorizontal,
  Box,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import type { ProviderConfig, PresetProvider, ModelItem } from '../types';
import { PRESET_PROVIDERS } from '../presets';

interface ModelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProvidersUpdated: () => void;
  initialProviderId?: string;
}

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  isOpen,
  onClose,
  onProvidersUpdated,
  initialProviderId,
}) => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(initialProviderId || '');
  const [isAddingProvider, setIsAddingProvider] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAddingModel, setIsAddingModel] = useState<boolean>(false);
  const [newModelName, setNewModelName] = useState<string>('');
  const [newModelTags, setNewModelTags] = useState<string>('');
  const [showDropdownMenu, setShowDropdownMenu] = useState<boolean>(false);

  // Active Provider Form State
  const [formData, setFormData] = useState<{
    id: string;
    provider: string;
    label: string;
    base_url: string;
    api_format: string;
    api_key: string;
    key_hint: string;
    models: ModelItem[];
    is_enabled: boolean;
    is_default: boolean;
  }>({
    id: '',
    provider: '',
    label: '',
    base_url: '',
    api_format: 'chat_completions',
    api_key: '',
    key_hint: '',
    models: [],
    is_enabled: true,
    is_default: false,
  });

  const loadProviders = async () => {
    try {
      const res = await fetch('/api/vault/providers');
      const data = await res.json();
      if (data.providers) {
        setProviders(data.providers);
        if (!selectedProviderId && data.providers.length > 0) {
          const defaultProv = data.providers.find((p: ProviderConfig) => p.is_default) || data.providers[0];
          selectProvider(defaultProv);
        } else if (selectedProviderId) {
          const match = data.providers.find((p: ProviderConfig) => p.id === selectedProviderId);
          if (match) selectProvider(match);
        }
      }
    } catch (e) {
      console.error('Failed to load providers', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProviders();
      setIsAddingProvider(false);
      setTestResult(null);
    }
  }, [isOpen]);

  const selectProvider = (prov: ProviderConfig) => {
    setSelectedProviderId(prov.id);
    setIsAddingProvider(false);
    setTestResult(null);
    setFormData({
      id: prov.id,
      provider: prov.provider,
      label: prov.label || prov.provider,
      base_url: prov.base_url || 'http://localhost:20128/v1',
      api_format: prov.api_format || 'chat_completions',
      api_key: '', // Decrypted key isn't stored in plain, blank keeps existing key
      key_hint: prov.key_hint || '',
      models: prov.models || [],
      is_enabled: Boolean(prov.is_enabled),
      is_default: Boolean(prov.is_default),
    });
  };

  const handleSelectPreset = (preset: PresetProvider) => {
    const isCustom = preset.id === 'custom-provider';
    const newModels: ModelItem[] = preset.models.map((m) => ({
      id: m,
      name: m,
      tags: m.includes('1M') ? ['1M'] : m.includes('fast') ? ['Fast'] : ['Chat'],
      is_enabled: true,
    }));

    setFormData({
      id: '',
      provider: isCustom ? 'custom' : preset.id,
      label: isCustom ? 'Custom Provider' : preset.name,
      base_url: preset.defaultBaseUrl,
      api_format: preset.defaultFormat,
      api_key: '',
      key_hint: '',
      models: newModels,
      is_enabled: true,
      is_default: false,
    });
    setIsAddingProvider(false);
    setSelectedProviderId('new');
    setTestResult(null);
  };

  const handleSaveProvider = async () => {
    if (!formData.id && !formData.api_key.trim()) {
      setTestResult({ ok: false, message: 'Please enter an API key for this new provider.' });
      return;
    }

    setIsSaving(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/vault/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formData.id || undefined,
          provider: formData.provider || 'custom',
          label: formData.label || 'Custom Provider',
          base_url: formData.base_url,
          api_format: formData.api_format,
          api_key: formData.api_key.trim(),
          models: formData.models,
          is_enabled: formData.is_enabled,
          is_default: formData.is_default,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, message: 'Provider saved successfully to encrypted vault.' });
        const targetId = data.provider_id || formData.id;
        setSelectedProviderId(targetId);
        await loadProviders();
        onProvidersUpdated();
      } else {
        setTestResult({ ok: false, message: data.error || 'Failed to save provider.' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || 'Error saving provider.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    try {
      const res = await fetch(`/api/vault/providers/${providerId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        await loadProviders();
        onProvidersUpdated();
      }
    } catch (e) {
      console.error('Delete provider error', e);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/vault/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: formData.id ? formData.id : undefined,
          endpoint: formData.base_url,
          api_key: formData.api_key || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          message: `Connection successful! ${data.model_count ?? data.models?.length ?? 0} models reachable.`,
        });
      } else {
        setTestResult({
          ok: false,
          message: `Connection failed: ${data.error || 'Endpoint unreachable'}`,
        });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: `Error testing connection: ${e.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const toggleModelStatus = (index: number) => {
    setFormData((prev) => {
      const updated = [...prev.models];
      updated[index] = { ...updated[index], is_enabled: !updated[index].is_enabled };
      return { ...prev, models: updated };
    });
  };

  const deleteModel = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index),
    }));
  };

  const addModel = () => {
    if (!newModelName.trim()) return;
    const tags = newModelTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const item: ModelItem = {
      id: newModelName.trim(),
      name: newModelName.trim(),
      tags: tags.length > 0 ? tags : ['Chat'],
      is_enabled: true,
    };
    setFormData((prev) => ({
      ...prev,
      models: [...prev.models, item],
    }));
    setNewModelName('');
    setNewModelTags('');
    setIsAddingModel(false);
  };

  if (!isOpen) return null;

  // Render Provider Icon helper
  const renderProviderIcon = (type: string, name: string) => {
    const lower = (type + ' ' + name).toLowerCase();
    if (lower.includes('zhipu') || lower.includes('bigmodel')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
          <Sparkles className="w-4 h-4 text-cyan-200" />
        </div>
      );
    }
    if (lower.includes('z.ai') || lower.includes('zai') || lower.includes('start plan')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-black border border-[#3c4043] flex items-center justify-center text-white font-bold text-sm tracking-tighter">
          Z
        </div>
      );
    }
    if (lower.includes('kimi')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white font-extrabold text-sm">
          K
        </div>
      );
    }
    if (lower.includes('minimax')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-red-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">
          MM
        </div>
      );
    }
    if (lower.includes('deepseek')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
          DS
        </div>
      );
    }
    if (lower.includes('alibaba') || lower.includes('qwen')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-xs">
          ALI
        </div>
      );
    }
    if (lower.includes('xiaomi') || lower.includes('mimo')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-600 flex items-center justify-center text-white text-[10px] font-bold">
          MiMo
        </div>
      );
    }
    if (lower.includes('tencent') || lower.includes('tokenhub')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-xs">
          TH
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-[#242628] border border-[#3c4043] flex items-center justify-center text-[#8e918f]">
        <Box className="w-4 h-4 text-white" />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[720px] max-h-[90vh] bg-[#1a1b1d] border border-[#2c2d30] rounded-2xl shadow-2xl flex flex-col text-[#e3e3e3] overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#282a2c] bg-[#1a1b1d]">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Model settings</h2>
            <p className="text-xs text-[#8e918f] mt-0.5">
              Manage custom model providers. Once configured, they can be selected during chat.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={loadProviders}
              title="Refresh providers"
              className="p-2 rounded-lg bg-[#242628] hover:bg-[#2e3134] text-[#8e918f] hover:text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsAddingProvider(true)}
              className="px-3 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors flex items-center space-x-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add provider</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-[#8e918f] hover:text-white rounded-lg hover:bg-[#242628] transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Providers Sidebar */}
          <div className="w-64 bg-[#141517] border-r border-[#282a2c] flex flex-col py-3 overflow-y-auto select-none">
            {/* Built-in Providers Section */}
            <div className="px-4 py-1">
              <span className="text-[11px] font-semibold text-[#8e918f] uppercase tracking-wider">
                Providers
              </span>
            </div>
            <div className="px-2 space-y-0.5 mt-1">
              {providers
                .filter((p) => !p.provider.includes('local') && !p.provider.includes('custom'))
                .map((p) => {
                  const isSelected = selectedProviderId === p.id && !isAddingProvider;
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectProvider(p)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-[#242628] text-white border border-[#3c4043]'
                          : 'text-[#8e918f] hover:text-white hover:bg-[#1a1b1d]'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        {renderProviderIcon(p.provider, p.label)}
                        <span className="truncate">{p.label}</span>
                      </div>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          p.is_enabled ? 'bg-amber-500' : 'bg-zinc-600'
                        }`}
                      />
                    </button>
                  );
                })}
              {providers.filter((p) => !p.provider.includes('local') && !p.provider.includes('custom')).length === 0 && (
                <div className="px-3 py-2 text-[11px] text-zinc-500 italic">No cloud presets active</div>
              )}
            </div>

            {/* Custom Providers Section */}
            <div className="px-4 pt-5 pb-1">
              <span className="text-[11px] font-semibold text-[#8e918f] uppercase tracking-wider">
                Custom providers
              </span>
            </div>
            <div className="px-2 space-y-0.5 mt-1">
              {providers
                .filter((p) => p.provider.includes('local') || p.provider.includes('custom'))
                .map((p) => {
                  const isSelected = selectedProviderId === p.id && !isAddingProvider;
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectProvider(p)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-[#242628] text-white border border-[#3c4043]'
                          : 'text-[#8e918f] hover:text-white hover:bg-[#1a1b1d]'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <Box className="w-4 h-4 text-emerald-400" />
                        <span className="truncate">{p.label}</span>
                      </div>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          p.is_enabled ? 'bg-emerald-500' : 'bg-zinc-600'
                        }`}
                      />
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Right Main Detail / Catalog Panel */}
          <div className="flex-1 bg-[#1a1b1d] p-6 overflow-y-auto">
            {isAddingProvider ? (
              /* ================== Add Provider Catalog View ================== */
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsAddingProvider(false)}
                    className="p-1 rounded-lg text-[#8e918f] hover:text-white hover:bg-[#242628] transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h3 className="text-base font-semibold text-white">Add provider</h3>
                </div>

                {/* Zhipu Category */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-[#8e918f] uppercase tracking-wider">
                      Zhipu
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-[#242628] text-[#8e918f] rounded-full border border-[#3c4043]">
                      Z.ai Coding Plan
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {PRESET_PROVIDERS.filter((p) => p.category === 'Zhipu').map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset)}
                        className="flex items-center justify-between p-3.5 rounded-xl bg-[#141517] hover:bg-[#242628] border border-[#2b2c2f] hover:border-[#3c4043] transition-all text-left group"
                      >
                        <div className="flex items-center space-x-3">
                          {renderProviderIcon(preset.iconType, preset.name)}
                          <div>
                            <div className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                              {preset.name}
                            </div>
                            <div className="text-[10px] text-[#8e918f] truncate max-w-[150px]">
                              {preset.models[0]}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Other Category */}
                <div>
                  <div className="mb-3">
                    <span className="text-xs font-semibold text-[#8e918f] uppercase tracking-wider">
                      Other
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {PRESET_PROVIDERS.filter((p) => p.category === 'Other').map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset)}
                        className="flex items-center justify-between p-3.5 rounded-xl bg-[#141517] hover:bg-[#242628] border border-[#2b2c2f] hover:border-[#3c4043] transition-all text-left group"
                      >
                        <div className="flex items-center space-x-3">
                          {renderProviderIcon(preset.iconType, preset.name)}
                          <div>
                            <div className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                              {preset.name}
                            </div>
                            <div className="text-[10px] text-[#8e918f] truncate max-w-[150px]">
                              {preset.defaultBaseUrl.replace('https://', '')}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ================== Provider Details / Edit View ================== */
              <div className="max-w-2xl mx-auto space-y-5">
                {/* Provider Header with Switch & Options */}
                <div className="flex items-center justify-between pb-3 border-b border-[#282a2c]">
                  <div className="flex items-center space-x-3">
                    {renderProviderIcon(formData.provider, formData.label)}
                    <div>
                      <input
                        type="text"
                        value={formData.label}
                        onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                        className="bg-transparent text-base font-bold text-white border-b border-transparent hover:border-[#3c4043] focus:border-[#a8c7fa] focus:outline-none transition-colors"
                        placeholder="Provider name"
                      />
                      <div className="text-[11px] text-[#8e918f] font-mono">
                        {formData.id ? `ID: ${formData.id.slice(0, 16)}...` : 'New Provider'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 relative">
                    {/* Enable Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, is_enabled: !prev.is_enabled }))}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        formData.is_enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          formData.is_enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    {/* Options Menu Button */}
                    <button
                      onClick={() => setShowDropdownMenu((prev) => !prev)}
                      className="p-1 rounded-md text-[#8e918f] hover:text-white hover:bg-[#242628] transition-colors"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>

                    {showDropdownMenu && (
                      <div className="absolute right-0 top-8 w-44 bg-[#242628] border border-[#3c4043] rounded-xl shadow-2xl py-1 z-30 animate-in fade-in zoom-in-95">
                        <button
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, is_default: true }));
                            setShowDropdownMenu(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-[#e3e3e3] hover:bg-[#2f3134]"
                        >
                          Set as Default
                        </button>
                        {formData.id && (
                          <button
                            onClick={() => {
                              handleDeleteProvider(formData.id);
                              setShowDropdownMenu(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-[#2f3134]"
                          >
                            Delete Provider
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Base URL */}
                <div>
                  <label className="block text-xs font-medium text-[#8e918f] mb-1.5">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={formData.base_url}
                    onChange={(e) => setFormData((prev) => ({ ...prev, base_url: e.target.value }))}
                    placeholder="http://localhost:20128/v1"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141517] border border-[#2b2c2f] focus:border-[#a8c7fa] focus:outline-none text-xs text-white font-mono transition-colors"
                  />
                </div>

                {/* API Format */}
                <div>
                  <label className="block text-xs font-medium text-[#8e918f] mb-1.5">
                    API format
                  </label>
                  <select
                    value={formData.api_format}
                    onChange={(e) => setFormData((prev) => ({ ...prev, api_format: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141517] border border-[#2b2c2f] focus:border-[#a8c7fa] focus:outline-none text-xs text-white transition-colors"
                  >
                    <option value="chat_completions">Chat completions (/chat/completions)</option>
                    <option value="openai_responses">OpenAI Responses API</option>
                  </select>
                </div>

                {/* API Key */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-[#8e918f]">
                      API key
                    </label>
                    {formData.key_hint && (
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/80">
                        Active Key: {formData.key_hint}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={formData.api_key}
                      onChange={(e) => setFormData((prev) => ({ ...prev, api_key: e.target.value }))}
                      placeholder={
                        formData.key_hint
                          ? `Saved as ${formData.key_hint} (leave blank to keep)`
                          : 'Enter API key (e.g. sk-...)'
                      }
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#141517] border border-[#2b2c2f] focus:border-[#a8c7fa] focus:outline-none text-xs text-white font-mono tracking-wider transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-[#8e918f] hover:text-white transition-colors"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    {formData.key_hint
                      ? 'To keep your existing encrypted key, leave this field empty.'
                      : 'Enter your provider API key. It will be encrypted with AES-256-GCM.'}
                  </div>
                </div>

                {/* Model List Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#8e918f] uppercase tracking-wider">
                      Model list
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingModel(true)}
                      className="px-2.5 py-1 rounded-md bg-[#242628] hover:bg-[#2e3134] text-xs font-medium text-white border border-[#3c4043] flex items-center space-x-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add model</span>
                    </button>
                  </div>

                  {/* Inline Add Model Form */}
                  {isAddingModel && (
                    <div className="p-3 mb-3 bg-[#141517] border border-[#3c4043] rounded-xl flex items-center space-x-2 animate-in fade-in">
                      <input
                        type="text"
                        value={newModelName}
                        onChange={(e) => setNewModelName(e.target.value)}
                        placeholder="Model ID (e.g. gpt-4o)"
                        className="flex-1 px-3 py-1.5 bg-[#242628] border border-[#3c4043] rounded-lg text-xs text-white focus:outline-none focus:border-[#a8c7fa]"
                      />
                      <input
                        type="text"
                        value={newModelTags}
                        onChange={(e) => setNewModelTags(e.target.value)}
                        placeholder="Tags (e.g. 1M, Vision)"
                        className="w-32 px-3 py-1.5 bg-[#242628] border border-[#3c4043] rounded-lg text-xs text-white focus:outline-none focus:border-[#a8c7fa]"
                      />
                      <button
                        type="button"
                        onClick={addModel}
                        className="px-3 py-1.5 bg-white text-black font-semibold text-xs rounded-lg hover:bg-neutral-200"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingModel(false)}
                        className="p-1.5 text-[#8e918f] hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Model Items Table */}
                  <div className="rounded-xl border border-[#2b2c2f] bg-[#141517] divide-y divide-[#242628] overflow-hidden">
                    {formData.models.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[#8e918f]">
                        No models configured. Click "+ Add model" or test connection to discover.
                      </div>
                    ) : (
                      formData.models.map((model, idx) => (
                        <div
                          key={model.id || idx}
                          className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#1c1d1f] transition-colors"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span className="text-xs font-mono text-white truncate max-w-[260px]">
                              {model.name || model.id}
                            </span>
                            {model.tags &&
                              model.tags.map((tag, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#242628] text-[#8e918f] border border-[#3c4043] font-mono"
                                >
                                  {tag}
                                </span>
                              ))}
                          </div>

                          <div className="flex items-center space-x-2">
                            {/* Delete Model Button */}
                            <button
                              type="button"
                              onClick={() => deleteModel(idx)}
                              title="Delete model"
                              className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Toggle Switch */}
                            <button
                              type="button"
                              onClick={() => toggleModelStatus(idx)}
                              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                model.is_enabled ? 'bg-white' : 'bg-zinc-700'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full ${
                                  model.is_enabled ? 'bg-black translate-x-3' : 'bg-white translate-x-0'
                                } shadow-md ring-0 transition duration-200 ease-in-out`}
                              />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Status Feedback Banner */}
                {testResult && (
                  <div
                    className={`p-3 rounded-xl flex items-center space-x-2 text-xs border ${
                      testResult.ok
                        ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                        : 'bg-red-950/40 text-red-300 border-red-800/60'
                    }`}
                  >
                    {testResult.ok ? (
                      <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}

                {/* Bottom Action Buttons */}
                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="px-3.5 py-2 rounded-xl bg-[#242628] hover:bg-[#2e3134] text-xs font-semibold text-white border border-[#3c4043] transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testing connection...' : 'Test Connection'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveProvider}
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Provider'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
