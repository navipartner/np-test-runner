import * as vscode from 'vscode';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import * as xml2js from 'xml2js';
import * as types from './types';
import { CodelensProvider } from './codelensProvider';
import { updateCodeCoverageDecoration, createCodeCoverageStatusBarItem } from './coverage';
import { documentIsTestCodeunit, getALFilesInWorkspace, getDocumentIdAndName, getTestFolderPath, getTestMethodRangesFromDocument } from './alFileHelper';
import { getALTestRunnerConfig, getALTestRunnerPath, getCurrentWorkspaceConfig, getDebugConfigurationsFromLaunchJson, getLaunchJsonPath, getALTestRunnerConfigKeyValue } from './config';
import { getOutputWriter, OutputWriter } from './output';
import { createTestController, deleteTestItemForFilename, discoverTests, discoverTestsInDocument, discoverTestsInFileName } from './testController';
import { onChangeAppFile, publishApp } from './publish';
import { awaitFileExistence } from './file';
import { join, resolve } from 'path';
import TelemetryReporter from '@vscode/extension-telemetry';
import { createTelemetryReporter, sendDebugEvent } from './telemetry';
import { TestCoverageCodeLensProvider } from './testCoverageCodeLensProvider';
import { CodeCoverageCodeLensProvider } from './codeCoverageCodeLensProvider';
import { registerCommands } from './commands';
import { createHEADFileWatcherForTestWorkspaceFolder } from './git';
import { createPerformanceStatusBarItem } from './performance';
import { PowerShell, PowerShellOptions, PSExecutableType, InvocationError } from 'node-powershell';
import { checkAndDownloadMissingDlls } from './clientContextDllHelper';
import * as path from 'path';
import { exec } from 'child_process';
import * as semver from 'semver';

let terminal: vscode.Terminal;
let debugChannel: vscode.OutputChannel;
var powershellSession = null;
var powershellSessionReady = false;
export let activeEditor = vscode.window.activeTextEditor;
export let alFiles: types.ALFile[] = [];
const config = vscode.workspace.getConfiguration('np-al-test-runner');
const passingTestColor = 'rgba(' + config.passingTestsColor.red + ',' + config.passingTestsColor.green + ',' + config.passingTestsColor.blue + ',' + config.passingTestsColor.alpha + ')';
const failingTestColor = 'rgba(' + config.failingTestsColor.red + ',' + config.failingTestsColor.green + ',' + config.failingTestsColor.blue + ',' + config.failingTestsColor.alpha + ')';
const untestedTestColor = 'rgba(' + config.untestedTestsColor.red + ',' + config.untestedTestsColor.green + ',' + config.untestedTestsColor.blue + ',' + config.untestedTestsColor.alpha + ')';
export const outputWriter: OutputWriter = getOutputWriter(vscode.workspace.getConfiguration('np-al-test-runner').testOutputLocation);
export const channelWriter: OutputWriter = getOutputWriter(types.OutputType.Channel);

const testFolderPath = getTestFolderPath();
if (testFolderPath) {
	const testAppsPath = join(testFolderPath, '*.app');
	const appFileWatcher = vscode.workspace.createFileSystemWatcher(testAppsPath, false, false, true);
	appFileWatcher.onDidChange(e => {
		onChangeAppFile(e);
	});
}


export const passingTestDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: passingTestColor
});

const failingTestDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: failingTestColor
});

const untestedTestDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: untestedTestColor
});

const failingLineDecorationType = vscode.window.createTextEditorDecorationType({
	textDecoration: config.failingLineDecoration
});

export const outputChannel = vscode.window.createOutputChannel(getTerminalName());
let updateDecorationsTimeout: NodeJS.Timer | undefined = undefined;
let discoverTestsTimeout: NodeJS.Timer | undefined = undefined;

export let alTestController: vscode.TestController;
export let telemetryReporter: TelemetryReporter;

