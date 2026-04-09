import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { GitBranch, Play, Shield, AlertCircle, CheckCircle, Loader2, ExternalLink } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { API_ENDPOINTS } from "@/config/api";
import { AuthService } from "@/services/auth.service";

interface SandboxStatus {
  status: 'idle' | 'cloning' | 'installing' | 'running' | 'scanning' | 'completed' | 'failed';
  message: string;
  url?: string;
  scanId?: string;
  vulnerabilities?: number;
  error?: string;
}

const SandboxScanPage = () => {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>({ status: 'idle', message: '' });
  const [logs, setLogs] = useState<Array<{ time: string; message: string; level: string }>>([]);

  const addLog = (message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, level }]);
  };

  const handleCloneAndScan = async () => {
    if (!repoUrl.trim()) return;

    try {
      setLogs([]);
      setSandboxStatus({ status: 'cloning', message: 'Cloning repository...' });
      addLog('Starting sandbox environment...', 'info');
      addLog(`Cloning: ${repoUrl}`, 'info');

      const token = AuthService.getToken();
      const response = await fetch(API_ENDPOINTS.scan.sandboxScan, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          branch: branch.trim() || 'main',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start sandbox scan');
      }

      const { sandboxId } = await response.json();
      addLog('Repository cloned successfully', 'success');

      // Poll for status updates
      pollSandboxStatus(sandboxId);
    } catch (error: any) {
      console.error('Error starting sandbox scan:', error);
      setSandboxStatus({ status: 'failed', message: error.message, error: error.message });
      addLog(`Error: ${error.message}`, 'error');
    }
  };

  const pollSandboxStatus = async (sandboxId: string) => {
    const token = AuthService.getToken();
    
    const poll = async () => {
      try {
        const response = await fetch(`${API_ENDPOINTS.scan.sandboxStatus}/${sandboxId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error('Failed to get status');

        const data = await response.json();
        setSandboxStatus(data);

        // Replace logs entirely (don't accumulate)
        if (data.logs) {
          setLogs(data.logs);
        }

        // Continue polling if not done
        if (!['completed', 'failed'].includes(data.status)) {
          setTimeout(poll, 2000);
        } else if (data.status === 'completed' && data.scanId) {
          addLog(`Scan completed! Found ${data.vulnerabilities || 0} vulnerabilities`, 'success');
          setTimeout(() => navigate(`/website-scan/${data.scanId}`), 2000);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    poll();
  };

  const getStatusIcon = () => {
    switch (sandboxStatus.status) {
      case 'cloning':
      case 'installing':
      case 'running':
      case 'scanning':
        return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Shield className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const isProcessing = ['cloning', 'installing', 'running', 'scanning'].includes(sandboxStatus.status);

  return (
    <div className="min-h-screen bg-black">
      <Navigation />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-medium text-foreground mb-2">Sandbox Clone & Attack</h1>
          <p className="text-muted-foreground mb-8 font-light">
            Clone any GitHub repo, run it in a sandbox, and scan for vulnerabilities
          </p>

          {/* Input Section */}
          <div className="bg-card border border-border rounded-lg p-6 mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Repository URL</label>
                <div className="relative">
                  <GitBranch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repo"
                    disabled={isProcessing}
                    className="w-full pl-11 pr-4 py-2.5 rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-2">Branch (optional)</label>
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  disabled={isProcessing}
                  className="w-full px-4 py-2.5 rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm disabled:opacity-50"
                />
              </div>

              <button
                onClick={handleCloneAndScan}
                disabled={!repoUrl.trim() || isProcessing}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-primary text-black text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                <Play className="w-4 h-4" />
                {isProcessing ? 'Processing...' : 'Clone & Attack'}
              </button>
            </div>
          </div>

          {/* Status Section */}
          {sandboxStatus.status !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-lg p-6 mb-6"
            >
              <div className="flex items-center gap-3 mb-4">
                {getStatusIcon()}
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {sandboxStatus.status.charAt(0).toUpperCase() + sandboxStatus.status.slice(1)}
                  </h3>
                  <p className="text-xs text-muted-foreground">{sandboxStatus.message}</p>
                </div>
              </div>

              {sandboxStatus.url && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <ExternalLink className="w-3 h-3" />
                  <span>Running at:</span>
                  <a
                    href={sandboxStatus.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-mono"
                  >
                    {sandboxStatus.url}
                  </a>
                </div>
              )}

              {/* Progress Steps */}
              <div className="space-y-2">
                {['cloning', 'installing', 'running', 'scanning', 'completed'].map((step, idx) => {
                  const currentIdx = ['cloning', 'installing', 'running', 'scanning', 'completed'].indexOf(sandboxStatus.status);
                  const isComplete = idx < currentIdx || sandboxStatus.status === 'completed';
                  const isCurrent = idx === currentIdx;

                  return (
                    <div key={step} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        isComplete ? 'bg-green-500/20 text-green-500' :
                        isCurrent ? 'bg-primary/20 text-primary' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {isComplete ? '✓' : idx + 1}
                      </div>
                      <span className={`text-sm ${
                        isComplete || isCurrent ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {step.charAt(0).toUpperCase() + step.slice(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Logs Section */}
          {logs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-lg p-6"
            >
              <h3 className="text-sm font-medium text-foreground mb-4">Activity Log</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto font-mono text-xs">
                {logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className="text-muted-foreground shrink-0">{log.time}</span>
                    <span className={`${
                      log.level === 'error' ? 'text-destructive' :
                      log.level === 'success' ? 'text-green-500' :
                      log.level === 'warning' ? 'text-yellow-500' :
                      'text-muted-foreground'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Info Box */}
          <div className="mt-6 bg-primary/5 border border-primary/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">How it works</h3>
            <ul className="text-xs text-muted-foreground space-y-1.5 font-light">
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-primary" />
                Clones the repository in an isolated sandbox environment
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-primary" />
                Automatically installs dependencies and runs the application
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-primary" />
                Performs comprehensive vulnerability scanning on the running site
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-primary" />
                Sandbox is destroyed after scan completes
              </li>
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default SandboxScanPage;
