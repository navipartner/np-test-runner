import * as fs from 'fs';
import * as path from 'path';

/**
 * Convert Business Central coverage data to JSON format for VSCode
 * @param bcCoverageFilePath - Path to BC coverage file
 * @param alProjectRootPath - Root path of your AL project
 * @param outputPath - Path to save the JSON file
 */
export function convertBCCoverageToJSON(
  bcCoverageFilePath: string,
  alProjectRootPath: string,
  outputPath: string
): void {
  // Read the BC coverage file
  const bcCoverageData = fs.readFileSync(bcCoverageFilePath, 'utf8');
  const coverageLines = bcCoverageData.trim().split('\n');
  
  // Create a map to group coverage data by object
  interface ObjectCoverage {
    objectType: string;
    objectId: string;
    lines: Record<string, number>;
  }
  
  const objectCoverage: Record<string, ObjectCoverage> = {};
  
  // Parse each line of coverage data
  coverageLines.forEach(line => {
    // Column format: ObjectType,ObjectID,LineNumber,Unknown,HitCount
    const [objectType, objectId, lineNumber, unknown, hitCount] = line.split(',');
    
    const key = `${objectType}_${objectId}`;
    if (!objectCoverage[key]) {
      objectCoverage[key] = {
        objectType,
        objectId,
        lines: {}
      };
    }
    
    // Store line coverage data
    objectCoverage[key].lines[lineNumber] = parseInt(hitCount);
  });
  
  // Function to find the file path for an object
  function findFilePath(objectType: string, objectId: string): string {
    // This is a simplified approach - you may need to adjust based on your project structure
    const objectTypeFolder = objectType.toLowerCase() + 's'; // e.g., 'tables', 'codeunits'
    const possiblePaths = [
      path.join(alProjectRootPath, objectTypeFolder, `${objectType}_${objectId}.al`),
      path.join(alProjectRootPath, `${objectType}_${objectId}.al`),
      path.join(alProjectRootPath, objectTypeFolder, `${objectId}.al`),
      // Add more possible patterns as needed
    ];
    
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    
    // If file not found, return a placeholder path
    return path.join(alProjectRootPath, `${objectType}_${objectId}.al`);
  }
  
  // Define interfaces for the JSON coverage format
  interface Position {
    line: number;
    column: number;
  }
  
  interface StatementMap {
    start: Position;
    end: Position;
  }
  
  interface FileCoverage {
    path: string;
    statementMap: Record<string, StatementMap>;
    fnMap: Record<string, any>;
    branchMap: Record<string, any>;
    s: Record<string, number>;
    f: Record<string, number>;
    b: Record<string, any>;
  }
  
  // Build JSON coverage format
  const jsonCoverage: Record<string, FileCoverage> = {};
  
  Object.values(objectCoverage).forEach(obj => {
    const filePath = findFilePath(obj.objectType, obj.objectId);
    
    // Convert to VSCode-compatible JSON format
    jsonCoverage[filePath] = {
      path: filePath,
      statementMap: {},
      fnMap: {},
      branchMap: {},
      s: {},
      f: {},
      b: {}
    };
    
    // Add statement mapping
    Object.keys(obj.lines).forEach((lineNumber, idx) => {
      const statementId = idx.toString();
      jsonCoverage[filePath].statementMap[statementId] = {
        start: { line: parseInt(lineNumber), column: 0 },
        end: { line: parseInt(lineNumber), column: 100 }
      };
      // Map the line number to statement index
      jsonCoverage[filePath].s[statementId] = obj.lines[lineNumber];
    });
  });
  
  // Write to JSON file
  fs.writeFileSync(outputPath, JSON.stringify(jsonCoverage, null, 2));
  console.log(`JSON coverage file generated at: ${outputPath}`);
  
  // Also create a summary JSON file that VSCode extensions often expect
  const summaryJson = {
    total: Object.keys(jsonCoverage).length,
    covered: Object.keys(jsonCoverage).length,
    skipped: 0
  };
  
  fs.writeFileSync(
    path.join(path.dirname(outputPath), 'coverage-summary.json'),
    JSON.stringify(summaryJson, null, 2)
  );
  console.log(`Summary JSON file generated at: ${path.join(path.dirname(outputPath), 'coverage-summary.json')}`);
}

// Example usage
// convertBCCoverageToJSON('bc-coverage.txt', '/path/to/al/project', 'coverage.json');