export function activate(context: vscode.ExtensionContext) {
	console.log('navipartner.np-al-test-runner extension is activated');

	checkAllExternalPrerequisites();

	let codelensProvider = new CodelensProvider();
	vscode.languages.registerCodeLensProvider("*", codelensProvider);

	let testCoverageCodeLensProvider = new TestCoverageCodeLensProvider();
	vscode.languages.registerCodeLensProvider("*", testCoverageCodeLensProvider);

	let codeCoverageCodeLensProvider = new CodeCoverageCodeLensProvider();
	vscode.languages.registerCodeLensProvider("*", codeCoverageCodeLensProvider);

	context.subscriptions.push(alTestController);

	registerCommands(context);

	context.subscriptions.push(createCodeCoverageStatusBarItem());
	context.subscriptions.push(createPerformanceStatusBarItem());

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			if (documentIsTestCodeunit(activeEditor!.document)) {
				triggerUpdateDecorations();
			}
			else {
				updateCodeCoverageDecoration();
			}
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			triggerUpdateDecorations();
			triggerDiscoverTestsInDocument(activeEditor.document);
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidRenameFiles(event => {
		event.files.forEach(rename => {
			deleteTestItemForFilename(rename.oldUri.fsPath);
			discoverTestsInFileName(rename.newUri.fsPath);
		});
	});

	vscode.workspace.onDidCreateFiles(event => {
		event.files.forEach(file => {
			deleteTestItemForFilename(file.fsPath);
			discoverTestsInFileName(file.fsPath);
		});
	});

	vscode.workspace.onDidChangeTextDocument(event => {
		discoverTestsInDocument(event.document);
	});

	createHEADFileWatcherForTestWorkspaceFolder();

	telemetryReporter = createTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	alTestController = createTestController();
	context.subscriptions.push(alTestController);
	discoverTests();

	invokePowerShellCmd(`Set-Location ${getTestFolderPath()}`);
	checkMissingButConfiguredClientSessionLibsAndDownload().catch((error) => {
		vscode.window.showInformationMessage('Please reload the window to activate the extension.', 'Reload')
        .then(selection => {
            if (selection === 'Reload') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
	});
}

export async function invokeTestRunner(command: string): Promise<types.ALTestAssembly[]> {
	return new Promise(async (resolve) => {
		sendDebugEvent('invokeTestRunner-start');
		const config = getCurrentWorkspaceConfig();
		getALFilesInWorkspace(config.codeCoverageExcludeFiles).then(files => { alFiles = files });
		let publishType: types.PublishType = types.PublishType.None;

		if (!config.automaticPublishing) {
			switch (config.publishBeforeTest) {
				case 'Publish':
					publishType = types.PublishType.Publish;
					break;
				case 'Rapid application publish':
					publishType = types.PublishType.Rapid;
					break;
			}
		}

		const result = await publishApp(publishType);
		if (!result.success) {
			const results: types.ALTestAssembly[] = [];
			resolve(results);
			return;
		}

		if (config.enableCodeCoverage) {
			command += ' -GetCodeCoverage';
		}

		if (config.enablePerformanceProfiler) {
			command += ' -GetPerformanceProfile';
		}

		if (existsSync(getLastResultPath())) {
			unlinkSync(getLastResultPath());
		}

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Running tests`,
			cancellable: true
		}, async (progress, token) => {
			progress.report({ message: "Working ..." });
			
			await invokePowerShellCmd(`Set-Location ${getTestFolderPath()}`);
			await invokePowerShellCmd(config.preTestCommand);
			await invokePowerShellCmd(command).then((result) => {

			}).catch((error) => {
				vscode.window.showErrorMessage(`Test execution failed`, error);
			});
	
			return new Promise<void>((resolve) => {
				resolve();
			});
		});

		await invokePowerShellCmd(config.postTestCommand);

		awaitFileExistence(getLastResultPath(), 0).then(async resultsAvailable => {
			if (resultsAvailable) {
				const results: types.ALTestAssembly[] = await readTestResults(vscode.Uri.file(getLastResultPath()));
				resolve(results);

				triggerUpdateDecorations();
			}
		});
	});
}

async function readTestResults(uri: vscode.Uri): Promise<types.ALTestAssembly[]> {
	return new Promise(async resolve => {
		const xmlParser = new xml2js.Parser();
		const resultXml = readFileSync(uri.fsPath, { encoding: 'utf-8' });
		const resultObj = await xmlParser.parseStringPromise(resultXml);
		const assemblies: types.ALTestAssembly[] = resultObj.assemblies.assembly;

		resolve(assemblies);
	});
}

export function initDebugTest(filename: string) {
	invokePowerShellCmd(`Set-Location ${getTestFolderPath()}`);
	invokePowerShellCmd('Invoke-TestRunnerService -FileName "' + filename + '" -Init');
}

export function invokeDebugTest(filename: string, selectionStart: number) {
	invokePowerShellCmd(`Set-Location ${getTestFolderPath()}`);
	invokePowerShellCmd('Invoke-TestRunnerService -FileName "' + filename + '" -SelectionStart ' + selectionStart);
}

export async function attachDebugger() {
	if (vscode.debug.activeDebugSession) {
		return;
	}

	const attachConfigs = getDebugConfigurationsFromLaunchJson('attach');

	if (attachConfigs.length === 0) {
		vscode.window.showErrorMessage("Please define a debug configuration in launch.json before debugging tests. See [https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/devenv-attach-debug-next](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/devenv-attach-debug-next)");
		throw 'Please define a debug configuration in launch.json before debugging tests.';
	}

	const attachConfig = attachConfigs.shift() as vscode.DebugConfiguration;
	await vscode.debug.startDebugging(vscode.workspace.workspaceFolders![0], attachConfig);
}

function getDocumentWorkspaceFolder(): string | undefined {
	const fileName = vscode.window.activeTextEditor?.document.fileName;
	return vscode.workspace.workspaceFolders
		?.map((folder) => folder.uri.fsPath)
		.filter((fsPath) => fileName?.startsWith(fsPath))[0];
}

export async function invokePowerShellCmd(command: string) : Promise<any> {
	
	if ((command === null) || (command == '')) {
		return new Promise((resolve) => {
			resolve(null);
		})
	}

	if (powershellSession === null) {
		try {
			let powershellOptions : PowerShellOptions = {
				executable: PSExecutableType.PowerShellCore,
				throwOnInvocationError: true,
				executableOptions: {
					'-NoLogo': true,
					'-NoExit': true,
					"-NonInteractive": true
				}
			}

			powershellSession = new PowerShell(powershellOptions);

			await powershellSession.invoke(`$ErrorActionPreference = "Stop"`).then((result => {
				console.log(result);
			})).catch((error) => {
				console.log(error);
				vscode.window.showErrorMessage(error);
			});

			let alTestRunnerModulePath = path.join(getExtension()!.extensionPath, 'PowerShell', 'ALTestRunner.psm1');
			await powershellSession.invoke(`Import-Module ${alTestRunnerModulePath};`).then((result) => {
				console.log(result);
			}).catch((error) => {
				vscode.window.showErrorMessage(error);
			});

			let npAlTestRunnerModulePath = path.join(getExtension()!.extensionPath, 'PowerShell', 'NPTestRunner', 'NPALTestRunner.psm1');
			await powershellSession.invoke(`Import-Module ${npAlTestRunnerModulePath}`).then((result) => {
				console.log(result);
			}).catch((error) => {
				vscode.window.showErrorMessage(error);
			});

			let npClientContextDotNetPath = path.join(getExtension()!.extensionPath, 'PowerShell', 'NPTestRunner', 'ClientContextDotNet', 'ClientContextDotNet.psm1');
			await powershellSession.invoke(`Import-Module ${npClientContextDotNetPath}`).then((result) => {
				console.log(result);
			}).catch((error) => {
				vscode.window.showErrorMessage(error);
			});
			
			let activeDocumentRootFolderPath = getDocumentWorkspaceFolder();
			await powershellSession.invoke(`Set-Location ${activeDocumentRootFolderPath}`).then((result) => {
				console.log(result);
			}).catch((error) => {
				vscode.window.showErrorMessage(error);
			});
		} catch(e) {
			if (powershellSession) {
				await powershellSession.dispose();
				powershellSession = null;
			}
			throw e;
		}
	}

	console.log(command);
	await powershellSession.invoke(command).then((result) => {
		console.log(result);
		return result;
	}).catch((error) => {
		let errorMsg = null;
		let errorStack = null;
		let errorException = null;
		let hasErrorDetails = false;

		try {			
			errorMsg = extractPowerShellError(error.message);
			errorStack = extractPowerShellError(error.stack);
			
			const errorSegments = tryToParsePowerShellComplexError(errorMsg);
			if ((errorSegments) && (errorSegments.length == 4) && (errorSegments[0] == 'pwshexception')) {
				errorMsg = errorSegments[1];
				errorStack = errorSegments[2];
				errorException = errorSegments[3];
				hasErrorDetails = true;
			}

			writeToOutputChannel(`${command}  =>  ${errorMsg}`);
			writeToOutputChannel(`			  =>  ${errorStack}`);

			if (hasErrorDetails) {
				console.log(`${command}  =>  ${errorMsg}`);
				console.log(`			  =>  ${errorStack}`);
				console.log(`			  =>  ${errorException}`);
			} else {
				console.log(error);
			}
		} catch {
			console.log(error);
		}

		try {
			if (debugChannel) {
				debugChannel.show(false);
			}
		} catch(e) {
			console.log(`Can't open PowerShell invocation error channel: ${e}`);
		}

		if (errorMsg != null) {
			throw errorMsg;
		} else {
			throw error;
		}
	});
}

function extractPowerShellError(extractionString: string) : string {
	let errorMsg = extractionString;
	errorMsg = errorMsg.replaceAll('[31;1m', '').replaceAll('[0m', '').replaceAll('[36;1m', '').replaceAll('\r\n', '');
	return errorMsg;
}

function tryToParsePowerShellComplexError(errorMsg: string) : string[] {
	// Use a regular expression to find all substrings within {{ }}
	const pattern: RegExp = /{{(.*?)}}/gs;
	const substrings: string[] = [];
	let match: RegExpExecArray | null;

	// Use RegExp.exec() to find all matches
	while ((match = pattern.exec(errorMsg)) !== null) {
		// match[1] contains the text within {{ }}
		substrings.push(match[1]);
	}

	return substrings;
}

export function getSmbAlExtension() : vscode.Extension<any> {
	let ext = vscode.extensions.getExtension('ms-dynamics-smb.al');
	if (!ext) {
		throw new Error(`Microsoft AL development extension is missing. Install this extension first.`);
	}
	return ext;
}

export function getSmbAlExtensionPath() : string {
	let ext = getSmbAlExtension();
	return ext.extensionPath;
}

function updateDecorations() {
	if (!activeEditor) {
		return;
	}

	const config = getCurrentWorkspaceConfig();

	let passingTests: vscode.DecorationOptions[] = [];
	let failingTests: vscode.DecorationOptions[] = [];
	let untestedTests: vscode.DecorationOptions[] = [];
	let failingLines: vscode.DecorationOptions[] = [];

	const sanitize = require("sanitize-filename");

	//call with empty arrays to clear all the decorations
	setDecorations(passingTests, failingTests, untestedTests, failingLines);

	if (!(config.decorateTestMethods)) {
		setDecorations(passingTests, failingTests, untestedTests);
		return;
	}

	let testMethodRanges: types.ALMethodRange[] = getTestMethodRangesFromDocument(activeEditor!.document);

	let resultFileName = getALTestRunnerPath() + '\\Results\\' + sanitize(getDocumentIdAndName(activeEditor!.document)) + '.xml';
	if (!(existsSync(resultFileName))) {
		setDecorations(passingTests, failingTests, getUntestedTestDecorations(testMethodRanges));
		return;
	}

	const xmlParser = new xml2js.Parser();

	let resultXml = readFileSync(resultFileName, { encoding: 'utf-8' });
	xmlParser.parseStringPromise(resultXml).then(resultObj => {
		const collection = resultObj.assembly.collection;
		const tests = collection.shift()!.test as Array<types.ALTestResult>;

		tests.forEach(test => {
			const testMethod = testMethodRanges.find(element => element.name === test.$.method);
			if ((null !== testMethod) && (undefined !== testMethod)) {
				const startPos = testMethod.range.start;
				const endPos = testMethod.range.end;
				testMethodRanges.splice(testMethodRanges.findIndex(element => element.name === test.$.method), 1);

				let decoration: vscode.DecorationOptions;

				switch (test.$.result) {
					case 'Pass':
						decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: 'Test passing 👍' };
						passingTests.push(decoration);
						break;
					case 'Fail':
						const hoverMessage: string = test.failure[0].message + "\n\n" + test.failure[0]["stack-trace"];
						decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: hoverMessage };
						failingTests.push(decoration);

						if (config.highlightFailingLine) {
							const failingLineRange = getRangeOfFailingLineFromCallstack(test.failure[0]["stack-trace"][0], test.$.method, activeEditor!.document);
							if (failingLineRange !== undefined) {								
								const decoration: vscode.DecorationOptions = { range: failingLineRange, hoverMessage: hoverMessage };
								failingLines.push(decoration);
							}
						}
						break;
					default:
						break;
				}
			}
		});

		setDecorations(passingTests, failingTests, getUntestedTestDecorations(testMethodRanges), failingLines);
	})
		.catch(err => {
			vscode.window.showErrorMessage(err);
		});
}

