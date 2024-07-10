import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import * as vscode from 'vscode';
import { activeEditorIsOpenToTestAppJson, openEditorToTestFileIfNotAlready } from './alFileHelper';
import { getALTestRunnerConfig, getALTestRunnerPath, getCurrentWorkspaceConfig, getLaunchConfiguration } from './config';
import { failedToPublishMessage } from './constants';
import { getALTestRunnerTerminal, invokePowerShellCmd, getDocumentWorkspaceFolder, getSmbAlExtensionPath } from './extension';
import { awaitFileExistence } from './file';
import { sendDebugEvent, sendFailedToPublishError, sendNoTestFolderNameError } from './telemetry';
import { PublishResult, PublishType } from "./types";

let shouldPublishApp: Boolean = false;

export function publishApp(publishType: PublishType): Promise<PublishResult> {
    return new Promise(async resolve => {
        sendDebugEvent('publishApp-start', { publishType: publishType.toString() });
        let success: boolean = false;
        let message: string = '';
        if (publishType === PublishType.None) {
            resolve({ success: true, message: '' });
            return;
        }

        const closeEditor = await openEditorToTestFileIfNotAlready();
        let command: string = '';

        if (getCurrentWorkspaceConfig().enablePublishingFromPowerShell) {
            sendDebugEvent('publishApp-publishFromPowerShell');
            
            shouldPublishApp = true;
            if (existsSync(getPublishCompletionPath())) {
                unlinkSync(getPublishCompletionPath());
            }

            await vscode.commands.executeCommand('al.package');
            const resultExists = await awaitFileExistence(getPublishCompletionPath(), getCurrentWorkspaceConfig().publishTimeout);
            if (resultExists) {
                const content = readFileSync(getPublishCompletionPath(), { encoding: 'utf-8' })
                success = content.trim() === '1';
                if (!success) {
                    message = content;
                    sendFailedToPublishError(content);
                }
            }
            else {
                success = false;
                sendFailedToPublishError();
            }
        }
        else {
            sendDebugEvent('publishApp-publishWithALCommand');
            switch (publishType) {
                case PublishType.Publish:
                    command = 'al.publishNoDebug';
                    break;
                case PublishType.Rapid:
                    command = 'al.incrementalPublishNoDebug';
                    break;
            }

            await vscode.commands.executeCommand(command);
            success = true;
        }

        if (closeEditor) {
            if (activeEditorIsOpenToTestAppJson()) {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        }

        resolve({ success: success, message: message });
    });
}

export async function publishAppFileUsingPwsh(uri: vscode.Uri): Promise<PublishResult> {
    try {
        return new Promise(async resolve => {
            shouldPublishApp = false;
            let activeDocumentRootFolderPath = await getDocumentWorkspaceFolder();
            let smbAlExtPath = getSmbAlExtensionPath();
            await invokePowerShellCmd(`Set-Location ${activeDocumentRootFolderPath}`);
            await invokePowerShellCmd(`Publish-App -AppFile "${uri.fsPath}" -smbAlExtPath "${smbAlExtPath}" `);        
    
            resolve({ success: true, message: '' });
        });
    } catch (e) {
        throw e;
    }
}

export async function publishAppFileUsingPwshWithDialog(uri: vscode.Uri): Promise<PublishResult> {
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Publishing changs`,
        cancellable: true
    }, async (progress, token) => {
        progress.report({ message: "" });
        
        return await publishAppFileUsingPwsh(uri);
    });
}

export async function onChangeAppFile(uri: vscode.Uri) {
    if ((!shouldPublishApp) && (!getCurrentWorkspaceConfig().automaticPublishing)) {
        return;
    }

    if ((uri.fsPath.indexOf('dep.app') > 0) || (uri.fsPath.indexOf('.alpackages') > 0)) {
        return;
    }

    await publishAppFileUsingPwshWithDialog(uri);
}

function getTerminalName(): string {
    return 'np-al-test-runner';
}

function getPublishCompletionPath(): string {
    return join(getALTestRunnerPath(), "publish.txt");
}

export function displayPublishTerminal() {
    const terminal = getALTestRunnerTerminal(getTerminalName());
    terminal.show(false);
}