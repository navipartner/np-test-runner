import * as vscode from 'vscode';

export type ALTestRunnerConfig = {
	launchConfigName: string;
	attachConfigName: string;
	companyName: string;
	testSuiteName: string;
	codeCoveragePath: string;
	culture: string;
};

export type ALTestAssembly = {
	$: {
		time: string;
		skipped: string;
		failed: string;
		passed: string;
		total: string;
		'run-time': string;
		'run-date': string;
		'test-framework': string;
		name: string;
	};
	collection: ALTestCollection[];
};

export type ALTestCollection = {
	$: {
		time: string;
		skipped: string;
		failed: string;
		passed: string;
		total: string;
		name: string;
	};
	test: ALTestResult[];
};

export type ALTestResult = {
	$: {
		method: string;
		name: string;
		result: string;
		time: string;
	};
	failure: [{
		message: string;
		'stack-trace': string
	}]
};

export type ALMethodRange = {
	name: string;
	range: vscode.Range;
};

export type ALObject = {
	type: string;
	id: number;
	name?: string;
};

export type CodeCoverageLine = {
	"ObjectType": string;
	"ObjectID": string;
	"LineType": string;
	"LineNo": string;
	"NoOfHits": string;
}

export type ALFile = {
	object: ALObject;
	path: string;
	excludeFromCodeCoverage: boolean;
}

export type CodeCoverageObject = {
	file: ALFile;
	coverage?: number;
	noOfHitLines: number;
	noOfLines: number;
}

export enum PublishType {
	None,
	Publish,
	Rapid
}

export type PublishResult = {
	success: boolean;
	message: string;
}

export enum RunType {
	All,
	Codeunit,
	Test,
	Selection
}

export type ALMethod = {
	objectName: string;
	methodName: string;
	object?: ALObject;
	path?: string;
}

export type TestCoverage = {
	method: ALMethod;
	testMethod: ALMethod;
}

export enum CodeCoverageDisplay {
	Off = 'Off',
	Previous = 'Previous',
	All = 'All'
}

export enum OutputType {
	Editor = 'Editor',
	Channel = 'Output'
}

export enum launchConfigValidity {
	Valid,
	Invalid,
	NeverValid
}

export enum BcArtifactSource {
	OnPrem = 'OnPrem',
	Sandbox = 'Sandbox',
	Insider = 'Insider'
}

export enum BcArtifactSourceEndpoint {
	CDN = 'CDN',
	BLOB = 'BLOB'
}