function setDecorations(passingTests: vscode.DecorationOptions[], failingTests: vscode.DecorationOptions[], untestedTests: vscode.DecorationOptions[], failingLines?: vscode.DecorationOptions[]) {
	activeEditor!.setDecorations(passingTestDecorationType, passingTests);
	activeEditor!.setDecorations(failingTestDecorationType, failingTests);
	activeEditor!.setDecorations(untestedTestDecorationType, untestedTests);

	if (failingLines) {
		activeEditor!.setDecorations(failingLineDecorationType, failingLines);
	}
}

function getUntestedTestDecorations(testMethodRanges: types.ALMethodRange[]): vscode.DecorationOptions[] {
	let untestedTests: vscode.DecorationOptions[] = [];
	if (testMethodRanges.length > 0) {
		testMethodRanges.forEach(element => {
			const decoration: vscode.DecorationOptions = { range: element.range, hoverMessage: 'There are no results for this test 🤷‍♀️' };
			untestedTests.push(decoration);
		});
	}

	return untestedTests;
}

export function triggerUpdateDecorations() {
	if (updateDecorationsTimeout) {
		clearTimeout(updateDecorationsTimeout);
		updateDecorationsTimeout = undefined;
	}

	updateDecorationsTimeout = setTimeout(updateDecorations, 500);
}

