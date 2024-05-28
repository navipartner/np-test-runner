import * as vscode from 'vscode';
import { ALFile, ALObject, BcArtifactSource, BcArtifactSourceEndpoint, CodeCoverageDisplay, CodeCoverageLine, CodeCoverageObject } from './types';
import { activeEditor, passingTestDecorationType, outputWriter } from './extension';
import * as fetch from 'node-fetch'; 
import { DOMParser } from 'xmldom';
import { Console } from 'console';


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

export function getBcArtifactsUrl(artifactsSource: BcArtifactSource, artifactsSourceEndpoint: BcArtifactSourceEndpoint) : string {
    switch (artifactsSource) {
        case BcArtifactSource.OnPrem:
            switch (artifactsSourceEndpoint) {
                case BcArtifactSourceEndpoint.BLOB:
                    return 'https://bcartifacts.blob.core.windows.net/onprem/';
                case BcArtifactSourceEndpoint.CDN:
                    return 'https://bcartifacts-exdbf9fwegejdqak.b02.azurefd.net/onprem/';
            }
            break;
        case BcArtifactSource.Sandbox:
            switch (artifactsSourceEndpoint) {
                case BcArtifactSourceEndpoint.BLOB:
                    return 'https://bcartifacts.blob.core.windows.net/sandbox/';
                case BcArtifactSourceEndpoint.CDN:
                    return 'https://bcartifacts-exdbf9fwegejdqak.b02.azurefd.net/sandbox/';
            }
            break;
        case BcArtifactSource.Insider:
            switch (artifactsSourceEndpoint) {
                case BcArtifactSourceEndpoint.BLOB:
                    return 'https://bcinsider.blob.core.windows.net/sandbox/';
                case BcArtifactSourceEndpoint.CDN:
                    return 'https://bcinsider-fvh2ekdjecfjd6gk.b02.azurefd.net/sandbox/';
            }
            break;
        default:
            throw new Error(`Not supported artifact source type: ${artifactsSource}`);
            break;
    }

    return null;
}
