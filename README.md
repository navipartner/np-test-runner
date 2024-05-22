# NaviPartner AL Test Runner

NaviPartner AL Test Runner is based on [James Pearsons`s AL Test Runner](https://github.com/jimmymcp/al-test-runner). It intends to leverage the existing foundation providing great integration with VS Code environment, mainly everything that is AL development related:

- Run tests
- Debug tests
- Enable code coverage to see which lines are covered by your tests
- See which tests call methods in your codeunits and tables


At the same time, the new version tries to cover more scenarios and also simplify the overall concept. The main changes are:

 - Possibility to invoke tests against any NST running basically anywhere. Main reason we needed a new tool was fact, we don't run containers locally but we use orchestrator. And BcContainerHelper doesn't support these environments, unfortunately. So the original AL test runner doesn't allow us to run tests against our containers either.
 - Because we use direct approach via Client Session (which uses connection via standard web interface) we remove [BcContainerHelper](https://github.com/microsoft/navcontainerhelper) from the project. It's not essentially necessary to run the extension.
 - As a part of the flexibility this version offers also possiblity to run tests against SaaS Sandboxes. This approach doesn't require any proxy container.
 - We try to simplify configurations and reused the benefits of the built-in credential cache provided by [AL Language extension for Microsoft Dynamics 365 Business Central](https://marketplace.visualstudio.com/items?itemName=ms-dynamics-smb.al). This means users don't have to keep credentials in a separate configuration file, authentications happens automatically once they were authenticated during AL development.


## Requirements
- A Business Central Docker container that you can publish your extension into and run your tests against. As of v0.2.0, Docker can either be running locally or on a remote server. If remote, you must be able to execute PowerShell commands against the host with ps-remoting.
- Alternatively you can use VS Code remote development to execute local PowerShell commands on the host with this extension installed on the host 
- [PWSH 7.0 or higher](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows?view=powershell-7.4#installing-the-msi-package)
- [AL Language extension](https://marketplace.visualstudio.com/items?itemName=ms-dynamics-smb.al) for VS Code


## Credits

We reuse huge part of the work provided by [James Pearson](https://github.com/jimmymcp) in his [AL Test Runner](https://github.com/jimmymcp/al-test-runner) project. So kudos to James for all the energy he put to the project, he crafted the only AL oriented test runner tool available on the market these days.