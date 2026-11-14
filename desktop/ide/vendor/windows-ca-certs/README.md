This folder stands in for the Windows-only native module `@vscode/windows-ca-certs`, which needs Visual Studio to build.

`build/Release/crypt32.node` is an EMPTY placeholder. The IDE bundler (Theia's esbuild step) looks for that file by name on Windows and fails when it is missing. Nothing loads it: `index.js` is plain JavaScript and returns an empty certificate list, so Node's bundled certificates are used.
