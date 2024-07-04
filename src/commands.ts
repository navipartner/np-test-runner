import * as vscode from 'vscode';
import { debugTestHandler, getTestItemFromFileNameAndSelection, runTestHandler } from './testController';
import { getALTestRunnerConfig, getALTestRunnerConfigPath, getALTestRunnerPath, getLaunchConfiguration, setALTestRunnerConfig, getCurrentWorkspaceConfig } from './config';
import { existsSync, readdirSync, unlinkSync } from 'fs';
import { invokePowerShellCmd, triggerUpdateDecorations } from './extension';
import { downloadClientSessionLibraries } from './clientContextDllHelper';
import * as types from './types'
import { toggleCodeCoverageDisplay } from './coverage';
import { showTableData } from './showTableData';
import { runRelatedTests, showRelatedTests } from './testCoverage';
import { listALFiles } from './alFileHelper';
import { showPerformanceProfile } from './performance';
import { TestRunnerWorkflow } from './testRunnerWorkflow';

export function registerCommands(context: vscode.ExtensionContext, testRunnerWorkflow: TestRunnerWorkflow) {
	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.runAllTests', async (extensionId?: string, extensionName?: string) => {
		runTestHandler(new vscode.TestRunRequest());
	}));

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.runTestsCodeunit', async (filename?: string, extensionId?: string, extensionName?: string) => {
		const testItem = await getTestItemFromFileNameAndSelection(filename, 0);
		if (testItem) {
			const request = new vscode.TestRunRequest([testItem]);
			runTestHandler(request);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.runTest', async (filename?: string, selectionStart?: number, extensionId?: string, extensionName?: string) => {
		const testItem = await getTestItemFromFileNameAndSelection(filename, selectionStart);
		if (testItem) {
			const request = new vscode.TestRunRequest([testItem]);
			runTestHandler(request);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.debugTest', async (filename: string, selectionStart: number) => {
		const testItem = await getTestItemFromFileNameAndSelection(filename, selectionStart);
		if (testItem) {
			const request = new vscode.TestRunRequest([testItem]);
			debugTestHandler(request);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.debugTestsCodeunit', async (filename: string) => {
		const testItem = await getTestItemFromFileNameAndSelection(filename, 0);
		if (testItem) {
			const request = new vscode.TestRunRequest([testItem]);
			debugTestHandler(request);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.clearTestResults', async () => {
		const resultsPath = getALTestRunnerPath() + '\\Results';
		if (existsSync(resultsPath)) {
			readdirSync(resultsPath).forEach(e => unlinkSync(resultsPath + '\\' + e));
		}
		triggerUpdateDecorations();
		vscode.window.showInformationMessage('AL Test Runner results cleared');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.openConfigFile', async () => {
		getALTestRunnerConfig();
		vscode.window.showTextDocument(await vscode.workspace.openTextDocument(getALTestRunnerConfigPath()));
	}));

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.installTestRunnerService', async () => {
		invokePowerShellCmd(`Install-TestRunnerService -LaunchConfig '${getLaunchConfiguration(getALTestRunnerConfig().launchConfigName)}'`);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.toggleCodeCoverage', async (newCodeCoverageDisplay?: types.CodeCoverageDisplay) => {
		toggleCodeCoverageDisplay(newCodeCoverageDisplay);
	}));

	vscode.commands.registerCommand('npaltestrunner.showTableData', async () => {
		showTableData();
	});

	vscode.commands.registerCommand('npaltestrunner.showRelatedTests', method => {
		showRelatedTests(method);
	})

	vscode.commands.registerCommand('npaltestrunner.runRelatedTests', method => {
		runRelatedTests(method);
	})

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.listALFiles', async () => {
		await listALFiles();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.showPerformanceProfile', () => {
		showPerformanceProfile();
	}))

	context.subscriptions.push(vscode.commands.registerCommand('npaltestrunner.downloadClientSessionLibraries', async () => {
		await downloadClientSessionLibraries();
	}));

	context.subscriptions.push(vscode.commands.registerCommand(`npaltestrunner.runSelectedWorkflow`, async (filename?: string, selectionStart?: number, extensionId?: string, extensionName?: string) => {
		testRunnerWorkflow.runSelectedWorkflow(filename, selectionStart, extensionId, extensionName).catch((exception) => {
			vscode.window.showErrorMessage("Can't run selected workflow!", "Please, create a workflow and then select it.", exception.message, exception.stack);
		});
	}));
}