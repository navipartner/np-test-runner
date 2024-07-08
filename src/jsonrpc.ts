import * as vscode from 'vscode';
import * as rpc from 'vscode-jsonrpc/node';
import * as net from 'net';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { getExtension, writeToOutputChannel } from './extension';

export class TestRunnerRpcClient {
    protected socket: net.Socket;
    protected connection: rpc.MessageConnection;
    
    //private _OpenClientSession: any; public get OpenClientSession(): any { return this._OpenClientSession; }
    //private _CloseClientSession: any;

    public constructor() {

    }

    public async Connect(port: number) {
        // Connect to the server
        this.socket = net.connect(port, 'localhost');
        // Create the JSON-RPC connection
        this.connection = rpc.createMessageConnection(
            new rpc.StreamMessageReader(this.socket),
            new rpc.StreamMessageWriter(this.socket));
        // Start the connection
        this.connection.listen();

        this.BindSupportedMethods();
    }

    public async CloseConnection() {
        if (this.connection) {
            this.connection.end();
        }
    }

    private async BindSupportedMethods() {
        //this._OpenClientSession = this.connection.sendRequest.bind(this.connection, 'OpenClientSession');
    }

    public async OpenClientSession(serviceUrl: string, authenticationScheme: string, userName: string, userPassword: string,
            interactionTimeout: any, culture: string) {
        //const cmd = this.connection.sendRequest.bind(this.connection, 'OpenClientSession');
        //const result = await cmd([])
        const result = await this.connection.sendRequest('OpenClientSession', [serviceUrl, authenticationScheme, userName, userPassword, interactionTimeout, culture]);
    }
}

export class TestRunnerRpcServer {
    private readonly binPath = getExtension()!.extensionPath;
    private readonly serverPath = path.join(this.binPath, '.bin', 'RpcServer', 'al-test-runner-rpcserver.exe');
    //private connection: rpc.MessageConnection;
    private serverProcess: ChildProcess;
    private _port: number = 0; public get port(): number { return this._port; }

    public constructor() {
        
    }

    public async RunServer() {
        this._port = 0;
        const port = await getRandomPort();
        
        this.serverProcess = spawn(this.serverPath, [port.toString()]);

        this.serverProcess.stdout?.on('data', (data) => {
            writeToOutputChannel(`Server output: ${data}`);
        });

        this.serverProcess.stderr?.on('data', (data) => {
            writeToOutputChannel(`Server error: ${data}`);
        });

        this._port = port;
    }

    public async StopServer() {
        this.serverProcess.kill();
    }
}

function findFreePort(startPort: number = 49152): Promise<number> {
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

// Usage
async function getRandomPort() {
    try {
        const port = await findFreePort();
        writeToOutputChannel(`Found free port: ${port}`);
        return port;
    } catch (error) {
        writeToOutputChannel(`Error finding free port: ${error}`);
        throw error;
    }
}