function triggerDiscoverTestsInDocument(document: vscode.TextDocument) {
	if (discoverTestsTimeout) {
		clearTimeout(discoverTestsTimeout);
		discoverTestsTimeout = undefined;
	}

	discoverTestsTimeout = setTimeout(() => { discoverTestsInDocument(document) }, 500);
}

if (activeEditor) {
	if (documentIsTestCodeunit(activeEditor.document)) {
		triggerUpdateDecorations();
	}
}

export function getTerminalName() {
	return 'np-al-test-runner';
}

export function getALTestRunnerTerminal(terminalName: string): vscode.Terminal {
	sendDebugEvent('getALTestRunnerTerminal-start', { terminalName: terminalName });
	let terminals = vscode.window.terminals.filter(element => element.name === terminalName);
	let terminal;
	if (terminals) {
		terminal = terminals.shift()!;
	}

	if (!terminal) {
		sendDebugEvent('getALTestRunnerTerminal-createTerminal', { terminalName: terminalName });
		terminal = vscode.window.createTerminal(terminalName);
	}

	terminal.sendText('$ErrorActionPreference = "Stop"');

	let PSPath = getExtension()!.extensionPath + '\\PowerShell\\ALTestRunner.psm1';
	terminal.sendText('if ($null -eq (Get-Module ALTestRunner)) {Import-Module "' + PSPath + '" -DisableNameChecking 3>$null}');

	PSPath = getExtension()!.extensionPath + '\\PowerShell\\NPTestRunner\\NPALTestRunner.psm1';
	terminal.sendText('if ($null -eq (Get-Module NPALTestRunner)) {Import-Module "' + PSPath + '" -DisableNameChecking 3>$null}');

	return terminal;
}

