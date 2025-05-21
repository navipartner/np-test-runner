import * as vscode from 'vscode';
import * as types from './types';
import * as path from 'path';
import * as fetch from 'node-fetch';
import { isWindowsPlatform, getExtension, testRunnerClient, writeToOutputChannel } from './extension';
import * as fs from 'fs';
import { getALTestRunnerConfigKeyValue, setALTestRunnerConfig } from './config';
import * as webApiClient from './webapiclient';
import * as ext from './extension';

const cslibFolderName = 'CSLibs';

async function fetchVersions(sourceBaseUrl: string, filter?: string): Promise<string[]> {
    let requestUrl = `${sourceBaseUrl}indexes/platform.json`;
    try {
        const response = await fetch(requestUrl);
        if (!response.ok) {
			ext.writeToOutputChannel(`Failed to fetch versions from ${requestUrl}: ${response.statusText}`, true);
            return [];
        }
        const jsonData: Array<{ Version: string, [key: string]: any }> = await response.json();
        if (!Array.isArray(jsonData)) {
            ext.writeToOutputChannel(`Invalid JSON structure from ${requestUrl}: Expected an array.`, true);
            return [];
        }
        let versions: string[] = jsonData.map(item => item.Version);
        if (filter) {
            versions = versions.filter(v => v.startsWith(filter));
        }
        return versions;
    } catch (error) {
        ext.writeToOutputChannel(`Error fetching or parsing versions from ${requestUrl}: ${error}`, true);
        return [];
    }
}

async function findArtifactVersionInOneOfTheSources(versionWithOptionalCountry: string): Promise<types.BcArtifactSource> {
    let sources: Array<types.BcArtifactSource> = [
        types.BcArtifactSource.OnPrem,
        types.BcArtifactSource.Sandbox,
        types.BcArtifactSource.Insider
    ];

    const baseVersion = versionWithOptionalCountry.split('/')[0];

    let validSources: Array<types.BcArtifactSource> = [];
    await Promise.all(sources.map(async (source) => {
        const sourceUrl = getBcArtifactsUrl(source, types.BcArtifactSourceEndpoint.CDN);
        const result = await fetchVersions(sourceUrl, baseVersion);
        if (result && result.length > 0) {
            validSources.push(source);
        }
    }));

    return new Promise((resolve, reject) => {
        if (validSources.length > 0) {
            resolve(validSources[0]);
        } else {
            reject(`No Business Central artifacts found for version ${versionWithOptionalCountry} (checked for base version ${baseVersion} in available sources).`);
        }
    });
}

export async function selectBcVersionIfNotSelected(): Promise<boolean> {
    let selectedBcVersion = getALTestRunnerConfigKeyValue('selectedBcVersion');
    if (selectedBcVersion && selectedBcVersion.trim() !== '') {
        return true;
    }

    await downloadClientSessionLibraries();

    selectedBcVersion = getALTestRunnerConfigKeyValue('selectedBcVersion');
    return !!(selectedBcVersion && selectedBcVersion.trim() !== '');
}

