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

export async function publishAppUsingAlCommand() {
    return await vscode.commands.executeCommand('al.publishNoDebug');
}

export async function publishAppWithRapidUsingAlCommand() {
    return await vscode.commands.executeCommand('al.incrementalPublishNoDebug');
}

export async function onChangeAppFile(uri: vscode.Uri) {
    if ((!shouldPublishApp) && (!getCurrentWorkspaceConfig().automaticPublishing)) {
        return;
    }

    if ((uri.fsPath.indexOf('dep.app') > 0) || (uri.fsPath.indexOf('.alpackages') > 0)) {
        return;
    }
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