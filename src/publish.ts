import * as vscode from 'vscode';
import { getCurrentWorkspaceConfig } from './config';
import { getALTestRunnerTerminal } from './extension';

let shouldPublishApp: Boolean = false;

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

export function displayPublishTerminal() {
    const terminal = getALTestRunnerTerminal(getTerminalName());
    terminal.show(false);
}