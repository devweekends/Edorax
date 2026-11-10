// Local stand-in for @vscode/windows-ca-certs. The real module is a native Windows build
// that needs Visual Studio. With an empty store, the IDE keeps Node's bundled CA list.
class Crypt32 {
  next() { return undefined; }
  done() {}
}
module.exports = { Crypt32 };
