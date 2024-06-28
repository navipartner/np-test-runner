import * as vscode from 'vscode';
import * as types from './types';
import * as path from 'path';
import * as fetch from 'node-fetch'; 
import { invokePowerShellCmd, getDocumentWorkspaceFolder, getExtension } from './extension';
import { DOMParser } from 'xmldom';
import { InvocationResult } from 'node-powershell';
import * as fs from 'fs';
import { getALTestRunnerConfigKeyValue } from './config';
import { version } from 'os';

const cslibFolderName = 'CSLibs';

async function fetchVersions(sourceUrl: string, filter: string): Promise<string[]> {
    let requestUrl = `${sourceUrl}?comp=list&restype=container`;
	if (filter) {
		requestUrl = `${requestUrl}&prefix=${filter}`;
	}
	const response = await fetch(requestUrl);
    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "application/xml");
    const blobs = xmlDoc.getElementsByTagName("Blob");
    const versions: string[] = [];
    for (let i = 0; i < blobs.length; i++) {
        const name = blobs[i].getElementsByTagName("Name")[0].textContent || '';
        versions.push(name);
    }
    return versions;
}

async function findArtifactVersionInOneOfTheSources(version: string) : Promise<types.BcArtifactSource> {
	let sources : Array<types.BcArtifactSource> = new Array<types.BcArtifactSource>();
	sources.push(types.BcArtifactSource.OnPrem);
	sources.push(types.BcArtifactSource.Sandbox);
	sources.push(types.BcArtifactSource.Insider);

	let validSources : Array<types.BcArtifactSource> = new Array<types.BcArtifactSource>();
	await Promise.all(sources.map(async (source) => {
		const sourceUrl = getBcArtifactsUrl(source, types.BcArtifactSourceEndpoint.CDN)
		await fetchVersions(sourceUrl, version).then((result) => {
			if ((result) && (result.length > 0)) {
				validSources.push(source);
			}
		});
	}));

	return new Promise((resolve, reject) => {
		if (validSources.length > 0) {
			resolve(validSources[0]);
		} else {
			reject(`There is no valid BC artifact for version ${version}.`);
		}
	});
}

export async function selectBcVersionIfNotSelected() : Promise<boolean> {
	let selectedBcVersion = getALTestRunnerConfigKeyValue('selectedBcVersion');
	if (!((selectedBcVersion == null) || (selectedBcVersion == ''))) {
		return new Promise<boolean>((resolve) => {
			resolve(true);
		});
	}

	await downloadClientSessionLibraries();
	
	selectedBcVersion = getALTestRunnerConfigKeyValue('selectedBcVersion');
	return new Promise<boolean>((resolve) => {
		resolve(selectedBcVersion != '');
	})
}

export async function showSimpleQuickPick(items: string[], placeholderText?: string): Promise<string | undefined> {
    let quickPick = vscode.window.createQuickPick();
	quickPick.items = items.map(entry => ({ label: entry }));
    if (placeholderText) {
	    quickPick.placeholder = placeholderText;
    }

	return new Promise<string | undefined>((resolve) => {
		quickPick.onDidChangeSelection(selection => {
			if (selection[0]) {
				resolve(selection[0].label);
				quickPick.hide();
			}
		});

		quickPick.onDidHide(() => {
			resolve(undefined);
			quickPick.dispose();
		});
	
		quickPick.show();
	});
}

async function showArtifactVersionQuickPick(versions: string[]): Promise<string | undefined> {
	let quickPick = vscode.window.createQuickPick();
	if (versions) {
		quickPick.items = versions.map(version => ({ label: version }));
	}
	quickPick.placeholder = 'Type BC [major.minor] to filter versions...';

	return new Promise<string | undefined>((resolve) => {
		quickPick.onDidChangeSelection(selection => {
			if (selection[0]) {
				resolve(selection[0].label);
				quickPick.hide();
			}
		});

		quickPick.onDidChangeValue((value: string) => {
			if (value.length > 2) {
				let artifacts = null;
				if (versions) {
					artifacts = versions.filter(item => item.startsWith(value));
				}
				if ((!artifacts) || ((artifacts) && (artifacts.length <= 0))) {
					updateVersionPicker(quickPick, value).then((resolve) => {
						quickPick = resolve;
					});
				}
			}
		});
	
		quickPick.onDidHide(() => {
			resolve(undefined);
			quickPick.dispose();
		});
	
		quickPick.show();
	});
}

async function updateVersionPicker(versionPicker: vscode.QuickPick<vscode.QuickPickItem>, filter: string): Promise<vscode.QuickPick<vscode.QuickPickItem>> {
	var platformFilter = 'platform';
	let versions = await fetchVersions(`https://bcartifacts.blob.core.windows.net/onprem/`, filter);
	versionPicker.items = versions.map(version => ({ label: version }));
	versionPicker.items = versionPicker.items.filter(function (str) { return str.label.indexOf(platformFilter) !== -1; })

	return new Promise((resolve) => {
		resolve(versionPicker);
	});
}

