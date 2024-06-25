using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace NaviPartner.ALTestRunner
{
    public class TestResult
    {
        public string Name { get; set; }
        public string CodeUnit { get; set; }
        public String StartTime { get; set; }
        public String FinishTime { get; set; }
        public string Result { get; set; }
        public List<TestMethodResult> TestResults { get; set; }
    }
}
