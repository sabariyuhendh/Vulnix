import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import axios from 'axios';
import { WebsiteScan } from '../db/models/WebsiteScan.model.js';

const execAsync = promisify(exec);

interface SandboxEnvironment {
  id: string;
  repoUrl: string;
  branch: string;
  workDir: string;
  port: number;
  process?: any;
  url?: string;
  status: 'cloning' | 'installing' | 'running' | 'scanning' | 'completed' | 'failed';
  logs: Array<{ time: Date; message: string; level: string }>;
  scanId?: string;
  error?: string;
}

export class SandboxScannerService {
  private static sandboxes = new Map<string, SandboxEnvironment>();
  private static readonly SANDBOX_BASE_DIR = path.join(process.cwd(), 'sandboxes');
  private static readonly PORT_RANGE_START = 4000;
  private static readonly PORT_RANGE_END = 5000;
  private static usedPorts = new Set<number>();

  /**
   * Initialize sandbox and start clone & scan process
   */
  static async createSandbox(
    userId: string,
    repoUrl: string,
    branch: string = 'main'
  ): Promise<string> {
    const sandboxId = crypto.randomUUID();
    const workDir = path.join(this.SANDBOX_BASE_DIR, sandboxId);
    const port = this.allocatePort();

    const sandbox: SandboxEnvironment = {
      id: sandboxId,
      repoUrl,
      branch,
      workDir,
      port,
      status: 'cloning',
      logs: [],
    };

    this.sandboxes.set(sandboxId, sandbox);

    // Start the process in background
    this.processSandbox(sandboxId, userId).catch(error => {
      console.error('Sandbox process error:', error);
      const sb = this.sandboxes.get(sandboxId);
      if (sb) {
        sb.status = 'failed';
        sb.error = error.message;
      }
    });

    return sandboxId;
  }

  /**
   * Get sandbox status
   */
  static getSandboxStatus(sandboxId: string): SandboxEnvironment | null {
    return this.sandboxes.get(sandboxId) || null;
  }

  /**
   * Process sandbox: clone -> install -> run -> scan
   */
  private static async processSandbox(sandboxId: string, userId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) throw new Error('Sandbox not found');

