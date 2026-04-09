import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Search, Lock, Unlock, Star, ArrowRight, Globe, GitBranch, AlertCircle } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { API_ENDPOINTS } from "@/config/api";
import { AuthService } from "@/services/auth.service";
import { ScanService } from "@/services/scan.service";

type ScanMode = "repo" | "website";

interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  language: string;
  stars: number;
  forks: number;
  updatedAt: string;
  url: string;
  defaultBranch: string;
}

const RepoSelectPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ScanMode>("repo");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "repo") {
      fetchRepositories();
    }
  }, [mode]);

  const fetchRepositories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = AuthService.getToken();
      if (!token) {
        setError("Not authenticated. Please log in again.");
        return;
      }

      const response = await fetch(API_ENDPOINTS.auth.repositories, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("Session expired. Please log in again.");
          setTimeout(() => navigate("/login"), 2000);
          return;
        }
        throw new Error("Failed to fetch repositories");
      }

      const data = await response.json();
      setRepositories(data.repositories || []);
    } catch (err) {
      console.error("Error fetching repositories:", err);
      setError("Failed to load repositories. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = repositories.filter((r) =>
    r.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const canScan = mode === "repo" ? !!selected : websiteUrl.trim().length > 0;

  const handleScan = async () => {
    if (mode === "website") {
      navigate("/scan?mode=website&url=" + encodeURIComponent(websiteUrl.trim()));
    } else {
      if (!selected) return;
      
      const selectedRepo = repositories.find(r => r.id === selected);
      if (!selectedRepo) return;

      try {
        const { scanId } = await ScanService.startScan({
          repoId: selectedRepo.id,
          repoName: selectedRepo.name,
          repoFullName: selectedRepo.fullName,
          repoUrl: selectedRepo.url,
          defaultBranch: selectedRepo.defaultBranch,
        });

        navigate(`/scan?scanId=${scanId}`);
      } catch (error: any) {
        console.error("Error starting scan:", error);
        setError(error.message || "Failed to start scan");
      }
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <Navigation />

      <div className="max-w-3xl mx-auto px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="text-3xl font-medium text-foreground mb-2">Security Scan</h1>
          <p className="text-muted-foreground mb-8 font-light">Scan a repository or website for vulnerabilities</p>

          {/* Mode Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode("repo")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all ${
                mode === "repo"
                  ? "bg-primary text-black"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <GitBranch className="w-4 h-4" /> Repository
            </button>
            <button
              onClick={() => setMode("website")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all ${
                mode === "website"
                  ? "bg-primary text-black"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe className="w-4 h-4" /> Website URL
            </button>
          </div>

          {mode === "repo" ? (
            <>
              {/* Search */}
              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search repositories..."
                  className="w-full pl-11 pr-4 py-2.5 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm"
                />
              </div>

              {/* Loading State */}
              {loading && (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-muted-foreground text-sm">Loading repositories...</p>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 mb-6">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    <p className="text-sm">{error}</p>
                  </div>
                  <button
                    onClick={fetchRepositories}
                    className="mt-3 text-sm text-primary hover:underline"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Empty State */}
              {!loading && !error && repositories.length === 0 && (
                <div className="text-center py-12">
                  <GitBranch className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm">No repositories found</p>
                  <p className="text-muted-foreground text-xs mt-2">
                    Make sure you've granted repository access during login
                  </p>
                </div>
              )}

              {/* Repo List */}
              {!loading && !error && filtered.length > 0 && (
                <div className="space-y-2">
                  {filtered.map((repo, i) => (
                    <motion.div
                      key={repo.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`rounded-md border transition-all ${
                        selected === repo.id
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card"
                      }`}
                    >
                      <button
                        onClick={() => setSelected(repo.id)}
                        className="w-full text-left px-4 py-3.5 flex items-center justify-between hover:opacity-80 transition-opacity"
                      >
                        <div className="flex items-center gap-3">
                          {repo.isPrivate ? (
                            <Lock className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Unlock className="w-4 h-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="font-medium text-foreground text-sm">{repo.fullName}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 font-light">
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                                {repo.language}
                              </span>
                              <span className="flex items-center gap-1">
                                <Star className="w-3 h-3" /> {repo.stars}
                              </span>
                              <span>Updated {repo.updatedAt}</span>
                            </div>
                          </div>
                        </div>
                        {selected === repo.id && (
                          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-black" />
                          </div>
                        )}
                      </button>
                      
                      {/* Inline Scan Button */}
                      {selected === repo.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="px-4 pb-3"
                        >
                          <button
                            onClick={handleScan}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-black text-sm hover:opacity-90 transition-opacity"
                          >
                            Start Security Scan
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              {/* No Search Results */}
              {!loading && !error && repositories.length > 0 && filtered.length === 0 && (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm">No repositories match your search</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Website URL Input */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://example.com"
                    type="url"
                    className="w-full pl-11 pr-4 py-2.5 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm"
                  />
                </div>
                <div className="bg-card border border-border rounded-md p-4 space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Website scan includes:</h3>
                  <ul className="text-xs text-muted-foreground space-y-1.5 font-light">
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> TLS/SSL configuration analysis</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> HTTP security headers check</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> Exposed sensitive files detection</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> Open redirect & injection scanning</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> Cookie security flag analysis</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> AI-powered remediation suggestions</li>
                  </ul>
                </div>
              </motion.div>

              {/* Scan Button for Website Mode */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: canScan ? 1 : 0.4 }}
                className="mt-8"
              >
                <button
                  disabled={!canScan}
                  onClick={handleScan}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-primary text-black text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  Scan Website
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default RepoSelectPage;
