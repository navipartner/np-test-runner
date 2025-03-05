using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace NaviPartner.ALTestRunner.Integration
{
    public class ALTestRunnerConfig
    {
        // The name of the launch configuration to test against
        public string launchConfigName { get; set; }

        // The name of the attach configuration to debug test against
        public string attachConfigName { get; set; }

        // The path to save details of code coverage to
        // e.g. .//.npaltestrunner//codecoverage.json
        public string codeCoveragePath { get; set; }

        // The culture to run tests with. Defaults to en-US.
        public string culture { get; set; }

        // Selected BC version to load specific libraries.
        public string selectedBcVersion { get; set; }
    }
}