    try {
      // Ensure sandbox directory exists
      await fs.mkdir(this.SANDBOX_BASE_DIR, { recursive: true });

      // Step 1: Clone repository
      this.addSandboxLog(sandboxId, 'info', `Cloning ${sandbox.repoUrl}...`);
      
      try {
        // Try with specified branch
        await execAsync(`git clone --depth 1 --branch "${sandbox.branch}" "${sandbox.repoUrl}" "${sandbox.workDir}"`);
      } catch (branchError: any) {
        // If branch doesn't exist, try without branch specification
        if (branchError.message.includes('Remote branch') || branchError.message.includes('not found')) {
          this.addSandboxLog(sandboxId, 'warning', `Branch '${sandbox.branch}' not found, trying default branch...`);
          await execAsync(`git clone --depth 1 "${sandbox.repoUrl}" "${sandbox.workDir}"`);
        } else {
          throw branchError;
        }
      }
      
      this.addSandboxLog(sandboxId, 'success', 'Repository cloned successfully');

      // Step 2: Install dependencies
      sandbox.status = 'installing';
      this.addSandboxLog(sandboxId, 'info', 'Installing dependencies...');
      
      const packageJsonPath = path.join(sandbox.workDir, 'package.json');
      const hasPackageJson = await fs.access(packageJsonPath).then(() => true).catch(() => false);

      if (hasPackageJson) {
        try {
          await execAsync('npm install --legacy-peer-deps', { cwd: sandbox.workDir, timeout: 300000 }); // 5 min timeout
          this.addSandboxLog(sandboxId, 'success', 'Dependencies installed');
        } catch (installError: any) {
          // Try without legacy-peer-deps if it fails
          this.addSandboxLog(sandboxId, 'warning', 'Retrying install without legacy-peer-deps...');
          await execAsync('npm install', { cwd: sandbox.workDir, timeout: 300000 });
          this.addSandboxLog(sandboxId, 'success', 'Dependencies installed');
        }
      } else {
        this.addSandboxLog(sandboxId, 'warning', 'No package.json found, skipping install');
      }

      // Step 3: Run the application
      sandbox.status = 'running';
      this.addSandboxLog(sandboxId, 'info', `Starting application on port ${sandbox.port}...`);
      
      const startCommand = await this.detectStartCommand(sandbox.workDir);
      this.addSandboxLog(sandboxId, 'info', `Detected start command: ${startCommand}`);
      sandbox.url = `http://localhost:${sandbox.port}`;
      
      // Start the app in background
      const childProcess = exec(startCommand, {
        cwd: sandbox.workDir,
        env: { ...process.env, PORT: sandbox.port.toString() },
      });

      sandbox.process = childProcess;

      // Log process output
      childProcess.stdout?.on('data', (data) => {
        console.log(`[Sandbox ${sandboxId}] ${data}`);
      });

      childProcess.stderr?.on('data', (data) => {
        console.error(`[Sandbox ${sandboxId}] ${data}`);
      });

      childProcess.on('error', (error) => {
        console.error(`[Sandbox ${sandboxId}] Process error:`, error);
      });

      // Wait for app to be ready
      await this.waitForServer(sandbox.url, 60000); // 60 second timeout
      this.addSandboxLog(sandboxId, 'success', `Application running at ${sandbox.url}`);

      // Step 4: Scan the running application
      sandbox.status = 'scanning';
      this.addSandboxLog(sandboxId, 'info', 'Starting vulnerability scan...');

      const scanId = await this.scanRunningApp(userId, sandbox.url, sandbox.repoUrl);
      sandbox.scanId = scanId;
      
      this.addSandboxLog(sandboxId, 'success', 'Vulnerability scan completed');

      // Get scan results
      const scan = await WebsiteScan.findById(scanId);
      const vulnCount = scan?.vulnerabilities?.length || 0;

      sandbox.status = 'completed';
      this.addSandboxLog(sandboxId, 'success', `Scan complete! Found ${vulnCount} vulnerabilities`);

      // Cleanup after 5 minutes
      setTimeout(() => this.cleanupSandbox(sandboxId), 300000);

    } catch (error: any) {
      console.error('Sandbox processing error:', error);
      sandbox.status = 'failed';
      sandbox.error = error.message;
      this.addSandboxLog(sandboxId, 'error', `Failed: ${error.message}`);
      
      // Cleanup on failure
      setTimeout(() => this.cleanupSandbox(sandboxId), 60000);
    }
  }

  /**
   * Detect how to start the application
   */
  private static async detectStartCommand(workDir: string): Promise<string> {
    try {
      const packageJsonPath = path.join(workDir, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      if (packageJson.scripts) {
        // Check for common start scripts
        if (packageJson.scripts.start) return 'npm start';
        if (packageJson.scripts.dev) return 'npm run dev';
        if (packageJson.scripts.serve) return 'npm run serve';
        if (packageJson.scripts['start:dev']) return 'npm run start:dev';
        if (packageJson.scripts['dev:server']) return 'npm run dev:server';
      }
    } catch (error) {
      // Fallback to file detection
    }

    // Check for common server files
    try {
      const files = await fs.readdir(workDir);
      if (files.includes('server.js')) return 'node server.js';
      if (files.includes('index.js')) return 'node index.js';
      if (files.includes('app.js')) return 'node app.js';
      if (files.includes('main.js')) return 'node main.js';
      
      // Check in src directory
      if (files.includes('src')) {
        const srcFiles = await fs.readdir(path.join(workDir, 'src'));
        if (srcFiles.includes('server.js')) return 'node src/server.js';
        if (srcFiles.includes('index.js')) return 'node src/index.js';
        if (srcFiles.includes('app.js')) return 'node src/app.js';
        if (srcFiles.includes('main.js')) return 'node src/main.js';
      }
    } catch (error) {
      // Continue to error
    }

    throw new Error('Could not detect start command. No package.json scripts or server files found.');
  }

  /**
   * Wait for server to be ready
   */
  private static async waitForServer(url: string, timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        await axios.get(url, { timeout: 2000 });
        return; // Server is ready
      } catch (error) {
        // Server not ready yet, wait and retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error('Server failed to start within timeout period');
  }

  /**
   * Scan the running application
   */
  private static async scanRunningApp(userId: string, url: string, repoUrl: string): Promise<string> {
    // Import websiteScanner service
    const { WebsiteScannerService } = await import('./websiteScanner.service.js');

    // Run the scan to get results
    const scanResult = await WebsiteScannerService.scanWebsite(url);

    // Create scan record with results
    const scan = await WebsiteScan.create({
      userId: parseInt(userId),
      url: scanResult.url,
      scanDate: scanResult.scanDate,
      vulnerabilities: scanResult.vulnerabilities,
      securityScore: scanResult.securityScore,
      headers: scanResult.headers,
      technologies: scanResult.technologies,
      ssl: scanResult.ssl,
    });

    return scan._id.toString();
  }

  /**
   * Cleanup sandbox environment
   */
  private static async cleanupSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return;

    try {
      // Kill process if running
      if (sandbox.process) {
        sandbox.process.kill();
      }

      // Release port
      this.usedPorts.delete(sandbox.port);

      // Remove directory
      await fs.rm(sandbox.workDir, { recursive: true, force: true });

      // Remove from map
      this.sandboxes.delete(sandboxId);

      console.log(`Sandbox ${sandboxId} cleaned up`);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * Allocate an available port
   */
  private static allocatePort(): number {
    for (let port = this.PORT_RANGE_START; port <= this.PORT_RANGE_END; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error('No available ports in range');
  }

  /**
   * Add log to sandbox
   */
  private static addSandboxLog(
    sandboxId: string,
    level: 'info' | 'success' | 'warning' | 'error',
    message: string
  ): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox) {
      sandbox.logs.push({ time: new Date(), message, level });
    }
  }
}
