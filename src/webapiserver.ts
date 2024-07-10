import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as ext from './extension';

export class TestRunnerWebApiServer {

    private serverProcess: cp.ChildProcess = null;
    private _port: number = 0; public get port(): number { return this._port; }
    private isDevelopment: boolean = true;   // TODO: Change!!!

    public get IsRunning(): boolean { 
        // TODO: We will probably need a more sophisticated method!!!
        return (this.serverProcess != null); 
    }

    public async startServer(context: vscode.ExtensionContext) {
        const serverName = 'Test Runner WebAPI Server';
    
        if (this.serverProcess) {
            vscode.window.showWarningMessage(`${serverName} is already running.`);
            return;
        }
    
        const serverPath = path.join(context.extensionPath, '.bin', 'al-test-runner-webapi', 'al-test-runner-webapi.exe');
    
        try {
            // Check if the server executable exists
            await fs.promises.access(serverPath, fs.constants.F_OK);
        } catch (error) {
            vscode.window.showErrorMessage(`${serverName} executable not found at ${serverPath}. Please check the installation.`);
            return;
        }
    
        try {
            this._port = 0;
            const port = await this.GetRandomPort();

            this.serverProcess = cp.spawn(serverPath, [port.toString()], {
                env: { ...process.env, 
                    MY_VAR: 'value',
                    ASPNETCORE_ENVIRONMENT: this.isDevelopment ? 'Development' : 'Production'
                }
            });
    
            this.serverProcess.stdout?.on('data', (data) => {
                console.log(`${serverName} output: ${data}`);
                // We might want to parse this output to detect if the server started successfully ...
            });
    
            this.serverProcess.stderr?.on('data', (data) => {
                console.error(`${serverName} error: ${data}`);
                vscode.window.showErrorMessage(`Server error: ${data}`);
            });
    
            this.serverProcess.on('error', (error) => {
                console.error(`Failed to start ${serverName}: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to start ${serverName}: ${error.message}`);
                this.serverProcess = null;
            });
    
            this.serverProcess.on('close', (code) => {
                if (code !== 0) {
                    console.log(`${serverName} process exited with code ${code}`);
                    vscode.window.showErrorMessage(`${serverName} stopped unexpectedly with code ${code}`);
                } else {
                    console.log(`${serverName} stopped`);
                    vscode.window.showInformationMessage(`${serverName} stopped`);
                }
                this.serverProcess = null;
            });
    
            // Wait a bit to see if the process immediately fails
            await new Promise(resolve => setTimeout(resolve, 2000));
    
            if (this.serverProcess && !this.serverProcess.killed) {
                console.log(`${serverName} started successfully!`);
                this._port = port;
            } else {
                vscode.window.showErrorMessage(`${serverName} hasn't started for some reason`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Unexpected error starting ${serverName}: ${error}`);
        }
    }

    public async stopServer()
    {
        this.serverProcess.kill();
        this.serverProcess = null;
    }

    private async FindFreePort(startPort: number = 49152): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.unref();
            server.on('error', reject);
    
            server.listen(startPort, () => {
                const { port } = server.address() as net.AddressInfo;
                server.close(() => {
                    resolve(port);
                });
            });
        });
    }
    
    private async GetRandomPort(): Promise<number> {
        try {
            const port = await this.FindFreePort();
            ext.writeToOutputChannel(`Found free port: ${port}`);
            return port;
        } catch (error) {
            ext.writeToOutputChannel(`Error finding free port: ${error}`);
            throw error;
        }
    }
}