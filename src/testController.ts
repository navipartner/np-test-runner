import * as vscode from 'vscode';
import { documentIsTestCodeunit, getALFilesInWorkspace, getALObjectFromPath, getALObjectOfDocument, getFilePathOfObject, getTestMethodRangesFromDocument } from './alFileHelper';
import { getCurrentWorkspaceConfig, launchConfigIsValid, selectLaunchConfig, setALTestRunnerConfig } from './config';
import { alTestController, attachDebugger, stopDebugger, getAppJsonKey, outputWriter, getLastResultPath, getSmbAlExtensionPath, 
    invokeTestRunnerViaHttp, getExtension, getDocumentWorkspaceFolder } from './extension';
import { ALMethod, ALFile, launchConfigValidity, CodeCoverageDisplay } from './types';
import * as path from 'path';
import { buildTestCoverageFromTestItem } from './testCoverage';
import { convertBCCoverageToJSON } from './coverage-converter';
import { getALFilesInCoverage, getFileCoverage, getStatementCoverage, readCodeCoverage, saveAllTestsCodeCoverage, saveTestRunCoverage, getTestRunnerCodeCoverateParams } from './coverage';
import { selectBcVersionIfNotSelected } from './clientContextDllHelper';
import * as readline from 'readline';
import * as fs from 'fs';
import * as testResTransform from './testResultTransformer';

export let numberOfTests: number;

export function createTestController(controllerId: string = 'alTestController'): vscode.TestController {
    const alTestController = vscode.tests.createTestController(controllerId, 'AL Tests');
    const profile = alTestController.createRunProfile('Run', vscode.TestRunProfileKind.Run, request => {
        runTestHandler(request);
    });

    profile.loadDetailedCoverage = async (testRun: vscode.TestRun, fileCoverage: vscode.FileCoverage, token: vscode.CancellationToken) => {
        return new Promise(async (resolve) => {
            let alFile: ALFile = {
                path: fileCoverage.uri.fsPath,
                object: getALObjectFromPath(fileCoverage.uri.fsPath),
                excludeFromCodeCoverage: false
            }

            resolve(getStatementCoverage(await readCodeCoverage(CodeCoverageDisplay.All, testRun), alFile));
        });
    };

    alTestController.createRunProfile('Debug', vscode.TestRunProfileKind.Debug, request => {
        debugTestHandler(request);
    });
    return alTestController;
}

