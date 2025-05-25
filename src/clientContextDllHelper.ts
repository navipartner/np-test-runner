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
        const jsonData: Array<{ Version: string, [key: string]: any }> = await response.json() as Array<{ Version: string, [key: string]: any }>;
        if (!Array.isArray(jsonData)) {
            ext.writeToOutputChannel(`Invalid JSON structure from ${requestUrl}: Expected an array.`, true);
            return [];
        }
        let versions: string[] = jsonData.map(item => item.Version);
        if (filter) {
            versions = versions.filter(v => v.startsWith(filter));
        }
        return versions;
    } catch (error: any) {
        ext.writeToOutputChannel(`Error fetching or parsing versions from ${requestUrl}: ${error.message || String(error)}`, true);
        return [];
    }
}

async function validateOnPremArtifactVersion(versionWithOptionalCountry: string): Promise<boolean> {
    const baseVersion = versionWithOptionalCountry.split('/')[0];
    // Ensure we always use OnPrem source for validation
    const onPremSourceUrl = getBcArtifactsUrl(types.BcArtifactSource.OnPrem, types.BcArtifactSourceEndpoint.CDN);
    const versionsFound = await fetchVersions(onPremSourceUrl, baseVersion);

    // Check if the exact version (with country) or the base version exists in the fetched list
    if (versionsFound && versionsFound.some(v => v === versionWithOptionalCountry || (v === baseVersion && !versionWithOptionalCountry.includes('/')))) {
        return true;
    } else {
        throw new Error(`No OnPrem Business Central artifacts found for version ${versionWithOptionalCountry} (checked for base version ${baseVersion}).`);
    }
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
            resolve(undefined); // Resolve with undefined if hidden without selection
            quickPick.dispose();
        });

        quickPick.show();
    });
}

// This function will now only be called with artifactSource = OnPrem
async function showArtifactVersionQuickPick(initialVersions: string[] | null, artifactSource: types.BcArtifactSource): Promise<string | undefined> {
    const quickPick = vscode.window.createQuickPick();
    if (initialVersions) {
        quickPick.items = initialVersions.map(version => ({ label: version }));
    }
    quickPick.placeholder = 'Type BC version [major.minor] (at least 3 chars) to start loading and filtering ...';

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
                    await updateVersionPicker(quickPick, value, artifactSource);
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

async function updateVersionPicker(versionPicker: vscode.QuickPick<vscode.QuickPickItem>, filter: string, artifactSource: types.BcArtifactSource): Promise<void> {
    const baseUrl = getBcArtifactsUrl(artifactSource, types.BcArtifactSourceEndpoint.BLOB);
    let fetchedVersions = await fetchVersions(baseUrl, filter);
    versionPicker.items = fetchedVersions.map(version => ({ label: version }));
}

export function getBcArtifactsUrl(artifactsSource: types.BcArtifactSource, artifactsSourceEndpoint: types.BcArtifactSourceEndpoint) : string {
    if (artifactsSource !== types.BcArtifactSource.OnPrem) {
        throw new Error(`Unsupported artifact source type: ${artifactsSource}. Only OnPrem is currently supported.`);
    }

    switch (artifactsSourceEndpoint) {
        case types.BcArtifactSourceEndpoint.BLOB:
            return 'https://bcartifacts.blob.core.windows.net/onprem/';
        case types.BcArtifactSourceEndpoint.CDN:
            return 'https://bcartifacts-exdbf9fwegejdqak.b02.azurefd.net/onprem/';
        default:
            throw new Error(`Not supported artifact source endpoint type: ${artifactsSourceEndpoint} for OnPrem source.`);
    }
}

export function getLibrariesFolder(version: string): string {
	const extPath = getExtension()!.extensionPath;
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
    const artifactSource: types.BcArtifactSource = types.BcArtifactSource.OnPrem;

    if (!isVersionInitiallyProvided) {
        ext.writeToOutputChannel("No initial version provided. Prompting for OnPrem artifact version.", false);
        const pickedBaseVersion = await showArtifactVersionQuickPick(null, artifactSource);
        if (!pickedBaseVersion) { 
            ext.writeToOutputChannel("User did not select an OnPrem version.", false);
            return;
        }
        versionForDownloadAndConfig = pickedBaseVersion;
        ext.writeToOutputChannel(`User selected OnPrem version: ${versionForDownloadAndConfig}`, false);
    } else {
        try {
            ext.writeToOutputChannel(`Initial version provided: ${versionForDownloadAndConfig}. Validating against OnPrem artifacts...`, false);
            await validateOnPremArtifactVersion(versionForDownloadAndConfig!); 
            ext.writeToOutputChannel(`Version ${versionForDownloadAndConfig} is valid for OnPrem.`, false);
        } catch (error: any) {
            const errorMessage = error.message || String(error);
            ext.writeToOutputChannel(`Error validating provided OnPrem version ${versionForDownloadAndConfig}: ${errorMessage}`, true);
            vscode.window.showErrorMessage(errorMessage);
            return;
        }
    }

    if (!versionForDownloadAndConfig) {
        ext.writeToOutputChannel("No OnPrem version selected or determined for download. Aborting library download.", true);
        return;
    }

    ext.writeToOutputChannel(`Proceeding to download libraries for OnPrem version: ${versionForDownloadAndConfig}`, false);
    const artifactSourceCdnUrl = getBcArtifactsUrl(artifactSource, types.BcArtifactSourceEndpoint.CDN); 
    const destinationPath = getLibrariesFolder(versionForDownloadAndConfig);

    const downloadParams: webApiClient.DownloadFilesFromRemoteZipParams = {
        url: `${artifactSourceCdnUrl}${versionForDownloadAndConfig}/platform`,
        destinationPath: destinationPath,
        extractionFilter: "(?i)Applications\\\\testframework\\\\TestRunner\\\\Internal\\\\.*\\.dll$"
    };
    
    ext.writeToOutputChannel(`[OnPrem Download] Attempting to download from URL: ${downloadParams.url}`, false);
    ext.writeToOutputChannel(`[OnPrem Download] Destination path: ${downloadParams.destinationPath}`, false);
    ext.writeToOutputChannel(`[OnPrem Download] Extraction filter: ${downloadParams.extractionFilter}`, false);

    try {
        await testRunnerClient.downloadFilesFromRemoteZipParams(downloadParams, `Downloading Client Session libraries for OnPrem ${versionForDownloadAndConfig}`);
        if (!isWindowsPlatform()) {
            restoreDownloadedFileNames(destinationPath);
        }
        setALTestRunnerConfig('selectedBcVersion', versionForDownloadAndConfig);
        ext.writeToOutputChannel(`Successfully downloaded and configured OnPrem version ${versionForDownloadAndConfig}.`, false);
        vscode.window.showInformationMessage(`Successfully downloaded Client Session libraries for OnPrem version ${versionForDownloadAndConfig}.`);
    } catch (error: any) {
        const downloadErrorMessage = `Failed to download libraries for OnPrem ${versionForDownloadAndConfig}: ${error.message || String(error)}`;
        ext.writeToOutputChannel(downloadErrorMessage, true);
        vscode.window.showErrorMessage(downloadErrorMessage);
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
                    ext.writeToOutputChannel(`Restored/Renamed: ${file} -> ${newName}`);
                }
            }
        }
    } catch (error: any) {
        ext.writeToOutputChannel(`An error occurred during file name restoration: ${error.message || String(error)}`, true);
    }
}