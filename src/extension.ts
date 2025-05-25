import * as vscode from 'vscode';
import * as fs from 'fs';
import * as xml2js from 'xml2js';
import * as types from './types';
import { CodelensProvider } from './codelensProvider';
import { updateCodeCoverageDecoration, createCodeCoverageStatusBarItem } from './coverage';
import { documentIsTestCodeunit, getALFilesInWorkspace, getDocumentIdAndName, getTestFolderPath, getTestMethodRangesFromDocument, getALObjectOfDocument } from './alFileHelper';
import { getALTestRunnerConfig, getALTestRunnerPath, getCurrentWorkspaceConfig, getLaunchJsonPath, getALTestRunnerConfigKeyValue, 
	selectAttachConfig, getConfigurationsFromLaunchJsonByName } from './config';
import { getOutputWriter, OutputWriter } from './output';
import { createTestController, deleteTestItemForFilename, discoverTestsInDocument, discoverTestsInFileName, getTestNameFromSelectionStart } from './testController';
import { onChangeAppFile } from './publish';
import { join } from 'path';
import TelemetryReporter from '@vscode/extension-telemetry';
import { TestCoverageCodeLensProvider } from './testCoverageCodeLensProvider';
import { CodeCoverageCodeLensProvider } from './codeCoverageCodeLensProvider';
import { registerCommands } from './commands';
import { createHEADFileWatcherForTestWorkspaceFolder } from './git';
import { createPerformanceStatusBarItem } from './performance';
import { checkAndDownloadMissingDlls } from './clientContextDllHelper';
import { TestRunnerWorkflow } from './testRunnerWorkflow'
import * as path from 'path';
import * as cp from 'child_process';
import * as semver from 'semver';
import { error } from 'console';
import { Mutex } from 'async-mutex';
import * as webApiSrv from './webapiserver';
import * as webApiClient from './webapiclient';
import * as testResTransform from './testResultTransformer';

let terminal: vscode.Terminal;
let debugChannel: vscode.OutputChannel;
let debugChannelActivated: boolean = false;
var powershellSession = null;
var powershellSessionReady = false;
var testRunnerWorkflow = new TestRunnerWorkflow();
let testRunnerSrv: webApiSrv.TestRunnerWebApiServer = null;
export let testRunnerClient: webApiClient.TestRunnerWebApiClient = null;
const runTestCallMutex = new Mutex();
export let activeEditor = vscode.window.activeTextEditor;
export let alFiles: types.ALFile[] = [];
const config = vscode.workspace.getConfiguration('np-al-test-runner');
const passingTestColor = 'rgba(' + config.passingTestsColor.red + ',' + config.passingTestsColor.green + ',' + config.passingTestsColor.blue + ',' + config.passingTestsColor.alpha + ')';
const failingTestColor = 'rgba(' + config.failingTestsColor.red + ',' + config.failingTestsColor.green + ',' + config.failingTestsColor.blue + ',' + config.failingTestsColor.alpha + ')';
const untestedTestColor = 'rgba(' + config.untestedTestsColor.red + ',' + config.untestedTestsColor.green + ',' + config.untestedTestsColor.blue + ',' + config.untestedTestsColor.alpha + ')';
export const outputWriter: OutputWriter = getOutputWriter(vscode.workspace.getConfiguration('np-al-test-runner').testOutputLocation);
export const channelWriter: OutputWriter = getOutputWriter(types.OutputType.Channel);
let testRunnerProjectRootPath = null;

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

	registerCommands(context, testRunnerWorkflow);

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

	context.subscriptions.push(telemetryReporter);

	alTestController = createTestController();
	context.subscriptions.push(alTestController);

	enableCheckTestsInActiveDocuments();

	startTestRunnerWebApiServerClient(context);
}

async function enableCheckTestsInActiveDocuments() {
	let analysisPromises = null;
	vscode.window.onDidChangeVisibleTextEditors(async (editors) => {
		analysisPromises = editors.map(editor => discoverTestsInDocument(editor.document));
	});

	const initialAnalysisPromises = vscode.window.visibleTextEditors.map(editor => discoverTestsInDocument(editor.document));

	await Promise.all([analysisPromises, initialAnalysisPromises]);
}

export async function invokeTestRunnerViaHttp(alTestRunnerExtPath: string, alProjectPath: string, smbAlExtPath: string, tests: string, extensionId: string,
	extensionName: string, fileName: string, selectionStart: number, disabledTests?: Map<string, string>): Promise<testResTransform.TestRun[]> {

	const config = getCurrentWorkspaceConfig();
	getALFilesInWorkspace(config.codeCoverageExcludeFiles).then(files => { alFiles = files });
	let publishType: types.PublishType = types.PublishType.None;

	await checkMissingButConfiguredClientSessionLibsAndDownload();

	let objectId = ""
	if ((fileName != null) && (fileName != '')) {
		const alDoc = await vscode.workspace.openTextDocument(fileName);
		const alObj = getALObjectOfDocument(alDoc);
		objectId = alObj.id.toString();
	}

	const procName = await getTestNameFromSelectionStart(fileName, selectionStart);

	const testParams: webApiClient.TestRunnerInvokeParams = {
		alTestRunnerExtPath: alTestRunnerExtPath,
		alProjectPath: alProjectPath,
		smbAlExtPath: smbAlExtPath,
		tests: tests,
		extensionId: extensionId,
		extensionName: extensionName,
		testCodeunitsRange: objectId,
		testProcedureRange: procName,
		disabledTests: disabledTests
	};

	const release = await runTestCallMutex.acquire();

	try {
		const response = await testRunnerClient.invokeAlTests(testParams, `Running AL tests`);
		triggerUpdateDecorations();
		return response.data;
	} catch (error) {
		vscode.window.showErrorMessage(`Error invoking tests: ${error}`);
	} finally {
		release();
	}
}

