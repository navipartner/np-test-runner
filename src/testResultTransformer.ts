import { parseString } from 'xml2js';
import { promisify } from 'util';

export interface XUnitTest {
    $: {
        name: string;
        type?: string;
        method: string;
        time: string;
        result: string;
    };
    failure?: {
        message: string;
        'stack-trace': string;
    }[];
}

export interface XUnitCollection {
    $: {
        name: string;
        total: string;
        passed: string;
        failed: string;
        skipped: string;
    };
    test: XUnitTest[];
}

export interface XUnitAssembly {
    $: {
        name: string;
        'x-code-unit': number;
        'test-framework': string;
        'run-date': string;
        'run-time': string;
        total: string;
        passed: string;
        failed: string;
        skipped: string;
        time: string;
    };
    collection: XUnitCollection[];
}

export interface XUnitResult {
    assemblies: {
        assembly: XUnitAssembly[];
    };
}

export interface JUnitTestCase {
    $: {
        name: string;
        classname: string;
        time: string;
    };
    failure?: {
        $: {
            message: string;
        };
        _: string;
    }[];
}

export interface JUnitTestSuite {
    $: {
        name: string;
        tests: string;
        failures: string;
        errors: string;
        skipped: string;
        time: string;
    };
    testcase: JUnitTestCase[];
}

interface JUnitResult {
    testsuites: {
        testsuite: JUnitTestSuite[];
    };
}

export interface TestResult {
    method: string;
    codeUnit: string | null;
    startTime: string;
    finishTime: string;
    result: string;
    message: string | null;
    stackTrace: string | null;
}

export interface TestRun {
    name: string;
    codeUnit: string;
    startTime: string;
    finishTime: string;
    result: string;
    testResults: TestResult[];
}

export class TestResultsTransformer {
    static parseJson(json: string): TestRun[] {
        return JSON.parse(json);
    }

    public static async convertTestResultsToXUnitResults(testRunResults: TestRun[]): Promise<any> {
        const results = await TestResultsTransformer.deserializeXUnit(await TestResultsTransformer.transformToXUnit(testRunResults));
        if ((results) && (results.assemblies) && (results.assemblies.assembly)) {
            return results.assemblies.assembly;
        } else {
            return results;
        }
    }

    public static async transformToXUnit(testRuns: TestRun[]): Promise<string> {
        if (testRuns && testRuns.filter !== undefined) {
            const assemblies = testRuns.filter(trs => trs.testResults != null).map(testRun => {
                const totalTests = testRun.testResults.length;
                const passedTests = testRun.testResults.filter(t => t.result !== "1").length;
                const failedTests = totalTests - passedTests;
    
                const assembly = {
                    _attributes: {
                        name: testRun.name,
                        "test-framework": "xUnit.net",
                        "run-date": new Date(testRun.startTime).toISOString().split('T')[0],
                        "run-time": new Date(testRun.startTime).toISOString().split('T')[1].split('.')[0],
                        total: totalTests.toString(),
                        passed: passedTests.toString(),
                        failed: failedTests.toString(),
                        skipped: "0",
                        time: ((new Date(testRun.finishTime).getTime() - new Date(testRun.startTime).getTime()) / 1000).toString()
                    },
                    collection: {
                        _attributes: {
                            name: testRun.codeUnit,
                            total: totalTests.toString(),
                            passed: passedTests.toString(),
                            failed: failedTests.toString(),
                            skipped: "0"
                        },
                        test: testRun.testResults.map(testResult => {
                            const test: any = {
                                _attributes: {
                                    name: testResult.method,
                                    type: testRun.codeUnit,
                                    method: testResult.method,
                                    time: ((new Date(testResult.finishTime).getTime() - new Date(testResult.startTime).getTime()) / 1000).toString(),
                                    result: testResult.result === "1" ? "Fail" : "Pass"
                                }
                            };
    
                            if (testResult.result === "1") {
                                test.failure = {
                                    message: { _text: testResult.message || "" },
                                    "stack-trace": { _text: testResult.stackTrace || "" }
                                };
                            }
    
                            return test;
                        })
                    }
                };
    
                return { assembly };
            });
    
            return this.jsonToXml({ assemblies });
        } else {
            return "";
        }
    }

    public static async transformToJUnit(testRuns: TestRun[]): Promise<string> {
        const testsuites = testRuns.filter(trs => trs.testResults != null).map(testRun => {
            const totalTests = testRun.testResults.length;
            const failedTests = testRun.testResults.filter(t => t.result === "1").length;

            const testsuite = {
                _attributes: {
                    name: testRun.name,
                    tests: totalTests.toString(),
                    failures: failedTests.toString(),
                    errors: "0",
                    skipped: "0",
                    time: ((new Date(testRun.finishTime).getTime() - new Date(testRun.startTime).getTime()) / 1000).toString()
                },
                testcase: testRun.testResults.map(testResult => {
                    const testcase: any = {
                        _attributes: {
                            name: testResult.method,
                            classname: testRun.codeUnit,
                            time: ((new Date(testResult.finishTime).getTime() - new Date(testResult.startTime).getTime()) / 1000).toString()
                        }
                    };

                    if (testResult.result === "1") {
                        testcase.failure = {
                            _attributes: {
                                message: testResult.message || ""
                            },
                            _text: testResult.stackTrace || ""
                        };
                    }

                    return testcase;
                })
            };

            return { testsuite };
        });

        return this.jsonToXml({ testsuites });
    }

    static async deserializeXUnit(xml: string): Promise<XUnitResult> {
        const parseXml = promisify(parseString);
        try {
            const result = await parseXml(xml);
            return result as XUnitResult;
        } catch (error) {
            console.error('Error parsing XUnit XML:', error);
            throw error;
        }
    }

    static async deserializeJUnit(xml: string): Promise<JUnitResult> {
        const parseXml = promisify(parseString);
        try {
            const result = await parseXml(xml);
            return result as JUnitResult;
        } catch (error) {
            console.error('Error parsing JUnit XML:', error);
            throw error;
        }
    }

    private static jsonToXml(obj: any): string {
        const convert = (obj: any): string => {
            if (obj === null || obj === undefined) {
                return '';
            }

            let xml = '';
            for (const prop in obj) {
                if (obj[prop] === null || obj[prop] === undefined) {
                    continue;
                }

                if (Array.isArray(obj[prop])) {
                    for (const item of obj[prop]) {
                        xml += convert({ [prop]: item });
                    }
                } else if (typeof obj[prop] === 'object') {
                    xml += `<${prop}${obj[prop]._attributes ? ' ' + Object.entries(obj[prop]._attributes).map(([k, v]) => `${k}="${v}"`).join(' ') : ''}>`;
                    xml += obj[prop]._text !== undefined ? obj[prop]._text : convert(obj[prop]);
                    xml += `</${prop}>`;
                } else {
                    xml += `<${prop}>${obj[prop]}</${prop}>`;
                }
            }
            return xml;
        };

        return `<?xml version="1.0" encoding="UTF-8"?>${convert(obj)}`;
    }
}