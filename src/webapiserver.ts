import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as ext from './extension';
import * as os from 'os';
import * as http from 'http';

export class TestRunnerWebApiServer {
    private serverProcess: cp.ChildProcess | null = null;
    private _port: number = 0; 
    public get port(): number { return this._port; }
    private isDevelopment: boolean = false;
    private serverStartTimeout: NodeJS.Timeout | null = null;
    private _serverHealthCheckOkay: boolean = false;

    public get IsRunning(): boolean {        
        return this.serverProcess !== null && !this.serverProcess.killed && this._serverHealthCheckOkay;
    }

    public async startServer(context: vscode.ExtensionContext): Promise<boolean> {
        const serverName = 'Test Runner WebAPI Server';

        if (this.serverProcess) {
            vscode.window.showWarningMessage(`${serverName} is already running.`);
            return true;
        }

        const isWindows = os.platform() === 'win32';
        const serverPath = path.join(context.extensionPath, '.bin', 'al-test-runner-webapi', 'al-test-runner-webapi.dll');

        try {
            await fs.promises.access(serverPath, fs.constants.F_OK);
        } catch (error) {
            vscode.window.showErrorMessage(`${serverName} executable not found at ${serverPath}. Please check the installation.`);
            return false;
        }

        if (!isWindows) {
            try {
                await fs.promises.chmod(serverPath, '755');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to set execute permissions: ${error}`);
                return false;
            }
        }

        try {
            this._port = await this.GetLowestFreePort(49152, 65535);
            ext.writeToOutputChannel(`Starting server on port ${this._port}`);

            let stdoutData = '';
            let stderrData = '';

            // Start the server process
            this.serverProcess = cp.spawn('dotnet', [serverPath, this._port.toString()], {
                env: {
                    ...process.env,
                    MY_VAR: 'value',
                    ASPNETCORE_ENVIRONMENT: this.isDevelopment ? 'Development' : 'Production'
                }
            });

            this.serverProcess.stdout?.on('data', (data) => {
                const output = data.toString();
                stdoutData += output;
                ext.writeToOutputChannel(`${serverName} output: ${output}`);
            });

            this.serverProcess.stderr?.on('data', (data) => {
                const error = data.toString();
                stderrData += error;
                ext.writeToOutputChannel(`${serverName} error: ${error}`);
            });

            this.serverProcess.on('error', (error) => {
                ext.writeToOutputChannel(`Failed to start ${serverName}: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to start ${serverName}: ${error.message}`);
                this.cleanupServer();
                return false;
            });

            this.serverProcess.on('close', (code) => {
                if (code !== 0) {
                    ext.writeToOutputChannel(`${serverName} process exited with code ${code}`);
                    ext.writeToOutputChannel(`Last stderr output: ${stderrData}`);
                    vscode.window.showErrorMessage(`${serverName} stopped unexpectedly with code ${code}`);
                } else {
                    ext.writeToOutputChannel(`${serverName} stopped normally`);
                }
                this.cleanupServer();
            });

            // Healthcheck
            return await this.waitForServerToStart(serverName, 15 * 1000); // X second timeout (I hope 15 seconds is enough)
        } catch (error) {
            ext.writeToOutputChannel(`Unexpected error starting ${serverName}: ${error instanceof Error ? error.message : String(error)}`);
            vscode.window.showErrorMessage(`Unexpected error starting ${serverName}: ${error instanceof Error ? error.message : String(error)}`);
            this.cleanupServer();
            return false;
        }
    }

    private async waitForServerToStart(serverName: string, timeout: number): Promise<boolean> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const healthCheckInterval = 500; // Check every 500ms
            
            const checkServerHealth = async () => {
                try {
                    // Try to connect to the server
                    this._serverHealthCheckOkay = await this.isServerResponding();
                    
                    if (this._serverHealthCheckOkay) {
                        ext.writeToOutputChannel(`${serverName} is now responding on port ${this._port}`);
                        ext.writeToOutputChannel(`${serverName} started successfully`);
                        clearTimeout(this.serverStartTimeout!);
                        resolve(true);
                        return;
                    }
                } catch (error) {
                    // Connection failed, server might still be starting:
                    ext.writeToOutputChannel(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
                }
                
                // Check if we've exceeded the timeout:
                if (Date.now() - startTime > timeout) {
                    ext.writeToOutputChannel(`Timed out waiting for ${serverName} to start`);
                    vscode.window.showErrorMessage(`Timed out waiting for ${serverName} to start. Check the logs for details.`);
                    this.cleanupServer();
                    resolve(false);
                    return;
                }
                
                // Schedule another check:
                this.serverStartTimeout = setTimeout(checkServerHealth, healthCheckInterval);
            };
            
            // Start the health check process:
            checkServerHealth();
        });
    }

    private async isServerResponding(): Promise<boolean> {
        return new Promise((resolve) => {
            const req = http.get(`http://localhost:${this._port}/health`, {
                timeout: 1000
            }, (res) => {
                // Any response from the server (even 404) means the server is up and running:
                ext.writeToOutputChannel(`Health check received status code: ${res.statusCode}`);
                resolve(true);
                res.resume();
            });
            
            req.on('error', (err) => {
                // Connection error, server not ready:
                ext.writeToOutputChannel(`Health check error: ${err.message}`);
                resolve(false);
            });
            
            req.on('timeout', () => {
                ext.writeToOutputChannel('Health check timed out');
                req.destroy();
                resolve(false);
            });
        });
    }

    public async stopServer(): Promise<void> {
        if (!this.serverProcess) {
            return;
        }
        
        // Clear any pending timeouts
        if (this.serverStartTimeout) {
            clearTimeout(this.serverStartTimeout);
            this.serverStartTimeout = null;
        }
        
        return new Promise((resolve) => {
            // Set a timeout to force kill if graceful shutdown takes too long
            const forceKillTimeout = setTimeout(() => {
                if (this.serverProcess) {
                    ext.writeToOutputChannel('Force killing server process that did not terminate');
                    try {
                        this.serverProcess.kill('SIGKILL');
                    } catch (e) {
                        // Ignore errors during force kill
                    }
                    this.cleanupServer();
                    resolve();
                }
            }, 5000);
            
            if (this.serverProcess) {
                this.serverProcess.once('exit', () => {
                    clearTimeout(forceKillTimeout);
                    this.cleanupServer();
                    ext.writeToOutputChannel('Server process terminated gracefully');
                    resolve();
                });
                
                // Try graceful termination first
                try {
                    this.serverProcess.kill('SIGTERM');
                } catch (e) {
                    // If SIGTERM fails, try normal kill
                    try {
                        this.serverProcess.kill();
                    } catch (e2) {
                        // If that fails too, we'll rely on the force kill timeout
                        ext.writeToOutputChannel(`Error stopping server: ${e2 instanceof Error ? e2.message : String(e2)}`);
                    }
                }
            } else {
                clearTimeout(forceKillTimeout);
                resolve();
            }
        });
    }

    private cleanupServer(): void {
        this.serverProcess = null;
        this._port = 0;
    }

    private async findFreePort(startPort: number, endPort: number): Promise<number> {
        return new Promise((resolve, reject) => {
            let port = startPort;
            
            function tryPort(currentPort: number) {
                const server = net.createServer();
                server.listen(currentPort, () => {
                    server.once('close', () => {
                        resolve(currentPort);
                    });
                    server.close();
                });
                server.on('error', () => {
                    if (currentPort < endPort) {
                        tryPort(currentPort + 1);
                    } else {
                        reject(new Error('No free port found'));
                    }
                });
            }
            
            tryPort(port);
        });
    }

    private async GetLowestFreePort(startPort: number = 49152, endPort: number = 65535): Promise<number> {
        try {
            const port = await this.findFreePort(startPort, endPort);
            ext.writeToOutputChannel(`Found free port: ${port}`);
            return port;
        } catch (error) {
            ext.writeToOutputChannel(`Error finding free port: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}