export function getExtension() {
	return vscode.extensions.getExtension('navipartner.np-al-test-runner');
}

export function writeToOutputChannel(value: string) {
	sendDebugEvent('writeToOutputChannel-start');
	if (!debugChannel) {
		debugChannel = vscode.window.createOutputChannel(getOutputChannel());
	}

	debugChannel.appendLine(value);
}

export function getOutputChannel() {
	return 'np-al-test-runner-output';
}


export function getRangeOfFailingLineFromCallstack(callstack: string, method: string, document: vscode.TextDocument): vscode.Range  {
	const methodStartLineForCallstack = getLineNumberOfMethodDeclaration(method, document);
	if (methodStartLineForCallstack === -1) {
		return;
	}

	const matches = callstack.match(method + ' line (\\d+)');
	if ((matches !== undefined) && (matches !== null)) {
		const lineNo = parseInt(matches[1]);
		const line = document.lineAt(lineNo + methodStartLineForCallstack);
		return new vscode.Range(new vscode.Position(line.lineNumber, line.firstNonWhitespaceCharacterIndex), new vscode.Position(line.lineNumber, line.text.length));
	}
}

export function getLineNumberOfMethodDeclaration(method: string, document: vscode.TextDocument): number {
	const text = document.getText();
	const match = text.match('procedure.+' + method);
	if ((match === undefined) || (match === null)) {
		return -1;
	}

	return document.positionAt(match!.index!).line;
}

