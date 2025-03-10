using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace NaviPartner.ALTestRunner
{
    public enum TestContext
    {
        [Description("All")]
        All = 0,
        [Description("Codeunit")]
        Codeunit = 1,
        [Description("Test")]
        Test = 2
    }
}