export async function showSimpleQuickPick(items: string[], placeholderText?: string): Promise<string | undefined> {
    const quickPick = vscode.window.createQuickPick();
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

async function showArtifactVersionQuickPick(initialVersions: string[] | null): Promise<string | undefined> {
    const quickPick = vscode.window.createQuickPick();
    if (initialVersions) {
        quickPick.items = initialVersions.map(version => ({ label: version }));
    }
    quickPick.placeholder = 'Type BC [major.minor] to filter versions...';

    return new Promise<string | undefined>((resolve) => {
        quickPick.onDidChangeSelection(selection => {
            if (selection[0]) {
                resolve(selection[0].label);
                quickPick.hide();
            }
        });

        quickPick.onDidChangeValue(async (value: string) => {
            if (value.length > 2) {
                let locallyFilteredItems: vscode.QuickPickItem[] = [];
                if (initialVersions) {
                    locallyFilteredItems = initialVersions
                        .filter(item => item.startsWith(value))
                        .map(version => ({ label: version }));
                }

                if (locallyFilteredItems.length > 0) {
                    quickPick.items = locallyFilteredItems;
                } else {
                    await updateVersionPicker(quickPick, value);
                }
            } else if (value.length === 0) {
                if (initialVersions) {
                    quickPick.items = initialVersions.map(version => ({ label: version }));
                } else {
                    quickPick.items = [];
                }
            } else {
                 if (initialVersions && value.length === 0) {
                     quickPick.items = initialVersions.map(version => ({ label: version }));
                 } else if (!initialVersions || value.length > 0) {
                     quickPick.items = [];
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

async function updateVersionPicker(versionPicker: vscode.QuickPick<vscode.QuickPickItem>, filter: string): Promise<void> {
    let fetchedVersions = await fetchVersions(`https://bcartifacts.blob.core.windows.net/onprem/`, filter);
    versionPicker.items = fetchedVersions.map(version => ({ label: version }));
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
    }

	if (unknownEndpoint) {
		throw new Error(`Not supported artifact source endpoint type: ${artifactsSourceEndpoint}`);
	}
    return '';
}

export function getLibrariesFolder(version: string): string {
	const extPath = getExtension().extensionPath;
	const libFolderPath = path.join(extPath, '.npaltestrunner', cslibFolderName, version);
	return libFolderPath;
}

export async function checkAndDownloadMissingDlls(version: string) {	
	const libFolderPath = getLibrariesFolder(version);
	if (fs.existsSync(libFolderPath) && fs.readdirSync(libFolderPath).length > 0) {
		return;
	}
	await downloadClientSessionLibraries(version);
}

export async function downloadClientSessionLibraries(initialVersionString?: string) {
    const isVersionInitiallyProvided = !!(initialVersionString && initialVersionString.trim().length > 0);
    let versionForDownloadAndConfig: string | undefined = initialVersionString;

    let artifactSource: types.BcArtifactSource;

    if (!isVersionInitiallyProvided) {
        const sourceChoiceStr = await showSimpleQuickPick(
            [types.BcArtifactSource.OnPrem, types.BcArtifactSource.Sandbox, types.BcArtifactSource.Insider].map(s => String(s)),
            'Select the source for Business Central artifacts:'
        );

        if (!sourceChoiceStr) { return; }
        artifactSource = types.BcArtifactSource[sourceChoiceStr as keyof typeof types.BcArtifactSource];

        const pickedBaseVersion = await showArtifactVersionQuickPick(null);
        if (!pickedBaseVersion) { return; }
        versionForDownloadAndConfig = pickedBaseVersion;
    } else {
        try {
            artifactSource = await findArtifactVersionInOneOfTheSources(versionForDownloadAndConfig!);
        } catch (error: any) {
            // Failed to find a valid source for the provided version:
            vscode.window.showErrorMessage(error.message || String(error));
            return;
        }
    }

    // If we still don't have a version string, let's exit:
    if (!versionForDownloadAndConfig) {
        ext.writeToOutputChannel("No version selected or determined for download.");
        return;
    }

    const artifactSourceCdnUrl = getBcArtifactsUrl(artifactSource, types.BcArtifactSourceEndpoint.CDN);
    const destinationPath = getLibrariesFolder(versionForDownloadAndConfig);

    const downloadParams: webApiClient.DownloadFilesFromRemoteZipParams = {
        url: `${artifactSourceCdnUrl}${versionForDownloadAndConfig}/platform`,
        destinationPath: destinationPath,
        extractionFilter: "(?i)Applications\\\\testframework\\\\TestRunner\\\\Internal\\\\.*\\.dll$"
    };

    try {
        await testRunnerClient.downloadFilesFromRemoteZipParams(downloadParams, `Downloading Client Session libraries for ${versionForDownloadAndConfig}`);
        if (!isWindowsPlatform()) {
            restoreDownloadedFileNames(destinationPath);
        }
        setALTestRunnerConfig('selectedBcVersion', versionForDownloadAndConfig);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to download libraries for ${versionForDownloadAndConfig}: ${error.message || String(error)}`);
    }
}

function restoreDownloadedFileNames(folderPath: string): void {
    try {
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                const lastBackslashIndex = file.lastIndexOf('\\');
                if (lastBackslashIndex >= 0) {
                    const newName = file.slice(lastBackslashIndex + 1);
                    const newPath = path.join(folderPath, newName);
                    fs.copyFileSync(filePath, newPath);
                    fs.unlinkSync(filePath);
                    ext.writeToOutputChannel(`Renamed: ${file} -> ${newName}`);
                }
            }
        }
    } catch (error) {
        ext.writeToOutputChannel(`'An error occurred during file restore: ${error}`);
    }
}