export function getCodeunitIdFromAssemblyName(assemblyName: string): number {
	const matches = assemblyName.match('\\d+');
	if (matches) {
		return parseInt(matches!.shift()!);
	}

	return (0);
}

export function getLaunchJson() {
	const launchPath = getLaunchJsonPath();
	const data = readFileSync(launchPath, { encoding: 'utf-8' });
	return JSON.parse(data);
}

export function getAppJsonKey(keyName: string) {
	sendDebugEvent('getAppJsonKey-start', { keyName: keyName });
	const appJsonPath = path.join(getTestFolderPath(), 'app.json');
	const data = readFileSync(appJsonPath, { encoding: 'utf-8' });
	const appJson = JSON.parse(data.charCodeAt(0) === 0xfeff
		? data.slice(1) // Remove BOM
		: data);

	sendDebugEvent('getAppJsonKey-end', { keyName: keyName, keyValue: appJson[keyName] });
	return appJson[keyName];
}

export function getLastResultPath(): string {
	return path.join(getALTestRunnerPath(), 'last.xml');
}

// this method is called when your extension is deactivated
export function deactivate() {
	if (powershellSession) {
		powershellSession.dispose();
	}
 }

export async function getRunnerParams(command: string): Promise<types.ALTestAssembly[]> {
	return new Promise(async (resolve) => {
		sendDebugEvent('invokeTestRunner-start');
		const config = getCurrentWorkspaceConfig();
		getALFilesInWorkspace(config.codeCoverageExcludeFiles).then(files => { alFiles = files });
		let publishType: types.PublishType = types.PublishType.None;

		if (!config.automaticPublishing) {
			switch (config.publishBeforeTest) {
				case 'Publish':
					publishType = types.PublishType.Publish;
					break;
				case 'Rapid application publish':
					publishType = types.PublishType.Rapid;
					break;
			}
		}

		const result = await publishApp(publishType);
		if (!result.success) {
			const results: types.ALTestAssembly[] = [];
			resolve(results);
			return;
		}

		if (config.enableCodeCoverage) {
			command += ' -GetCodeCoverage';
		}

		if (config.enablePerformanceProfiler) {
			command += ' -GetPerformanceProfile';
		}

		if (existsSync(getLastResultPath())) {
			unlinkSync(getLastResultPath());
		}

		invokePowerShellCmd(`Set-Location ${getTestFolderPath()}`).then(() => {
			return invokePowerShellCmd(config.preTestCommand);
		}).then(() => {
			return invokePowerShellCmd(command);
		}).then(() => {
			invokePowerShellCmd(config.postTestCommand);
		}).then(() => {
			awaitFileExistence(getLastResultPath(), 0).then(async resultsAvailable => {
				if (resultsAvailable) {
					const results: types.ALTestAssembly[] = await readTestResults(vscode.Uri.file(getLastResultPath()));
					resolve(results);
	
					triggerUpdateDecorations();
				}
			});
		}).catch((error) => {
			throw error;
		});
	});
}

export async function invokeCommandFromAlDevExtension(command: string, params?: any[]) : Promise<unknown> {
	var extension =  getSmbAlExtension();

	// is the ext loaded and ready?
	if( extension.isActive == false ){
		await extension.activate(); 
	}

	return vscode.commands.executeCommand(command, params);
}

export async function checkMissingButConfiguredClientSessionLibsAndDownload() : Promise<any> {
	const selectedBcVersion = getALTestRunnerConfigKeyValue('selectedBcVersion');
	if (selectedBcVersion == null || (selectedBcVersion.trim().length === 0)) {
		return new Promise<any>((resolve) => {
			// No version configured yet.
			resolve(false);
		});
	}

	return await checkAndDownloadMissingDlls(selectedBcVersion);
}

function checkPowerShellVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
        exec('pwsh -v', (error, stdout, stderr) => {
            if (error) {
                reject(`Error executing PowerShell: ${error.message}`);
            } else {
                resolve(extractSemver(stdout.trim()));
            }
        });
    });
}

function checkDotNetVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
        exec('dotnet --version', (error, stdout, stderr) => {
            if (error) {
                reject(`Error checking .NET version: ${error.message}`);
            } else {
                resolve(extractSemver(stdout.trim()));
            }
        });
    });
}

