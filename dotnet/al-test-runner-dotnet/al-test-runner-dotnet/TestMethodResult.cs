using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace NaviPartner.ALTestRunner
{
    public class TestMethodResult
    {
        public string Method { get; set; }
        public string CodeUnit { get; set; }
        public string StartTime { get; set; }
        public string FinishTime { get; set; }
        public string Result { get; set; }
        public string Message { get; set; }
        public string StackTrace { get; set; }
    }
}
