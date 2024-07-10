import * as vscode from 'vscode';
//import * as rpc from 'vscode-jsonrpc/node';
import * as rpc from 'vscode-jsonrpc';
import * as net from 'net';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { getExtension, writeToOutputChannel } from './extension';
import * as types from './types';
import { ReadableStreamMessageReader, MessageReader, WriteableStreamMessageWriter, createMessageConnection, MessageConnection, RequestType } from 'vscode-jsonrpc';

/*
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

    public async InvokeALTests(alTestRunnerExtPath: string, alProjectPath: string, smbAlExtPath: string, tests: string, extensionId: string,
        extensionName: string, fileName: string, selectionStart: number): Promise<types.ALTestAssembly[]> {

        const invokeALTestsRequest = new rpc.RequestType<[string, string, string, string, string, string, string, number], void, Error>('InvokeALTestsSync');
        try {
            const result = await this.connection.sendRequest(invokeALTestsRequest, 
                [alTestRunnerExtPath, alProjectPath, smbAlExtPath, tests, extensionId, extensionName, fileName, selectionStart]);
            return null;

            const invokeALTests = this.connection.sendRequest.bind(this.connection, 'InvokeALTestsSync');

            await invokeALTests([alTestRunnerExtPath, alProjectPath, smbAlExtPath, tests, extensionId, extensionName, fileName, selectionStart])

            return null;
        } catch (ex)
        {
            throw ex;
        }
        //return await this.connection.sendRequest('InvokeALTests', 
        //    [alTestRunnerExtPath, alProjectPath, smbAlExtPath, tests, extensionId, extensionName, fileName, selectionStart]);
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
        const port = await this.GetRandomPort();
        
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
            writeToOutputChannel(`Found free port: ${port}`);
            return port;
        } catch (error) {
            writeToOutputChannel(`Error finding free port: ${error}`);
            throw error;
        }
    }
}

export class TestRunnerClient {
    private connection: rpc.MessageConnection | null = null;
    private static readonly PORT = 63731;

    async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const socket = new net.Socket();
            socket.connect(TestRunnerClient.PORT, 'localhost', () => {
                const reader = new rpc.StreamMessageReader(socket);
                const writer = new rpc.StreamMessageWriter(socket);
                this.connection = rpc.createMessageConnection(reader, writer);
                this.connection.listen();
                resolve();
            });

            socket.on('error', (err) => {
                reject(err);
            });
        });
    }

    async invokeALTests(
        alTestRunnerExtPath: string,
        alProjectPath: string,
        smbAlExtPath: string,
        tests: string,
        extensionId: string,
        extensionName: string,
        fileName: string,
        selectionStart: number
    ): Promise<any[]> {
        if (!this.connection) {
            throw new Error('Not connected to RPC server');
        }

        const request = new rpc.RequestType<any[], any[], any>('InvokeALTests');
        return this.connection.sendRequest(request, [
            alTestRunnerExtPath,
            alProjectPath,
            smbAlExtPath,
            tests,
            extensionId,
            extensionName,
            fileName,
            selectionStart
        ]);
    }

    async invokeALTestsSync(
        alTestRunnerExtPath: string,
        alProjectPath: string,
        smbAlExtPath: string,
        tests: string,
        extensionId: string,
        extensionName: string,
        fileName: string,
        selectionStart: number
    ): Promise<void> {
        if (!this.connection) {
            throw new Error('Not connected to RPC server');
        }

        const request = new rpc.RequestType<any[], void, any>('InvokeALTestsSync');
        await this.connection.sendRequest(request, [
            alTestRunnerExtPath,
            alProjectPath,
            smbAlExtPath,
            tests,
            extensionId,
            extensionName,
            fileName,
            selectionStart
        ]);
    }

    dispose(): void {
        if (this.connection) {
            this.connection.dispose();
            this.connection = null;
        }
    }
}
*/


const InvokeALTestsRequest = new RequestType<any, any[], any>('InvokeALTests');
const InvokeALTestsSyncRequest = new RequestType<any, void, any>('InvokeALTestsSync');

class TestRunnerRpcClient {
    private connection: MessageConnection;

    public async invokeALTests(alTestRunnerExtPath: string, alProjectPath: string, smbAlExtPath: string, tests: string, 
                               extensionId: string, extensionName: string, fileName: string, selectionStart: number): Promise<any[]> {
        return await this.connection.sendRequest(InvokeALTestsRequest, { 
            alTestRunnerExtPath, alProjectPath, smbAlExtPath, tests, extensionId, extensionName, fileName, selectionStart 
        });
    }

    public invokeALTestsSync(alTestRunnerExtPath: string, alProjectPath: string, smbAlExtPath: string, tests: string, 
                             extensionId: string, extensionName: string, fileName: string, selectionStart: number): void {
        this.connection.sendRequest(InvokeALTestsSyncRequest, { 
            alTestRunnerExtPath, alProjectPath, smbAlExtPath, tests, extensionId, extensionName, fileName, selectionStart 
        });
    }
}

export default TestRunnerRpcClient;