export function getBcArtifactsUrl(artifactsSource: types.BcArtifactSource, artifactsSourceEndpoint: types.BcArtifactSourceEndpoint) : string {
	let unknownEndpoint = false;
    switch (artifactsSource) {
        case types.BcArtifactSource.OnPrem:
            switch (artifactsSourceEndpoint) {
                case types.BcArtifactSourceEndpoint.BLOB:
                    return 'https://bcartifacts.blob.core.windows.net/onprem/';
                case types.BcArtifactSourceEndpoint.CDN:
                    return 'https://bcartifacts-exdbf9fwegejdqak.b02.azurefd.net/onprem/';
				default:
					unknownEndpoint = true;
					break;
            }
            break;
        case types.BcArtifactSource.Sandbox:
            switch (artifactsSourceEndpoint) {
                case types.BcArtifactSourceEndpoint.BLOB:
                    return 'https://bcartifacts.blob.core.windows.net/sandbox/';
                case types.BcArtifactSourceEndpoint.CDN:
                    return 'https://bcartifacts-exdbf9fwegejdqak.b02.azurefd.net/sandbox/';
				default:
					unknownEndpoint = true;
					break;
            }
            break;
        case types.BcArtifactSource.Insider:
            switch (artifactsSourceEndpoint) {
                case types.BcArtifactSourceEndpoint.BLOB:
                    return 'https://bcinsider.blob.core.windows.net/sandbox/';
                case types.BcArtifactSourceEndpoint.CDN:
                    return 'https://bcinsider-fvh2ekdjecfjd6gk.b02.azurefd.net/sandbox/';
				default:
					unknownEndpoint = true;
					break;
            }
            break;
        default:
            throw new Error(`Not supported artifact source type: ${artifactsSource}`);
            break;
    }

	if (unknownEndpoint) {
		throw new Error(`Not supported artifact source endpoint type: ${artifactsSourceEndpoint}`);
	}

    return null;
}

/// This function doesn't do a proper check as we don't know how many libraries there might be.
/// Some BC versions have currently 3 (older versions) and some 4 (newer versions). In the future
/// the number of those might change or the names of the libraries could be different.
/// The function is considered as a fast automated check. The user still have a chance to 
/// (re)download the libraries manually if needed.
export async function checkAndDownloadMissingDlls(version: string) : Promise<any> {
	const extPath = getExtension().extensionPath
	const libFolderPath = path.join(extPath, '.npaltestrunner', cslibFolderName, version);

	let someContentExist = false;
	if (fs.existsSync(libFolderPath)) {
		let files = fs.readdirSync(libFolderPath);
		if (files.length > 0) {
			someContentExist = true;
		}
	}

	if (someContentExist) {
		return new Promise<any>((resolve) => {
			resolve(true);
		})
	}

	return await downloadClientSessionLibraries(version);
}

export async function downloadClientSessionLibraries(selectedVersion? : string) : Promise<InvocationResult> {
	const automaticallySelectedVersion = (!(selectedVersion == null || (selectedVersion.trim().length === 0)));

	let artifactSource : types.BcArtifactSource;
	if (!automaticallySelectedVersion) {
		artifactSource = types.BcArtifactSource[await showSimpleQuickPick(
			[types.BcArtifactSource.OnPrem, types.BcArtifactSource.Sandbox, types.BcArtifactSource.Insider], 
			'You have to select libraries used to connect to BC session. Exact match is probably not needed but still recommended.')];
		if (!artifactSource) {
			return;
		}
	} else {
		artifactSource = await findArtifactVersionInOneOfTheSources(selectedVersion);
	}

	const artifactSourceCdnUrl = getBcArtifactsUrl(types.BcArtifactSource[artifactSource], types.BcArtifactSourceEndpoint.CDN);
	
	if (!automaticallySelectedVersion) {
		selectedVersion = await showArtifactVersionQuickPick(null);
	}

	if (selectedVersion) {
		let activeDocumentRootFolderPath = getDocumentWorkspaceFolder();
		const versionOnly = selectedVersion.split('/')[0];	
		let command = `Set-Location '${activeDocumentRootFolderPath}'; Get-ClientSessionLibrariesFromBcArtifacts -BcArtifactSourceUrl ${artifactSourceCdnUrl} -Version ${versionOnly} `;

		const bcv = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Downloading client session libraries for BC ${versionOnly}`,
			cancellable: true
		}, async (progress, token) => {
			progress.report({ message: "Working" });
			
			const bcv = await invokePowerShellCmd(command).then((result) => {
				return result;
			}).catch((error) => {
				vscode.window.showErrorMessage(`Client session libraries haven't been downloaded. Additional details: ${error}`);
				throw error;
			});

			return bcv;
		});

		return new Promise<any>((resolve) => {
			resolve(bcv);
		});
	}
}