function checkAllExternalPrerequisites() {
	
	const requiredPSVersion = '7.0.0';
    const requiredDotNetVersion = '5.0.0';

	Promise.all([checkPowerShellVersion(), checkDotNetVersion()])
        .then(([psVersion, dotNetVersion]) => {
			if (compareVersions(requiredPSVersion, psVersion)) {
                console.log(`PowerShell version ${psVersion} meets the requirement.`);
            } else {
                showMissingPrerequisiteErrorMessage(
					`PowerShell version ${psVersion} does not meet the required version ${requiredPSVersion}.`, 
					'https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell');
            }

			if (compareVersions(requiredDotNetVersion, dotNetVersion)) {
                console.log(`.NET version ${dotNetVersion} meets the requirement.`);
            } else {
				showMissingPrerequisiteErrorMessage(
                	`.NET version ${dotNetVersion} does not meet the required version ${requiredDotNetVersion}.`,
					'https://dotnet.microsoft.com/en-us/download');
            }
        })
        .catch(error => {
            vscode.window.showErrorMessage(`Requirement check failed: ${error}`);
        });
}

function compareVersions(requiredVersion: string, actualVersion: string): boolean {
    return semver.gte(actualVersion, requiredVersion);
}

function extractSemver(input: string): string | null {
    const semverRegex = /\b\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?\b/;
    const match = input.match(semverRegex);
    return match ? match[0] : null;
}

function showMissingPrerequisiteErrorMessage(message: string, link: string) {
    vscode.window.showErrorMessage(message, 'Learn More').then(selection => {
        if (selection === 'Learn More') {
            vscode.env.openExternal(vscode.Uri.parse(link));
        }
    });
}

//// NEW POWERSHELL INTEGRATION ///
/*
export async function invokePowerShellCmd(command: string) : Promise<any> {
	// Don't process empty commands !!!
	if ((command === null) || (command == '')) {
		return new Promise((resolve) => {
			resolve(null);
		})

	}

	await checkAndLoadPowerShellModules().then((result) => {
		console.log(result);
	}).catch((error) => {
		vscode.window.showErrorMessage(error);
		rejects(error);
	});

	return await invokeCommand(command);
}

async function checkAndLoadPowerShellModules() : Promise<void> {
	if ((powershellSessionReady) && (powershellSession !== null)) {
		return new Promise<void>(() => {
			resolve();
		})
	}

	let powershellOptions : PowerShellOptions = {
		executable: PSExecutableType.PowerShellCore,
		throwOnInvocationError: true,
		executableOptions: {
			'-NoLogo': true,
			'-NoExit': true,
			"-NonInteractive": true
		}
	}
	powershellSession = new PowerShell(powershellOptions);

	await powershellSession.invoke(`$ErrorActionPreference = "Stop"`).then((result) => {
		console.log(result);
	}).catch((error) => {
		console.log(`Error: ${error}`);
		throw error;
	});

	const alTestRunnerModulePath = path.join(getExtension()!.extensionPath, 'PowerShell', 'ALTestRunner.psm1');
	await powershellSession.invoke(`Import-Module ${alTestRunnerModulePath};`).then((result) => {
		console.log(result);
	}).catch((error) => {
		console.log(`Error: ${error}`);
		throw error;
	});

	let npAlTestRunnerModulePath = path.join(getExtension()!.extensionPath, 'PowerShell', 'NPTestRunner', 'NPALTestRunner.psm1');
	await powershellSession.invoke(`Import-Module ${npAlTestRunnerModulePath}`).then((result) => {
		console.log(result);
	}).catch((error) => {
		console.log(`Error: ${error}`);
		throw error;
	});

	let activeDocumentRootFolderPath = getDocumentWorkspaceFolder();
	await powershellSession.invoke(`Set-Location ${activeDocumentRootFolderPath}`).then((result) => {
		console.log(result);
	}).catch((error) => {
		console.log(`Error: ${error}`);
		throw error;
	});

	powershellSessionReady = true;

	return new Promise<void>((resolve) => {
		resolve();
	})
}

async function invokeCommand(command : string) : Promise<InvocationResult> {
	console.log(command);
	return powershellSession.invoke(command).then((result) => {
		resolve(result);
	}).catch((error) => {
		throw new Error(error);
	});
}
*/