export async function discoverTests() {
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Discovering the tests`,
        cancellable: true
    }, async (progress, token) => {        
        try {
            progress.report({ message: "Reading files ..." });
            numberOfTests = 0;
            const alFiles = await getALFilesInWorkspace();
            const thenables = alFiles.map(alFile => 
                vscode.workspace.openTextDocument(alFile.path).then(document => {
                    discoverTestsInDocument(document);
                })
            );

            progress.report({ message: "Processing files ..." });
            return await Promise.all(thenables);
        } catch (e) {
            throw e;
        }
    });
}

export async function discoverTestsInFileName(fileName: string) {
    const document = await vscode.workspace.openTextDocument(fileName);
    discoverTestsInDocument(document);
}

export async function discoverTestsInDocument(document: vscode.TextDocument, alFile?: ALFile) {
    // Check the scheme of the document's URI
    let filePathUri = document.uri;
    if (document.uri.scheme === 'git') {
        filePathUri = getFileUriFromGitUri(filePathUri);
        document = await vscode.workspace.openTextDocument(filePathUri);
    }

    if (documentIsTestCodeunit(document)) {
        if (!alFile) {
            const alFiles = await getALFilesInWorkspace('', `**/${path.basename(document.uri.fsPath)}`);
            if (alFiles) {
                alFile = alFiles.shift();
            }
        }
        
        let codeunitItem = await getTestItemFromFileNameAndSelection(document.uri.fsPath, 0);
        if (codeunitItem === undefined) {
            codeunitItem = alTestController.createTestItem(alFile!.object!.name!, alFile!.object!.name!, document.uri);
        }

        codeunitItem.children.forEach(test => {
            codeunitItem!.children.delete(test.id);
            numberOfTests -= 1;
        });

        getTestMethodRangesFromDocument(document).forEach(testRange => {
            const testItem = alTestController.createTestItem(testRange.name, testRange.name, document.uri);
            testItem.range = testRange.range;
            codeunitItem!.children.add(testItem);
            numberOfTests += 1;
        });
        alTestController.items.add(codeunitItem);
    }
}

function getFileUriFromGitUri(gitUri: vscode.Uri): vscode.Uri | null {
    let filePath = gitUri.path;
    filePath = gitUri.fsPath.substring(0, gitUri.fsPath.lastIndexOf('.git'));
    return vscode.Uri.file(filePath);
}

export async function runTestHandler(request: vscode.TestRunRequest) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const run = alTestController.createTestRun(request, timestamp);

    let results: testResTransform.XUnitAssembly[];
    if (request.include === undefined) {
        results = await runAllTests();
        saveAllTestsCodeCoverage();
    }
    else if (request.include.length > 1) {
        results = await runSelectedTests(request);
    }
    else {
        const testItem = request.include![0];
        let lineNumber: number = 0;
        let filename: string;
        if (testItem.parent) {
            lineNumber = testItem.range!.start.line;
            filename = testItem.parent!.uri!.fsPath;
        }
        else {
            filename = testItem.uri!.fsPath;
        }

        results = await runTest(filename, lineNumber);
        buildTestCoverageFromTestItem(testItem);
    }

    setResultsForTestItems(results, request, run);

    if (getCurrentWorkspaceConfig().enableCodeCoverage) {
        convertBCCoverageToJSON("C:/Users/JakubVanak/Documents/AL/01/.npaltestrunner/TestCoverageMap__50101-TestTableInsertWithErrrorOnInsert.dat",
            "C:/Users/JakubVanak/Documents/AL/01/",
            "C:/Users/JakubVanak/Documents/AL/01/.npaltestrunner/codecoverage.json"
        )
        await saveTestRunCoverage(run);
        const codeCoverage = await readCodeCoverage(CodeCoverageDisplay.All, run);
        getALFilesInCoverage(codeCoverage).forEach(alFile => {
            run.addCoverage(getFileCoverage(codeCoverage, alFile));
        });
    }

    run.end();

    if (results && results.length > 0) {
        outputTestResults(results);
    }
}

function setResultsForTestItems(results: testResTransform.XUnitAssembly[], request: vscode.TestRunRequest, run: vscode.TestRun) {
    if ((results == null) || (results.length == 0)) {
        return;
    }

    let testItems: vscode.TestItem[] = [];
    if (request.include) {
        request.include.forEach(testItem => {
            testItems.push(testItem);
        })
    }
    else {
        alTestController.items.forEach(testCodeunit => {
            testItems.push(testCodeunit);
        });
    }

    testItems!.forEach(testItem => {
        if (testItem.parent) {
            const result = getResultForTestItem(results, testItem, testItem.parent)
            setResultForTestItem(result, testItem, run);
        }
        else {
            testItem.children.forEach(test => {
                const result = getResultForTestItem(results, test, testItem);
                setResultForTestItem(result, test, run);
            });
        }
    });
}

export function readyToRunTests(): Promise<Boolean> {
    return new Promise(async (resolve) => {

        if (launchConfigIsValid() == launchConfigValidity.Invalid) {
            await selectLaunchConfig();
        }

        const bcVerSelected = await selectBcVersionIfNotSelected();

        if ((launchConfigIsValid() == launchConfigValidity.Valid) && (bcVerSelected)) {
            resolve(true);
        }
        else {
            resolve(false);
        }
    });
}

export async function runTest(filename?: string, selectionStart?: number, extensionId?: string, extensionName?: string): Promise<testResTransform.XUnitAssembly[]> {
    return new Promise(async (resolve) => {
        await readyToRunTests().then(async ready => {
            if (ready) {
                let resultsFilePath = getLastResultPath();
                let smbAlExtPath = getSmbAlExtensionPath();
                
                if (filename === undefined) {
                    filename = vscode.window.activeTextEditor!.document.fileName;
                }
                if (selectionStart === undefined) {
                    selectionStart = vscode.window.activeTextEditor!.selection.start.line;
                }
                if (extensionId === undefined) {
                    extensionId = getAppJsonKey('id');
                }
                if (extensionName === undefined) {
                    extensionName = getAppJsonKey('name');
                }
               
                const alProjectFolderPath = await getDocumentWorkspaceFolder();
                const { codeCoverageTrackingType, codeCoverageMapType, codeCoverageTrackAllSessions, codeCoverageExporterId, codeCoverageFilePrefix, codeCoverageOutputPath } = await getTestRunnerCodeCoverateParams();
                
                const testResult: testResTransform.TestRun[] = await invokeTestRunnerViaHttp(getExtension()!.extensionPath, alProjectFolderPath, smbAlExtPath, "Test", 
                    extensionId, extensionName, filename, selectionStart, null, 
                    codeCoverageTrackingType, codeCoverageTrackAllSessions, codeCoverageExporterId, codeCoverageFilePrefix, codeCoverageOutputPath, codeCoverageMapType);

                const results = await testResTransform.TestResultsTransformer.convertTestResultsToXUnitResults(testResult);
                resolve(results);
            }
            else {
                resolve([]);
            }
        })
    });
};

export async function runAllTests(extensionId?: string, extensionName?: string): Promise<testResTransform.XUnitAssembly[]> {
    return new Promise(async (resolve) => {
        await readyToRunTests().then(async ready => {
            if (ready) {
                let resultsFilePath = getLastResultPath();
                let smbAlExtPath = getSmbAlExtensionPath();

                if (extensionId === undefined) {
                    extensionId = getAppJsonKey('id');
                }

                if (extensionName === undefined) {
                    extensionName = getAppJsonKey('name');
                }

                const { codeCoverageTrackingType, codeCoverageMapType, codeCoverageTrackAllSessions, codeCoverageExporterId, codeCoverageFilePrefix, codeCoverageOutputPath } = await getTestRunnerCodeCoverateParams();
                
                const alProjectFolderPath = await getDocumentWorkspaceFolder();
                const testResult: testResTransform.TestRun[] = await invokeTestRunnerViaHttp(getExtension()!.extensionPath, alProjectFolderPath, smbAlExtPath, "All", extensionId, extensionName, "", 0,
                    null, codeCoverageTrackingType, codeCoverageTrackAllSessions, codeCoverageExporterId, codeCoverageFilePrefix, codeCoverageOutputPath, codeCoverageMapType);
                
                const results = await testResTransform.TestResultsTransformer.convertTestResultsToXUnitResults(testResult);
                resolve(results);
            }
            else {
                resolve([]);
            }
        });
    });
}

export async function runSelectedTests(request: vscode.TestRunRequest, extensionId?: string, extensionName?: string): Promise<testResTransform.XUnitAssembly[]> {
    return new Promise(async (resolve) => {
        await readyToRunTests().then(async ready => {
            if (ready) {
                let resultsFilePath = getLastResultPath();
                let smbAlExtPath = getSmbAlExtensionPath();
                
                if (extensionId === undefined) {
                    extensionId = getAppJsonKey('id');
                }

                if (extensionName === undefined) {
                    extensionName = getAppJsonKey('name');
                }

                const disabledTests = getDisabledTestsForRequest(request);
                const { codeCoverageTrackingType, codeCoverageMapType, codeCoverageTrackAllSessions, codeCoverageExporterId, codeCoverageFilePrefix, codeCoverageOutputPath } = await getTestRunnerCodeCoverateParams();
                
                const alProjectFolderPath = await getDocumentWorkspaceFolder();
                const testResult: testResTransform.TestRun[] = await invokeTestRunnerViaHttp(getExtension()!.extensionPath, alProjectFolderPath, smbAlExtPath, "All", extensionId, extensionName, "", 0, disabledTests,
                    codeCoverageTrackingType, codeCoverageTrackAllSessions, codeCoverageExporterId, codeCoverageFilePrefix, codeCoverageOutputPath, codeCoverageMapType);
                
                const results = await testResTransform.TestResultsTransformer.convertTestResultsToXUnitResults(testResult);
                resolve(results);
            }
            else {
                resolve([]);
            }
        });
    });
}

export async function debugTestHandler(request: vscode.TestRunRequest) {
    if (request.include) {
        const testItem = request.include[0];
        let filename: string;
        let lineNumber: number;

        if (testItem.parent) {
            filename = testItem.parent.uri!.fsPath;
            lineNumber = testItem.range!.start.line;
        }
        else {
            filename = testItem.uri!.fsPath;
            lineNumber = 0;
        }

        debugTest(filename, lineNumber);
    }
    else {
        debugTest('', 0);
    }
}

export async function debugTest(filename: string, selectionStart: number) {
    if (filename === undefined) {
        filename = vscode.window.activeTextEditor!.document.fileName;
    }
    if (selectionStart === undefined) {
        selectionStart = vscode.window.activeTextEditor!.selection.start.line;
    }

    await attachDebugger();    
    await runTest(filename, selectionStart);
    await stopDebugger();
}

function setResultForTestItem(result: testResTransform.XUnitTest, testItem: vscode.TestItem, run: vscode.TestRun) {
    if (result.$.result == 'Pass') {
        run.passed(testItem);
    }
    else {
        run.failed(testItem, new vscode.TestMessage(`${result.failure[0].message[0]}\n\n${result.failure[0]["stack-trace"][0]}`));
    }
}

function getResultForTestItem(results: testResTransform.XUnitAssembly[], testItem: vscode.TestItem, parent: vscode.TestItem): testResTransform.XUnitTest {
    const assemblyName = parent.label;
    let returnResult: testResTransform.XUnitTest = { $: { method: testItem.label, name: testItem.label, result: 'none', time: '0' }, failure: [{ message: '', 'stack-trace': '' }] };;
    results.forEach(assembly => {
        if (assembly.$.name.includes(assemblyName)) {
            assembly.collection.forEach(collection => {
                collection.test.forEach(result => {
                    if (result.$.method === testItem.label) {
                        returnResult = result;
                    }
                });
            });
        }
    });

    return returnResult;
}

export async function getTestItemFromFileNameAndSelection(filename?: string, selectionStart?: number): Promise<vscode.TestItem | undefined> {
    return new Promise(async (resolve, reject) => {
        try {
            if (filename === undefined) {
                filename = vscode.window.activeTextEditor!.document.fileName;
            }

            if (selectionStart === undefined) {
                selectionStart = vscode.window.activeTextEditor!.selection.start.line;
            }

            const document = await vscode.workspace.openTextDocument(filename);
            const object = getALObjectOfDocument(document);

            if (object) {
                const codeunitItem = alTestController.items.get(object!.name!);

                if (selectionStart === 0) {
                    resolve(codeunitItem);
                    return;
                }

                let testMethodRanges = getTestMethodRangesFromDocument(document);
                testMethodRanges = testMethodRanges.filter(range => {
                    if (range.range.start.line <= selectionStart!) {
                        return true;
                    }
                });

                if (testMethodRanges.length > 0) {
                    const testMethod = testMethodRanges.pop();
                    const testItem = codeunitItem!.children.get(testMethod!.name);
                    resolve(testItem);
                }
            }
            else {
                resolve(undefined);
            }
        } catch (ex) {
            reject(ex);
        }
    });
}

export async function deleteTestItemForFilename(filename: string) {
    const testItem = await getTestItemFromFileNameAndSelection(filename, 0);
    if (testItem) {
        alTestController.items.delete(testItem.id);
    }
}

export function getDisabledTestsForRequest(request: vscode.TestRunRequest, testContoller?: vscode.TestController): Map<string, string> {
    let disabledTests: Map<string, string> = new Map();
    let testCodeunitsToRun: vscode.TestItem[] = getTestCodeunitsIncludedInRequest(request);
    let controller;
    if (testContoller) {
        controller = testContoller;
    }
    else {
        controller = alTestController;
    }

    if (!controller) {
        return disabledTests;
    }

    if (!controller.items) {
        return disabledTests;
    }

    //tests which are in codeunits where some tests are included, but the tests themselves are not included
    testCodeunitsToRun.forEach(testCodeunit => {
        //unless the codeunit itself is included, then iterate over its children to test which ones need to be disabled
        if (request.include?.indexOf(testCodeunit) == -1) {
            testCodeunit.children.forEach(testItem => {
                if (request.include?.indexOf(testItem) == -1) {
                    disabledTests.set(testCodeunit.label, testItem.label);
                }
            });
        }
    });

    //test codeunits where none of their tests are included
    controller.items.forEach(testCodeunit => {
        if (testCodeunitsToRun.indexOf(testCodeunit) == -1) {
            disabledTests.set(testCodeunit.label, '*');
        }
    });

    return disabledTests;
}

export function getTestCodeunitsIncludedInRequest(request: vscode.TestRunRequest): vscode.TestItem[] {
    let testCodeunits: vscode.TestItem[] = [];

    if (request.include) {
        request.include.forEach(testItem => {
            if (testItem.children.size > 0) {
                testCodeunits.push(testItem);
            }

            if (testItem.parent) {
                if (testCodeunits.indexOf(testItem.parent) == -1) {
                    testCodeunits.push(testItem.parent);
                }
            }
        });
    }

    return testCodeunits;
}

export function getTestItemsIncludedInRequest(request: vscode.TestRunRequest): vscode.TestItem[] {
    let testItems: vscode.TestItem[] = [];

    if (request.include) {
        //iterate through the test items with children (i.e. the test codeunits) first
        //add all the children of each included codeunit
        request.include.filter(testItem => {
            return !testItem.parent;
        }).forEach(testCodeunit => {
            if (testCodeunit.children) {
                testCodeunit.children.forEach(testItem => {
                    testItems.push(testItem);
                });
            }
        });

        //then add any included children as long as they are not already in the collection
        request.include.filter(testItem => {
            return testItem.parent;
        }).forEach(testItem => {
            if (testItems.indexOf(testItem) == -1) {
                testItems.push(testItem);
            }
        });
    }

    return testItems;
}

export function getTestItemForMethod(method: ALMethod): vscode.TestItem | undefined {
    let testCodeunit = alTestController.items.get(method.objectName);
    if (testCodeunit) {
        return testCodeunit.children.get(method.methodName);
    }
}

async function outputTestResults(assemblies: testResTransform.XUnitAssembly[]): Promise<Boolean> {
	return new Promise(async (resolve) => {
		let noOfTests: number = 0;
		let noOfFailures: number = 0;
		let noOfSkips: number = 0;
		let totalTime: number = 0;

		if (assemblies.length > 0) {
			outputWriter.clear();
		}

		for (let assembly of assemblies) {
			noOfTests += parseInt(assembly.$.total);
			const assemblyTime = parseFloat(assembly.$.time);
			totalTime += assemblyTime;
			const failed = Number(assembly.$.failed) || 0;
			noOfFailures += failed;
			const skipped = Number(assembly.$.skipped) || 0;
			noOfSkips += skipped;

			if (failed > 0) {
				outputWriter.write('❌ ' + assembly.$.name + '\t' + assemblyTime.toFixed(2) + 's');
			}
			else {
				outputWriter.write('✅ ' + assembly.$.name + '\t' + assemblyTime.toFixed(2) + 's');
			}
			for (let test of assembly.collection[0].test) {
				const testTime = parseFloat(test.$.time);
				let filePath = '';
				const codeunitName = assembly.$.name;
                const codeunitNameNoPrefix = assembly.$.name.substring(assembly.$.name.indexOf(' ') + 1);
                const codeunitId = Number(assembly.$['x-code-unit']);

                filePath = await getFilePathOfObject({ type: 'codeunit', id: codeunitId, name: codeunitNameNoPrefix }, test.$.method)
                .then((result) => {
                    return result;
                })
                .catch(() => {
                    return getFilePathOfObject({ type: 'codeunit', id: codeunitId, name: codeunitName }, test.$.method)
                })
                .then((result) => {
                    return result;
                })
                .catch(() => {
                    return `[Not able to find file name and line number for Codeunit id '${codeunitId}', name '${codeunitName}/${codeunitNameNoPrefix}']`;
                })

				switch (test.$.result) {
					case 'Pass':
						outputWriter.write('\t✅ ' + test.$.method + '\t' + testTime.toFixed(2) + 's');
						break;
					case 'Skip':
						outputWriter.write('\t❓ ' + test.$.method + '\t' + testTime.toFixed(2) + 's ' + filePath);
						break;
					case 'Fail':
						outputWriter.write('\t❌ ' + test.$.method + '\t' + testTime.toFixed(2) + "s " + filePath);
						outputWriter.write('\t\t' + test.failure[0].message);
						break;
					default:
						break;
				}
			}
		}

        let statusBarItem = vscode.window.createStatusBarItem('npaltestrunner.summary', vscode.StatusBarAlignment.Right);
        let summaryText, backgroundColor: string;

		if ((noOfFailures + noOfSkips) === 0) {
            summaryText = `✅ ${noOfTests} test(s) ran in ${totalTime.toFixed(2)}s at ${assemblies[0].$!["run-time"]}`;
            backgroundColor = 'statusBarItem.prominentBackground';
		}
		else {
			summaryText = `❌ ${noOfTests} test(s) ran in ${totalTime.toFixed(2)}s - ${noOfFailures + noOfSkips} test(s) failed/skipped at ${assemblies[0].$!["run-time"]}`;
            backgroundColor = 'statusBarItem.errorBackground';
        }

        outputWriter.write(summaryText);
        statusBarItem.text = summaryText;
        statusBarItem.backgroundColor = new vscode.ThemeColor(backgroundColor);
        statusBarItem.command = 'workbench.view.testing.focus';
        statusBarItem.show();

        setTimeout(() => {
            statusBarItem.dispose();
        }, 10000);

		outputWriter.show();
		resolve(true);
	});
}

export async function getTestNameFromSelectionStart(path: string, selectionStart: number): Promise<string> {
    return new Promise((resolve, reject) => {
        if ((path == null) || (path == "") || (selectionStart == 0)) {
            resolve('');
            return;
        }

        const readStream = fs.createReadStream(path);
        const rl = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity
        });

        const lines: string[] = [];
        rl.on('line', (line) => {
            lines.push(line);
        });

        rl.on('close', () => {
            for (let i = selectionStart - 1; i >= 0; i--) {
                if (lines[i].toUpperCase().includes('[TEST]')) {
                    // search forwards for the procedure declaration (it might not be the following line)
                    for (let j = i; j < lines.length; j++) {
                        if (lines[j].includes('procedure')) {
                            let procDeclaration = lines[j];
                            procDeclaration = procDeclaration.substring(procDeclaration.indexOf('procedure') + 10);
                            procDeclaration = procDeclaration.substring(0, procDeclaration.indexOf('('));
                            resolve(procDeclaration.trim());
                            return;
                        }
                    }
                }
            }
            resolve('');
        });

        rl.on('error', (err) => {
            reject(err);
        });
    });
}