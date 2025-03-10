import * as vscode from 'vscode';
import { documentIsTestCodeunit, getTestMethodRangesFromDocument } from './alFileHelper';

export class CodelensProvider implements vscode.CodeLensProvider {
    private codeLenses: vscode.CodeLens[] = [];

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        this.codeLenses = [];

        if (!(documentIsTestCodeunit(document))) {
            return this.codeLenses;
        }

        const config = vscode.workspace.getConfiguration('np-al-test-runner');
        if (config.enableCodeLens) {
            const testMethodRanges = getTestMethodRangesFromDocument(document);
            testMethodRanges.forEach(testMethodRange => {
                this.codeLenses.push(new vscode.CodeLens(testMethodRange.range, { title: "Run Test", command: "npaltestrunner.runTest", arguments: [document.fileName, testMethodRange.range.start.line], tooltip: "Run this test with NP AL Test Runner" }));
                this.codeLenses.push(new vscode.CodeLens(testMethodRange.range, { title: "Debug Test", command: "npaltestrunner.debugTest", arguments: [document.fileName, testMethodRange.range.start.line], tooltip: "Debug this test with NP AL Test Runner" }));
                this.codeLenses.push(new vscode.CodeLens(testMethodRange.range, { title: "Run Test Workflow", command: "npaltestrunner.runSelectedWorkflow", arguments: [document.fileName, testMethodRange.range.start.line], tooltip: "Start NP AL Test Runner Workflow" }));
            });

            if (this.codeLenses.push.length > 0) {
                this.codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { title: "Run Tests", command: "npaltestrunner.runTestsCodeunit", arguments: [document.fileName], tooltip: "Run all tests in this codeunit with AL Test Runner" }));
                //this.codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { title: "Debug Tests", command: "npaltestrunner.debugTestsCodeunit", arguments: [document.fileName], tooltip: "Run all tests in this codeunit with AL Test Runner" }));
                this.codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { title: "Run Test Workflow", command: "npaltestrunner.runSelectedWorkflow", arguments: [document.fileName], tooltip: "Start NP AL Test Runner Workflow" }));
            }
        }

        return this.codeLenses;
    }
}