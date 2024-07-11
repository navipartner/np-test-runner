import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

export class TestRunnerWebApiClient {

    private axiosInstance: AxiosInstance = null;
    private port: number = 0; public get Port(): number { return this.port; }
    private baseUrl: string = null; public get BaseURL(): string { return this.baseUrl; }

    public async Connect(port: number) {
        if (this.axiosInstance) {
            return;
        }

        const baseURL = `http://localhost:${port}`;
        this.port = port;
        this.baseUrl = baseURL;

        this.axiosInstance = axios.create({
            baseURL,
            headers: {
                'Content-Type': 'application/json',
                'Accept': '*/*'
            }
        });
    }

    public async Disconnect() {
        if (this.axiosInstance) {
            await this.axiosInstance.delete(this.baseUrl);
            this.axiosInstance = null;
        }
    }

    private async invokeGeneric(invokeHttp: (params: any) => Promise<AxiosResponse>, params: any, progressDialogText?: string): Promise<AxiosResponse> {
        if (progressDialogText == null) {
            return await invokeHttp(params);
        } else {

            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: progressDialogText,
                cancellable: true
            }, async (progress, token) => {
                progress.report({ message: " ... " });

                try {
                    return await invokeHttp(params);
                } catch (e) {
                    throw e;
                }
            });

        }
    }

    public async invokeAlTests(params: any, progressDialogText?: string): Promise<AxiosResponse> {
        return await this.invokeGeneric(
            (params: any) => this.axiosInstance.post('/TestRunner/invokeAlTests', params),
            params,
            progressDialogText
        );
    }
}

export interface TestRunnerInvokeParams {
    alTestRunnerExtPath: string;
    alProjectPath: string;
    smbAlExtPath: string;
    tests: string;
    extensionId: string;
    extensionName: string;
    fileName: string;
    selectionStart: string;
    disabledTests?: Map<string, string>
}

enum HttpMethod {
    get,
    post,
    put,
    delete
}