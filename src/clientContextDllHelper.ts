import * as vscode from 'vscode';
import * as types from './types';
import * as path from 'path';
import * as fetch from 'node-fetch'; 
import { isWindowsPlatform, getExtension, testRunnerClient } from './extension';
import { DOMParser } from '@xmldom/xmldom';
import * as fs from 'fs';
import { getALTestRunnerConfigKeyValue, setALTestRunnerConfig } from './config';
import * as webApiClient from './webapiclient';

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
		quickPick.items = versions.map(version => ({ 
			label: version
		}));
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
	versions = versions.filter(function (str) { return str.indexOf(platformFilter) !== -1; });
	versionPicker.items = versions.map(version => ({ label: version.split('/')[0] }));

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

export function getLibrariesFolder(version: string): string {
	const extPath = getExtension().extensionPath
	const libFolderPath = path.join(extPath, '.npaltestrunner', cslibFolderName, version);
	return libFolderPath;
}

/// This function doesn't do a proper check as we don't know how many libraries there might be.
/// Some BC versions have currently 3 (older versions) and some 4 (newer versions). In the future
/// the number of those might change or the names of the libraries could be different.
/// The function is considered as a fast automated check. The user still have a chance to 
/// (re)download the libraries manually if needed.
export async function checkAndDownloadMissingDlls(version: string) {	
	const libFolderPath = getLibrariesFolder(version);

	let someContentExist = false;
	if (fs.existsSync(libFolderPath)) {
		let files = fs.readdirSync(libFolderPath);
		if (files.length > 0) {
			someContentExist = true;
		}
	}

	if (someContentExist) {
		return new Promise<void>((resolve) => {
			resolve();
		})
	}

	await downloadClientSessionLibraries(version);
}

export async function downloadClientSessionLibraries(selectedVersion? : string) {
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
		//let activeDocumentRootFolderPath = await getDocumentWorkspaceFolder();		

		const destinationPath = getLibrariesFolder(selectedVersion);
		const downloadParams: webApiClient.DownloadFilesFromRemoteZipParams = {
			url: `${artifactSourceCdnUrl}${selectedVersion}/platform`,
			destinationPath: destinationPath,
			extractionFilter: "(?i)Applications\\\\testframework\\\\TestRunner\\\\Internal\\\\.*\\.dll$"
		};
		
		await testRunnerClient.downloadFilesFromRemoteZipParams(downloadParams, `Downloading Client Session libraries`);
		if (!isWindowsPlatform()) {
			restoreDownloadedFileNames(destinationPath);
		}

		setALTestRunnerConfig('selectedBcVersion', selectedVersion);
	}
}

function restoreDownloadedFileNames(folderPath: string): void {
    try {
        const files = fs.readdirSync(folderPath);
        
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stats = fs.statSync(filePath);
            
            if (stats.isFile()) {
                const lastBackslashIndex = file.lastIndexOf('\\');
                if (lastBackslashIndex >= 0) {
                    const newName = file.slice(lastBackslashIndex + 1);
                    const newPath = path.join(folderPath, newName);
                    
                    // Copy the file with the new name
                    fs.copyFileSync(filePath, newPath);
                    
                    // Delete the original file
                    fs.unlinkSync(filePath);
                    
                    console.log(`Renamed: ${file} -> ${newName}`);
                }
            }
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
}