export async function attachDebugger() {
	if (vscode.debug.activeDebugSession) {
		return;
	}

	let alTestRunnerConfig = getALTestRunnerConfig();
	
	if ((alTestRunnerConfig.attachConfigName === undefined) || (alTestRunnerConfig.attachConfigName.trim() === '')) {
		await selectAttachConfig()
		alTestRunnerConfig = getALTestRunnerConfig();
	}

	if ((alTestRunnerConfig.attachConfigName === undefined) || (alTestRunnerConfig.attachConfigName.trim() === '')) {
		throw 'No attach configuration selected, without this the debugger cannot be started.';
	}
	
	const attachConfig = await getConfigurationsFromLaunchJsonByName(alTestRunnerConfig.attachConfigName);

	//const attachConfig = attachConfigs.shift() as vscode.DebugConfiguration;
	await vscode.debug.startDebugging(vscode.workspace.workspaceFolders![0], attachConfig);
}

export async function stopDebugger() {
	await vscode.debug.stopDebugging();
}

export async function getDocumentWorkspaceFolder(): Promise<string | undefined> {
	if (testRunnerProjectRootPath !== null) {
		return testRunnerProjectRootPath;
	}

	let rootPath: string | undefined;

	const workspaceFolders = vscode.workspace.workspaceFolders;
	const activeEditor = vscode.window.activeTextEditor;
	let activeFolder: vscode.WorkspaceFolder | undefined;

	if (activeEditor) {
		const activeDocumentUri = activeEditor.document.uri;
		activeFolder = vscode.workspace.getWorkspaceFolder(activeDocumentUri);
		if (activeFolder) {
			rootPath = activeFolder.uri.fsPath;
		}
	}

	if (!rootPath) {
		// Fall back to the first workspace folder if no active editor or workspace folder found
		if ((workspaceFolders) && (workspaceFolders.length == 1)) {
			rootPath = workspaceFolders[0].uri.fsPath;
		}
	}

	if (!rootPath) {
		const folderOptions = workspaceFolders.map(folder => ({
			label: folder.name,
			description: folder.uri.fsPath,
			folder: folder
		}));

		await vscode.window.showQuickPick(folderOptions, {
			placeHolder: 'Select the workspace folder to configure test runner for.',
			canPickMany: false
		}).then((selected) => {
			rootPath = selected.folder.uri.fsPath;
		});
	}

	if (rootPath) {
		testRunnerProjectRootPath = rootPath;
		return testRunnerProjectRootPath;
	} else {
		error("No project was selected!");
	}
}

export function getSmbAlExtension(): vscode.Extension<any> {
	let ext = vscode.extensions.getExtension('ms-dynamics-smb.al');
	if (!ext) {
		throw new Error(`Microsoft AL development extension is missing. Install this extension first.`);
	}
	return ext;
}

