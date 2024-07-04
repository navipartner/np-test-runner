import * as vscode from 'vscode';
import * as path from 'path';
import { getCurrentWorkspaceConfig } from './config'
import { getTestFolderPath } from './alFileHelper'
import { publishAppFile } from './publish';
import { documentIsTestCodeunit, getTestMethodRangesFromDocument } from './alFileHelper';
import { debugTestHandler, getTestItemFromFileNameAndSelection, runTestHandler } from './testController';

export class TestRunnerWorkflow {
    
    private lastCompiledAppFile: vscode.Uri;
    
    private getConfig(workflowName: string): any {
        const config = getCurrentWorkspaceConfig(false);    
        const workflows = config.get('workflows') as any;
        return workflows ? workflows[workflowName] : null;        
    }

    public async runSelectedWorkflow(filename?: string, selectionStart?: number, extensionId?: string, extensionName?: string): Promise<void> {
        const config = getCurrentWorkspaceConfig(false);
        const selectedWorkflow = config.get('selectedWorkflow') as string;
        if (selectedWorkflow == null) {
            throw new Error(`You haven't selected any workflow yet! Use parameter 'selectedWorkflow' to specify the workflow name.`);
        }
        return await this.runWorkflow(selectedWorkflow, filename, selectionStart, extensionId, extensionName);
    }

    public async runWorkflow(workflowName: string, filename?: string, selectionStart?: number, extensionId?: string, extensionName?: string): Promise<void> {
        const workflow = this.getConfig(workflowName);
        let testItem: vscode.TestItem = null;
        let request = null;
        let document = null;

        switch (workflow.test) {
            case 'all':
                testItem = null;
                request = null;
                break;
            case 'activeDocument':
                testItem = await getTestItemFromFileNameAndSelection(filename, 0);
                request = new vscode.TestRunRequest([testItem]);
                break;
            case 'functionAtCursor':
                testItem = await getTestItemFromFileNameAndSelection(filename, selectionStart);
                request = new vscode.TestRunRequest([testItem]);
                break;
        }

        if (workflow.test != 'all') {
            document = await vscode.workspace.openTextDocument(testItem.uri.fsPath);
            if (!(documentIsTestCodeunit(document))) {
                throw new Error(`You can run this workflow only for a test Codeunit!`);
            }
        }

        await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Running tests workflow`,
			cancellable: true
		}, async (progress, token) => {
            
			try {
				if (workflow.compile) {
                    progress.report({ message: "Compiling" });
                    await this.compile();
                }
        
                if (workflow.publish != null) {
                    progress.report({ message: "Publishing" });
                    await this.publish(workflow.publish);
                }
        
                progress.report({ message: "Invoking tests" });
                if (workflow.debug) {
                    switch (workflow.test) {
                        case 'all':
                            await this.debugAllTests();
                            break;
                        case 'activeDocument':
                            await this.debugTestsInActiveDocument();
                            break;
                        case 'functionAtCursor':
                            await this.debugTestAtCursor();
                            break;
                    }
                } else {
                    switch (workflow.test) {
                        case 'all':
                            await this.runAllTests();
                            break;
                        case 'activeDocument':
                            await this.runTestsInActiveDocument();
                            break;
                        case 'functionAtCursor':
                            await this.runTestAtCursor(request);
                            break;
                    }
                }
		
				return new Promise<void>((resolve) => {
					resolve();
				});
			} catch (e) {
                vscode.window.showErrorMessage(e.message, e.stack);
                throw e;
			}
		});
    }

    private async compile(): Promise<void> {
        this.lastCompiledAppFile = null;

        const testFolderPath = getTestFolderPath();
        if (testFolderPath) {
            const testAppsPath = path.join(testFolderPath, '*.app');
            const appFileWatcher = vscode.workspace.createFileSystemWatcher(testAppsPath, false, false, true);
            appFileWatcher.onDidChange(uri => {
                if ((uri.fsPath.indexOf('dep.app') > 0) || (uri.fsPath.indexOf('.alpackages') > 0)) {
                    return;
                }            
                this.lastCompiledAppFile = uri;
            });
        }
        await vscode.commands.executeCommand('al.package');
    }

    private async publish(publishMethod: string): Promise<void> {
        try {
            switch (publishMethod) {
                case "viaDevEndpoint":
                    if (this.lastCompiledAppFile == null) {
                        throw new Error("Before publishing, you have to compile first! Verify compilation step is properly configured and has been executed successfully!");
                    }
                    await publishAppFile(this.lastCompiledAppFile);
                    break;
                case "alPublish":
                    break;
                case "alRapidPublish":
                    break
                default:
                    throw new Error(`Publishing method '${publishMethod}' is unknown and unsupported!`);
            }
        } catch (ex) {
            throw ex;
        }

        return new Promise((resolve, _) => {
            resolve();
        });
    }

    private async runAllTests(): Promise<void> {
        throw new Error("To be implemented!!!");
    }

    private async runTestsInActiveDocument(): Promise<void> {
        throw new Error("To be implemented!!!");
    }

    private async runTestAtCursor(request: vscode.TestRunRequest): Promise<void> {
        runTestHandler(request);
    }

    private async debugAllTests(): Promise<void> {
        throw new Error("To be implemented!!!");
        /*
        await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], {
            type: 'node',
            request: 'launch',
            name: 'Debug All Tests',
            program: '${workspaceFolder}/node_modules/.bin/mocha',
            args: ['--timeout', '999999', '--inspect-brk=0.0.0.0:9229'],
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            skipFiles: ['<node_internals>/**'],
            protocol: 'inspector'
        });
        */
    }

    private async debugTestsInActiveDocument(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            throw new Error("To be implemented!!!");
            /*
            const filePath = activeEditor.document.fileName;
            await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], {
                type: 'node',
                request: 'launch',
                name: 'Debug Tests in Active Document',
                program: '${workspaceFolder}/node_modules/.bin/mocha',
                args: [filePath, '--timeout', '999999', '--inspect-brk=0.0.0.0:9229'],
                console: 'integratedTerminal',
                internalConsoleOptions: 'neverOpen',
                skipFiles: ['<node_internals>/**'],
                protocol: 'inspector'
            });
            */
        }
    }

    private async debugTestAtCursor(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            throw new Error("To be implemented!!!");
            /*
            const position = activeEditor.selection.active;
            const filePath = activeEditor.document.fileName;
            const testName = await this.getTestNameAtPosition(activeEditor.document, position);

            await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], {
                type: 'node',
                request: 'launch',
                name: 'Debug Test at Cursor',
                program: '${workspaceFolder}/node_modules/.bin/mocha',
                args: [filePath, '--grep', testName, '--timeout', '999999', '--inspect-brk=0.0.0.0:9229'],
                console: 'integratedTerminal',
                internalConsoleOptions: 'neverOpen',
                skipFiles: ['<node_internals>/**'],
                protocol: 'inspector'
            });
            */
        }
    }
}