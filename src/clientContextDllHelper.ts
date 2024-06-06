import * as vscode from 'vscode';
import * as types from './types';
import { invokePowerShellCmd } from './extension';
import * as fetch from 'node-fetch'; 
import { DOMParser } from 'xmldom';
import { InvocationResult } from 'node-powershell';

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

export async function showArtifactVersionQuickPick(sourceUrl: string, text: string, versions: string[]): Promise<string | undefined> {
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
	let versions = await fetchVersions(`https://bcartifacts.blob.core.windows.net/onprem/`, filter);
	versionPicker.items = versions.map(version => ({ label: version }));

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

export async function downloadClientSessionLibraries() : Promise<InvocationResult> {
	const artifactSource = await showSimpleQuickPick([types.BcArtifactSource.OnPrem, types.BcArtifactSource.Sandbox, types.BcArtifactSource.Insider]);
	if (!artifactSource) {
		return;
	}

	const artifactSourceBlobUrl = getBcArtifactsUrl(types.BcArtifactSource[artifactSource], types.BcArtifactSourceEndpoint.BLOB);
	const artifactSourceCdnUrl = getBcArtifactsUrl(types.BcArtifactSource[artifactSource], types.BcArtifactSourceEndpoint.CDN);
	
	const selectedVersion = await showArtifactVersionQuickPick(artifactSourceBlobUrl, null, null);
	if (selectedVersion) {
		const versionOnly = selectedVersion.split('/')[0];	
		let command = `Get-ClientSessionLibrariesFromBcArtifacts -BcArtifactSourceUrl ${artifactSourceCdnUrl} -Version ${versionOnly} `;
		
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Downloading client session libraries for BC ${versionOnly} ...`,
			cancellable: true
		}, async (progress, token) => {
			progress.report({ message: "Working ..." });
				
			await invokePowerShellCmd(command).then((restult) => {
				return restult;
			}).catch((error) => {
				vscode.window.showErrorMessage(`Client session libraries haven't been downloaded. Additional details: ${error}`);
			});
	
			return new Promise<void>((resolve) => {
				resolve();
			});
		});
	}
}