export function getSmbAlExtensionPath(): string {
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
	if (!(fs.existsSync(resultFileName))) {
		setDecorations(passingTests, failingTests, getUntestedTestDecorations(testMethodRanges));
		return;
	}

	const xmlParser = new xml2js.Parser();

	let resultXml = fs.readFileSync(resultFileName, { encoding: 'utf-8' });
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
	let terminals = vscode.window.terminals.filter(element => element.name === terminalName);
	let terminal;
	if (terminals) {
		terminal = terminals.shift()!;
	}

	if (!terminal) {
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

export function writeToOutputChannel(value: string, isError?: boolean) {
	if (!debugChannel) {
		debugChannel = vscode.window.createOutputChannel(getOutputChannel());
	}

	debugChannel.appendLine(value);

	if (isError) {
		console.error(value);
	}
}

export function getOutputChannel() {
	return 'np-al-test-runner-output';
}


export function getRangeOfFailingLineFromCallstack(callstack: string, method: string, document: vscode.TextDocument): vscode.Range {
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
	const data = fs.readFileSync(launchPath, { encoding: 'utf-8' });
	return JSON.parse(data);
}

export function getAppJsonKey(keyName: string) {
	const appJsonPath = path.join(getTestFolderPath(), 'app.json');
	const data = fs.readFileSync(appJsonPath, { encoding: 'utf-8' });
	const appJson = JSON.parse(data.charCodeAt(0) === 0xfeff
		? data.slice(1) // Remove BOM
		: data);

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

	if (testRunnerSrv) {
		testRunnerSrv.stopServer();
	}
}

export async function invokeCommandFromAlDevExtension(command: string, params?: any[]): Promise<unknown> {
	var extension = getSmbAlExtension();

	// is the ext loaded and ready?
	if (extension.isActive == false) {
		await extension.activate();
	}

	return vscode.commands.executeCommand(command, params);
}

export async function checkMissingButConfiguredClientSessionLibsAndDownload() {
	const selectedBcVersion = getALTestRunnerConfigKeyValue('selectedBcVersion');
	if (selectedBcVersion == null || (selectedBcVersion.trim().length === 0)) {
		return new Promise<any>((resolve) => {
			// No version configured yet.
			resolve(false);
		});
	}

	await checkAndDownloadMissingDlls(selectedBcVersion);
}

async function checkDotNetVersion(): Promise<string> {
	return new Promise((resolve, reject) => {
		cp.exec('dotnet --version', (error, stdout, stderr) => {
			if (error) {
				reject(`Error checking .NET version: ${error.message}`);
			} else {
				resolve(extractSemver(stdout.trim()));
			}
		});
	});
}

function checkAllExternalPrerequisites() {

	const requiredDotNetVersion = '8.0.0';

	Promise.all([checkDotNetVersion()])
		.then(([dotNetVersion]) => {
			if (compareVersions(requiredDotNetVersion, dotNetVersion)) {
				console.log(`.NET version ${dotNetVersion} meets the requirement.`);
			} else {
				showMissingPrerequisiteErrorMessage(
					`.NET version ${dotNetVersion} does not meet the required version ${requiredDotNetVersion}.`,
					'https://dotnet.microsoft.com/en-us/download');
			}
		})
		.catch(error => {
			vscode.window.showErrorMessage(`Requirement check for .NET ${requiredDotNetVersion} and higher failed: ${error}`);
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

async function startTestRunnerWebApiServerClient(context: vscode.ExtensionContext) {
    if (testRunnerSrv && testRunnerSrv.IsRunning) {
        writeToOutputChannel('Test Runner WebAPI Server is already running and appears healthy.', false);
        if (testRunnerClient && testRunnerClient.Port === testRunnerSrv.port) {
            writeToOutputChannel('Test Runner WebAPI Client is also already configured for the running server.', false);
            return;
        }
        writeToOutputChannel('Server is running, but client needs initialization or reconfiguration.', false);
    }

    if (!testRunnerSrv || !testRunnerSrv.IsRunning) {
        writeToOutputChannel('Initializing a new Test Runner WebAPI Server instance.', false);
        testRunnerSrv = new webApiSrv.TestRunnerWebApiServer();
    }

    let serverStartedSuccessfully = false;
    if (!testRunnerSrv.IsRunning) {
        writeToOutputChannel('Attempting to start Test Runner WebAPI Server...', false);
        serverStartedSuccessfully = await testRunnerSrv.startServer(context);
    } else {
        serverStartedSuccessfully = true;
        writeToOutputChannel('Test Runner WebAPI Server was already started.', false);
    }

    if (!serverStartedSuccessfully || !testRunnerSrv.IsRunning || testRunnerSrv.port === 0) {
        const errorMessage = 'Failed to start or confirm the Test Runner WebAPI Server is running. Please check the output channel "np-al-test-runner-output" for details.';
        
		writeToOutputChannel(errorMessage, true);
        vscode.window.showErrorMessage(errorMessage);
        testRunnerClient = null;

        if (testRunnerSrv) 
			await testRunnerSrv.stopServer();

		// Server not started!!!
        return;
    }

    writeToOutputChannel(`Test Runner WebAPI Server is active on port ${testRunnerSrv.port}. Initializing client...`, false);
    try {
        // Initialize or re-initialize the client
        if (!testRunnerClient || testRunnerClient.Port !== testRunnerSrv.port) {
            testRunnerClient = new webApiClient.TestRunnerWebApiClient();
            await testRunnerClient.Connect(testRunnerSrv.port);
            writeToOutputChannel('Test Runner WebAPI Client connected successfully.', false);
        } else {
            writeToOutputChannel('Test Runner WebAPI Client was already connected to the correct port.', false);
        }

        // Optional: Perform a PING/Health check via client to confirm end-to-end communication
        // Example:
        // const isHealthy = await testRunnerClient.pingServer(); // Assuming a pingServer() method
        // if (!isHealthy) {
        //     throw new Error("Client connected, but server reported an unhealthy state or did not respond to ping.");
        // }
        // writeToOutputChannel('Server responded to client ping successfully.', false);

    } catch (error: any) {
        const clientErrorMessage = `Failed to connect the Test Runner WebAPI Client to server on port ${testRunnerSrv.port}: ${error.message || String(error)}`;
        writeToOutputChannel(clientErrorMessage, true);
        vscode.window.showErrorMessage(clientErrorMessage);
        testRunnerClient = null; // Ensure client is null on connection failure
        // Optionally, consider stopping the server as client connection failed
        // await testRunnerSrv.stopServer();
    }
}

export function isWindowsPlatform(): boolean {
	return (process.platform === 'win32');
}